# Several instruments (S-09) — Implementation Plan

## Overview

The student (Uczeń) can add more instruments to the on-device Profile, picks the
instrument when logging a practice session (preselected to the last used one, and
no picker at all while there is only one), and sees practice stats per instrument
and combined. A Dzień z muzyką (and therefore the weekly goal of S-03) keeps
counting any session on any instrument. No IndexedDB migration: the
`instruments` store from S-01 already holds any number of rows and every
practice already carries `instrumentId`.

## Current State Analysis

- `instruments` store exists since v2 with `keyPath: 'id'` and was explicitly
  prepared for S-09 (`src/storage/migrations.ts:25-31`). No new store or index
  is needed.
- `ProfileStore.load()` reads all instrument rows but returns only the oldest as
  `profile.instrument` (`src/profile/profileStore.ts:86-96`); there is no way
  to add an instrument after `create()` (`src/profile/profileStore.ts:28-33`).
- Every practice already stores `instrumentId` (`src/practice/practiceStore.ts:12-21`),
  validated non-empty only (`:69`).
- `lastDuration()` already finds the latest session by `byDay` cursor + `createdAt`
  (`src/practice/practiceStore.ts:117-126`); the same lookup yields the last
  used instrument.
- The week view (`listWeek`, `src/practice/practiceStore.ts:111-115`), the month
  view and the lifetime total (`src/month/monthStore.ts:41-57`) never filter by
  instrument, so Dni z muzyką are already instrument-independent; the lifetime
  total is already the "combined" figure.
- `ProfileScreen` passes the single `profile.instrument.id` to `LogPractice`
  (`src/profile/ProfileScreen.tsx:74-77`) and shows `profile.instrument` in the
  header and on the Progress Card (`:64-71`, `:107`).
- `LogPractice` takes one `instrumentId` prop (`src/practice/LogPractice.tsx:20-26`).
- `App.tsx` holds the loaded `Profile` in state and mounts the home-screen cards
  (`src/App.tsx:63-69`).
- Fake `ProfileStore` literals in `src/App.test.tsx:82,112` and a fake
  `PracticeStore` in `src/practice/LogPractice.test.tsx:6-12` must follow any
  interface change.
- Instrument presets and icons live in `src/profile/instruments.ts:7-23`; the
  create-profile picker (`src/profile/CreateProfileScreen.tsx:71-112`) is the
  UI pattern to reuse for adding an instrument.

## Desired End State

- A "Moje instrumenty" toggle card on the home screen lists the student's
  instruments, each with its own Dni z muzyką and practice time, and (with two
  or more instruments) a combined "Razem" line; it offers "Dodaj instrument"
  with the same preset buttons as profile creation plus "Inny".
- With two or more instruments the log panel shows a row of instrument chips,
  preselected to the instrument of the most recent session (else the first
  instrument); saving without touching it records that instrument. With one
  instrument the panel looks and taps exactly as today.
- The home-screen header shows the last used instrument.
- A day with sessions on two instruments is one Dzień z muzyką in the week,
  month and lifetime views.

### Key discoveries

- No schema change is needed (`src/storage/migrations.ts:28-31`).
- Last-used instrument can be derived from the practices log
  (`src/practice/practiceStore.ts:117-126`); no extra persisted field.
- Combined stats equal the existing lifetime semantics
  (`src/month/monthStore.ts:48-57`): distinct days, summed minutes.

## What we're NOT doing

- No IndexedDB migration or version bump.
- No renaming, deleting or reordering instruments; no editing past sessions.
- No change to the month view (`src/month/**`) or the Progress Card model
  (`src/progress-card/**`); the card keeps one instrument name (the last used).
- No per-instrument weekly goal; nothing in S-03's scope.
- No change to reminders (S-08) or `src/push/**`, `src/practice-time/**`.
- No deploy.

## Implementation Approach

Keep the data layer where it already is: `ProfileStore` owns the `instruments`
store, so it gains `instruments` on the loaded Profile and an `addInstrument`
method (one readwrite transaction that checks the profile exists, the name is
valid, not a duplicate and under the limit). `PracticeStore` gains
`lastPractice()` (the record behind `lastDuration()`), so the home screen gets
both the last duration and the last instrument from one query. Stats live in a
new read-only module `src/instruments/` (pure grouping function + a store that
scans `practices` once, like `monthStore.lifetime`), plus the new
`InstrumentsCard` UI. The log-panel picker lives in `LogPractice` because it is
part of the save form.

Alternatives rejected: persisting a `lastInstrumentId` on the profile record
(a second source of truth that can drift from the log, and a write per save);
a new instrument-indexed store or `byInstrument` index (a migration for a scan
the lifetime total already does cheaply); a separate profile/settings screen
(no routing exists; a toggle card follows the MonthCard / PracticeTimeCard
pattern and keeps `App.tsx` edits to a mount line).

Merge-conflict containment with S-03/S-08: `App.tsx` gets one import, one
mounted element and an `onAdded` callback that updates `state.profile`;
`ProfileScreen.tsx` changes only its header instrument, the last-practice
effect and the `LogPractice` props, and leaves the `WeekView` /
`ShareCardButton` area structurally as it is.

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Several instruments with per-instrument and combined stats | 1-4 | — | yes | in-progress | — |

## Critical Implementation Details

- **10-second log.** With one instrument `LogPractice` renders no instrument
  group at all (no extra element, no extra tap). With several, the chip of the
  default instrument is `aria-checked=true` before any tap; saving immediately
  uses it.
- **Default instrument.** `instrumentId` of `lastPractice()` if that id is still
  among the profile's instruments, else the oldest instrument. After a save the
  screen's default becomes the instrument just used.
- **Shared Dzień z muzyką.** No query in week, month or lifetime may filter by
  `instrumentId`; a regression test pins this (two instruments, same day →
  one music day).
- **Combined vs. sum.** "Razem" days are distinct days across all instruments,
  so they can be fewer than the sum of the per-instrument days; minutes are the
  plain sum. Sessions whose `instrumentId` matches no instrument count only in
  "Razem".
- **Copy** (Polish, encouraging, no comparison between instruments): toggle
  "Moje instrumenty", add button "Dodaj instrument", add confirm "Dodaj",
  log-panel group label "Na czym grałeś?", combined prefix "Razem:"; per-row
  text reuses `musicDaysLabel` and `formatDuration` from `src/month/month.ts`.
  An instrument with no sessions yet shows a neutral "Jeszcze przed Tobą"
  line, never a zero in red.

## Phase 1: Data layer — instrument list, add, last practice

### Overview
The Profile exposes all instruments and can gain one; the practice log can name
the last used instrument.

### Required changes
#### 1. Profile store
- **File**: `src/profile/profileStore.ts`
- **Goal**: return every instrument and let the student add one.
- **Contract**:
  - `Profile` gains `instruments: Instrument[]`, oldest first; `instrument`
    stays (the oldest) so existing consumers keep working.
  - `ProfileStore.addInstrument(name: string): Promise<Instrument>`; trims the
    name, rejects with `ProfileError('invalid', reason)` for
    `instrument-empty`, `instrument-too-long`, `instrument-duplicate`
    (case-insensitive match with an existing name), `instrument-limit`
    (`MAX_INSTRUMENTS = 6` reached); rejects with a new code `missing` when no
    profile exists. Check and insert run in one readwrite transaction over
    `profile` + `instruments`.
  - `ProfileInputReason` gains the two new reasons; export `MAX_INSTRUMENTS`
    and a `validateInstrumentName(name, existing)` helper the UI uses to enable
    its confirm button.
- **File**: `src/profile/index.ts` — export the new names.
- **File**: `src/profile/profileStore.test.ts` — cover load with several
  instruments (sorted), add happy path, each rejection, persistence across a
  new store instance.

#### 2. Practice store
- **File**: `src/practice/practiceStore.ts`
- **Goal**: expose the most recent session so the UI derives the default
  instrument and duration from one query.
- **Contract**: `PracticeStore.lastPractice(): Promise<Practice | null>` (latest
  day, then latest `createdAt`); `lastDuration()` stays and delegates to it.
- **File**: `src/practice/practiceStore.test.ts` — `lastPractice` empty /
  latest across days / latest within a day.

#### 3. Test fakes
- **File**: `src/App.test.tsx`, `src/practice/LogPractice.test.tsx`
- **Goal**: fake stores implement the widened interfaces; no behaviour change.

### Success criteria
#### Automated
- `pnpm test src/profile/profileStore.test.ts src/practice/practiceStore.test.ts` passes, including the new add/reject and lastPractice cases
- `pnpm typecheck` passes
#### Manual
- None.

## Phase 2: Per-instrument and combined stats (read-only)

### Overview
A pure stats function and a read-only store that turn the practices log into
per-instrument and combined totals.

### Required changes
#### 1. Stats model
- **File**: `src/instruments/stats.ts`
- **Goal**: group practice records by instrument.
- **Contract**: `instrumentStats(instruments: Instrument[], practices: {instrumentId, day, durationMinutes}[]): { perInstrument: { instrument: Instrument; musicDays: number; minutes: number }[]; combined: { musicDays: number; minutes: number } }`; `perInstrument` in the order of `instruments`; `combined.musicDays` counts distinct days over all records (unknown ids included).
- **File**: `src/instruments/stats.test.ts` — same-day sessions on two instruments give 1 combined day and 1 day each; unknown id counts only in combined; empty log gives zeros.

#### 2. Stats store
- **File**: `src/instruments/statsStore.ts`
- **Goal**: read every practice once (as `monthStore.lifetime` does) and return the stats; writes nothing, adds no index.
- **Contract**: `createIndexedDbStatsStore(open?: OpenConnection): { stats(instruments: Instrument[]): Promise<InstrumentStats> }`.
- **File**: `src/instruments/statsStore.test.ts` — against fake-indexeddb with sessions on two instruments.

#### 3. Module surface and copy
- **File**: `src/instruments/copy.ts`, `src/instruments/index.ts`
- **Goal**: Polish texts listed under Critical Implementation Details; public exports of the module.

### Success criteria
#### Automated
- `pnpm test src/instruments` passes
- `pnpm typecheck` passes
#### Manual
- None.

## Phase 3: Instrument choice when logging

### Overview
The log panel offers the instruments only when there are several, preselected
to the last used one; the home screen tracks and shows the last used instrument.

### Required changes
#### 1. Log panel
- **File**: `src/practice/LogPractice.tsx`
- **Goal**: let the student pick the instrument without adding a tap in the common case.
- **Contract**: props `instruments: Instrument[]` and `initialInstrumentId: string` replace `instrumentId`. When `instruments.length > 1`, render a `radiogroup` labelled "Na czym grałeś?" of chips (icon + name, `instrumentIcon`), above the duration chips, with the initial one checked; when 1, render nothing extra. `store.add` receives the selected id.
- **File**: `src/practice/copy.ts` — add `INSTRUMENT_LABEL`.
- **File**: `src/practice/LogPractice.test.tsx` — one instrument: no instrument radiogroup, save uses its id; two instruments: default checked, immediate save uses the default, picking the other saves the other.

#### 2. Home screen
- **File**: `src/profile/ProfileScreen.tsx`
- **Goal**: compute the default instrument and show it.
- **Contract**: replace the `lastDuration()` effect with one `lastPractice()` effect that sets both the last duration and the last instrument id (kept only if it is in `profile.instruments`, else `profile.instrument.id`); header and `ShareCardButton` show the current default instrument; `onSaved` updates it to `practice.instrumentId`. Week view and share button placement unchanged.
- **File**: `src/App.test.tsx` — adjust the `lastDuration` spy test to `lastPractice`; add: two instruments, a session today on each → the week shows one Dzień z muzyką for today; the header shows the last used instrument after reload.

### Success criteria
#### Automated
- `pnpm test src/practice/LogPractice.test.tsx src/App.test.tsx` passes, including the one-instrument "no picker" and two-instrument "default preselected" cases
- Regression test: sessions on two instruments on the same day count as one Dzień z muzyką in the week view
- `pnpm typecheck` passes
#### Manual
- On a phone with two instruments, logging with the preselected instrument still takes at most 3 taps and about 10 seconds

## Phase 4: "Moje instrumenty" card and wiring

### Overview
The student sees per-instrument and combined stats and adds instruments from
the home screen.

### Required changes
#### 1. Instruments card
- **File**: `src/instruments/InstrumentsCard.tsx`
- **Goal**: toggle card (same pattern as `MonthCard`: closed by default, reads fresh at every opening, retry on failure) listing each instrument with icon, name, `musicDaysLabel` and `formatDuration` (or the neutral empty line), a "Razem:" line when there are 2+ instruments, and "Dodaj instrument" (hidden at `MAX_INSTRUMENTS`).
- **Contract**: props `instruments: Instrument[]`, `profileStore: ProfileStore`, `onAdded(instrument: Instrument): void`, optional `statsStore` for tests.
- **File**: `src/instruments/AddInstrumentForm.tsx`
- **Goal**: preset buttons from `INSTRUMENT_PRESETS` minus the ones already owned, plus "Inny" with free text; "Dodaj" enabled only when `validateInstrumentName` passes; on success calls `onAdded` and closes; on failure shows `RETRY_MESSAGE`.
- **File**: `src/instruments/InstrumentsCard.test.tsx` — renders per-instrument and combined stats; adding an instrument calls `onAdded` and lists it; owned presets are not offered; the add button disappears at the limit.
- **File**: `src/instruments/index.ts` — export `InstrumentsCard`.

#### 2. App wiring
- **File**: `src/App.tsx`
- **Goal**: mount the card on the profile screen and keep the Profile in state current.
- **Contract**: one import; `<InstrumentsCard instruments={state.profile.instruments} profileStore={store} onAdded={…} />` next to `MonthCard`; `onAdded` appends the instrument to `state.profile.instruments`. Nothing else in `App.tsx` changes.

#### 3. End-to-end
- **File**: `e2e/instruments.spec.ts`
- **Goal**: create a profile with Gitara, add Pianino from the card, log a session choosing Pianino, reload offline: the log panel preselects Pianino, the card shows Pianino with 1 day and Razem with 1 day.

### Success criteria
#### Automated
- `pnpm test` passes (full unit suite)
- `pnpm lint && pnpm typecheck` passes
- `pnpm build` succeeds
- `pnpm test:e2e e2e/instruments.spec.ts e2e/practice.spec.ts` passes
#### Manual
- On a phone, the "Moje instrumenty" card is readable for a 7-year-old: large chips, per-instrument lines and the Razem line fit without horizontal scrolling

## Testing Strategy

- Unit (Vitest + fake-indexeddb, as in existing store tests): profile store add
  and validation, `lastPractice`, the pure stats function, the stats store.
- Component (Vitest + Testing Library): `LogPractice` picker visibility and
  default, `InstrumentsCard` stats and add flow, `App` regression for the shared
  Dzień z muzyką and header instrument.
- E2E (Playwright): the full add → choose → reload-offline path, and the
  existing 3-tap practice spec must stay green unchanged (one-instrument path).

## Performance Notes

The stats store scans `practices` once per card opening, like the lifetime
total; at a few sessions a day this stays small for years. No index is added.

## Migration Notes

None. The database version stays at `migrations.length` (5); existing devices
with one instrument row read as a one-instrument list.

## References

- Roadmap slice S-09: `context/foundation/roadmap.md`
- PRD FR-009: `context/prd/prd.md:91-93`
- Storage contract: `src/storage/migrations.ts`
- Prior changes: `context/archive/2026-10-11-profil-i-instrument`,
  `context/archive/2026-10-11-zapis-cwiczenia`,
  `context/archive/2026-10-11-widok-miesiaca`,
  `context/archive/2026-10-11-karta-postepu`

## Progress

### Phase 1: Data layer — instrument list, add, last practice
#### Automated
- [x] 1.1 `pnpm test src/profile/profileStore.test.ts src/practice/practiceStore.test.ts` passes, including the new add/reject and lastPractice cases
- [x] 1.2 `pnpm typecheck` passes
#### Manual

### Phase 2: Per-instrument and combined stats (read-only)
#### Automated
- [ ] 2.1 `pnpm test src/instruments` passes
- [ ] 2.2 `pnpm typecheck` passes
#### Manual

### Phase 3: Instrument choice when logging
#### Automated
- [ ] 3.1 `pnpm test src/practice/LogPractice.test.tsx src/App.test.tsx` passes, including the one-instrument "no picker" and two-instrument "default preselected" cases
- [ ] 3.2 Regression test: sessions on two instruments on the same day count as one Dzień z muzyką in the week view
- [ ] 3.3 `pnpm typecheck` passes
#### Manual
- [ ] 3.4 On a phone with two instruments, logging with the preselected instrument still takes at most 3 taps and about 10 seconds

### Phase 4: "Moje instrumenty" card and wiring
#### Automated
- [ ] 4.1 `pnpm test` passes (full unit suite)
- [ ] 4.2 `pnpm lint && pnpm typecheck` passes
- [ ] 4.3 `pnpm build` succeeds
- [ ] 4.4 `pnpm test:e2e e2e/instruments.spec.ts e2e/practice.spec.ts` passes
#### Manual
- [ ] 4.5 On a phone, the "Moje instrumenty" card is readable for a 7-year-old: large chips, per-instrument lines and the Razem line fit without horizontal scrolling
