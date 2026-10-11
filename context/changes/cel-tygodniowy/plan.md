# Weekly goal with a spare day and current-week progress — Implementation Plan

## Overview
Roadmap slice S-03 (FR-002, completes US-01): the student (Uczeń) picks a Cel tygodniowy of N days out of 7 (3 preselected, 3–4 marked as a good start, at most 6 so one spare day always remains), sees this week's progress "X z N dni" on the home screen right under the week row, and sees the goal marked as reached once N distinct Dni z muzyką are logged. A new week simply counts from zero with no message about the previous one. After 3 reached weeks in a row on the same goal, the card offers, once and without pressure, to try one more day; declining is one tap and the offer stays away for another 3 reached weeks. No currency, points or streaks (ADR 0002).

## Current State Analysis
- Home screen = `ProfileScreen` (`src/profile/ProfileScreen.tsx:15-126`). It already holds the current week's Dni z muzyką as `musicDays` (a set of day keys from `practiceStore.listWeek(now)`, `:39-53`), refreshes it after every save (`savedCount`, `:96`) and on `visibilitychange` (`:24-30`). `WeekView` is rendered last (`:124`). So "X" is `musicDays.size`, already live after a save; no new query is needed for the current week.
- `App.tsx` renders `ProfileScreen` and `PracticeTimeCard` in the profile branch (`src/App.tsx:67-70`) and passes `practiceStore` down. Mounting the goal card inside `ProfileScreen` leaves `App.tsx` untouched.
- Week math: `weekDays(now)` returns Monday-first local day keys, `dayKey(date)` the local `YYYY-MM-DD` (`src/practice/week.ts:14-25`), both exported from `src/practice/index.ts:15`. `weekDays(now)[0]` is a stable week identifier.
- `practiceStore.listWeek(when)` accepts any date (`src/practice/practiceStore.ts:126-130`), so past weeks for the raise suggestion are three calls on the existing interface; `practiceStore.ts` needs no change.
- Storage: schema is at v4 (`src/storage/migrations.ts:22-46`). The `profile` store was created with out-of-line keys (`migrations.ts:27`, `db.createObjectStore('profile')`), and `profileStore` reads and writes only the fixed key `current` (`src/profile/profileStore.ts:77,87,114`). A second fixed key in the same store is invisible to `profileStore.load`/`create`, so the goal fits in `profile` under key `weeklyGoal` with no migration. `createConnection` (`src/storage/connection.ts:14-31`) is the shared lazy connection.
- Card pattern to mirror: `PracticeTimeCard` creates its own store when none is injected, renders nothing on load failure, keeps the editor open and shows `RETRY_MESSAGE` on save failure (`src/practice-time/PracticeTimeCard.tsx:49-70`; `src/practice-time/practiceTimeStore.ts:38-58`).
- UI conventions: amber is the "good" colour, empty is neutral white/10, never red (`src/practice/WeekView.tsx:13-15`); large touch targets `min-h-14`/`min-h-20` (`PracticeTimeCard.tsx:37-47`).
- Tests: Vitest + jsdom + `fake-indexeddb`; App tests render the real IndexedDB stores (`src/App.test.tsx:1-12`, `:215-261`). E2E pattern with a fixed clock and offline reload: `e2e/practice-time.spec.ts:1-12`, `e2e/practice.spec.ts`.
- No `context/foundation/lessons.md`.

## Desired End State
- A student with no goal sees, under the week row, "Ustal cel tygodnia" with six large choices 1–6, where 3 is preselected and 3 and 4 carry a "dobry start" hint, plus one line "Jeden dzień zawsze zostaje na zapas." "Zapisz" stores it; the card switches to progress.
- With a goal of 4 in a week with 3 Dni z muzyką, the card reads "3 z 4 dni" (FR-002: after setting 4/7 in a fresh week it reads "0 z 4 dni"). Logging a session on a fourth distinct day flips it, without a reload, to an amber "Cel osiągnięty!" marker with "W tym tygodniu: 4 dni z muzyką". A second session the same day changes nothing.
- On Monday the card counts from 0 again. Nothing mentions last week, a miss, or a failure.
- After 3 consecutive completed weeks reached on the current goal (weeks after the one in which the goal was set or changed) and with the goal below 6, the card adds a gentle offer "Świetnie Ci idzie! Chcesz spróbować N+1 dni?" with "Tak, spróbuję" and "Zostaję przy N". Either answer hides it; declining keeps it away until 3 more reached weeks.
- "Zmień" lets the student pick another goal (1–6) at any time; it applies to the current week at once.
- Works offline and survives a reload. A storage failure hides the card; logging still works.

### Key discoveries
- `musicDays` in `ProfileScreen` is exactly the current week's Dni z muzyką, already deduplicated per day (`ProfileScreen.tsx:43`), matching US-01 AC "kolejne zapisy tego dnia nie zwiększają licznika" (`context/prd/prd.md:59`).
- The out-of-line `profile` store accepts additional fixed keys without a schema change (`migrations.ts:27`; `profileStore.ts:87,114` touch only `current`).
- `listWeek` already takes any date (`practiceStore.ts:126`).

## What we're NOT doing
- No new object store, no migration, no change to `src/storage/**` (IndexedDB v5 = F-02, v7 = S-05; the v6 reserved for this slice is not needed).
- No change to `App.tsx`, `practiceStore.ts`, `WeekView.tsx` or `LogPractice.tsx`.
- No streaks, points, currency, a shown count of reached weeks, or a history view (ADR 0002; S-04 owns month and totals, S-05 owns badges that may later read reached weeks).
- No goal step in the first-run flow (`CreateProfileScreen`); the goal is set from the home screen.
- No per-instrument goals (S-09), no reminders tied to the goal (S-08), no goal of 7.
- No automatic raising and no lowering suggestion.

## Implementation Approach
One area (A1 cel-tygodniowy), one increment, three phases: pure domain plus store, then the card on the home screen, then the raise suggestion and the e2e check.

A new self-contained module `src/weekly-goal/` mirrors `src/practice-time/`: `weeklyGoal.ts` (pure rules), `weeklyGoalStore.ts` (persistence through `createConnection`), `copy.ts` (Polish texts), `WeeklyGoalCard.tsx`, `index.ts`. The goal is persisted as one record in the existing `profile` store under the fixed key `weeklyGoal`, so no migration is added and nothing collides with the parallel F-02 (v5) and S-05 (v7) migrations. A dedicated store would have needed a migration renumbered at merge time for one tiny record that never leaves the device, the same privacy class as the Profile.

The card is mounted inside `ProfileScreen`, directly below `WeekView`, receiving `musicDayCount` (`musicDays.size`), `now`, and the `practiceStore` it already has. This puts the progress "tuż po zapisie" where the PRD wants it (`prd.md:118`), reuses the live refresh after a save, and keeps `App.tsx` unchanged. The raise suggestion reads the three previous weeks with `practiceStore.listWeek`, so no new store method or cross-module store access is needed.

Alternatives rejected: storing the goal as a field of the Profile record (would modify `profileStore` load/create, which S-09 is likely to touch, and mixes concerns); mounting the card in `App.tsx` (needs the week counts lifted out of `ProfileScreen`, more churn); persisting a per-week "reached" log (extra writes and state that can drift; recomputing from practices is cheap and always right).

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Weekly goal with progress, reached marker and gentle raise offer | 1-3 | — | yes | pending | — |

## Critical Implementation Details
### Rules (single source: `weeklyGoal.ts`)
- Goal options are the integers 1..6 (`GOAL_MAX = 6`, the spare day), default 3, suggested 3 and 4. Anything else is rejected by validation and by the store.
- Reached = distinct Dni z muzyką in the Monday–Sunday week >= goal. Below the goal the card shows "X z N dni"; once reached it shows the marker plus "W tym tygodniu: X dni z muzyką", so "5 z 4" never shows.
- The raise offer is shown when all hold: goal < 6; the 3 completed weeks immediately before the current week each reached the current goal; each of those weeks starts strictly after `since` (the Monday of the week the goal was last set); and, if `raiseDeclinedWeek` is set, each also starts strictly after it. Accepting saves goal + 1 with `since` = current Monday and clears `raiseDeclinedWeek`; declining saves `raiseDeclinedWeek` = current Monday.
- "Fresh start" is structural: the card only ever reads the current week for progress, and there is no copy for a past or missed week. A copy test enforces the absence of failure wording.

### Timing
- The raise check runs on mount and when the current week changes (`weekDays(now)[0]`), not on every save; logging today cannot change a past week.
- A load failure of the goal hides the card; a failure loading past weeks hides only the offer. Neither blocks logging.

## Phase 1: Goal rules and persistence
### Overview
Pure rules and a store for the single weekly-goal record, without UI.

### Required changes
#### 1. Domain rules
- **File**: `src/weekly-goal/weeklyGoal.ts` (new)
- **Goal**: one place for options, validation, reached and raise rules so the card stays declarative.
- **Contract**:
  - `GOAL_OPTIONS: readonly number[]` = 1..6; `GOAL_MAX = 6`; `DEFAULT_GOAL = 3`; `SUGGESTED_GOALS = [3, 4]`; `RAISE_AFTER_WEEKS = 3`.
  - `interface WeeklyGoal { daysPerWeek: number; since: string; raiseDeclinedWeek?: string; updatedAt: string }` (`since` and `raiseDeclinedWeek` are Monday day keys `YYYY-MM-DD`).
  - `validateGoal(days: number): { ok: true; value: number } | { ok: false; reason: 'not-integer' | 'out-of-range' }`.
  - `isReached(musicDayCount: number, daysPerWeek: number): boolean`.
  - `weekStart(now: Date): string` = `weekDays(now)[0]` (imported from `src/practice/index.ts`).
  - `previousWeekStarts(now: Date, count: number): string[]` — Mondays of the `count` completed weeks before the current one, most recent first, built from local date parts (DST-safe, like `week.ts:19-24`).
  - `shouldOfferRaise(goal: WeeklyGoal, recentWeeks: { start: string; musicDayCount: number }[]): boolean` per the rules above.

#### 2. Store
- **File**: `src/weekly-goal/weeklyGoalStore.ts` (new)
- **Goal**: load and save the goal record in the existing `profile` object store under the fixed key `weeklyGoal`, through `createConnection` (`src/storage/connection.ts`).
- **Contract**:
  - `interface WeeklyGoalStore { load(): Promise<WeeklyGoal | null>; setGoal(days: number): Promise<WeeklyGoal>; declineRaise(): Promise<WeeklyGoal> }`.
  - `setGoal` validates (rejects with `WeeklyGoalError` code `invalid`), writes `since = weekStart(now())`, clears `raiseDeclinedWeek`, stamps `updatedAt`. `declineRaise` keeps the goal and writes `raiseDeclinedWeek = weekStart(now())`; it rejects with `WeeklyGoalError` code `missing` when no goal exists.
  - `createIndexedDbWeeklyGoalStore(open?: OpenConnection, now: () => Date = () => new Date())`.
  - A stored record whose `daysPerWeek` fails validation loads as `null` (defensive; the student just picks again).

#### 3. Profile store doc
- **File**: `src/profile/profileStore.ts`
- **Goal**: the header comment states that the `profile` store also holds the weekly goal under key `weeklyGoal`, owned by `src/weekly-goal/`.
- **Contract**: comment only, no code change.

#### 4. Module index and tests
- **File**: `src/weekly-goal/index.ts` (new), `src/weekly-goal/weeklyGoal.test.ts` (new), `src/weekly-goal/weeklyGoalStore.test.ts` (new)
- **Goal**: cover options 1..6 (0, 7 and 3.5 rejected), reached at exactly N, `previousWeekStarts` across a DST change and a year boundary, every branch of `shouldOfferRaise` (fewer than 3 weeks, one week not reached, a week not after `since`, a week not after `raiseDeclinedWeek`, goal 6 never offered); store round-trip on `fake-indexeddb`, `load` → `null` when empty, and coexistence: with a Profile and a goal saved, `createIndexedDbProfileStore().load()` still returns the same Profile.

### Success criteria
#### Automated
- `pnpm test` passes, including the weekly-goal rules and store tests (options 1..6 only, reached, raise rule, coexistence with the Profile)
- `pnpm typecheck` passes
- `pnpm lint` passes
- `git diff --name-only` for the change touches no file under `src/storage/`
#### Manual

## Phase 2: Goal card on the home screen
### Overview
Choosing the goal and seeing "X z N dni" and the reached marker right under the week row.

### Required changes
#### 1. Copy
- **File**: `src/weekly-goal/copy.ts` (new)
- **Goal**: Polish, encouraging, short texts; reuse `RETRY_MESSAGE` from `src/profile/copy.ts`.
- **Contract**: `SET_GOAL` "Ustal cel tygodnia", `GOAL_QUESTION` "Ile dni w tygodniu chcesz grać?", `SUGGESTED_HINT` "dobry start", `SPARE_DAY_NOTE` "Jeden dzień zawsze zostaje na zapas.", `progressLabel(count, goal)` → "<count> z <goal> dni", `REACHED` "Cel osiągnięty!", `reachedDays(count)` → "W tym tygodniu: <count> dni z muzyką" (Polish plural: 1 → "dzień"), `GOAL_LABEL` "Cel tygodnia", `CHANGE` "Zmień", `SAVE` "Zapisz", `CANCEL` "Anuluj". No wording about failure, missing, or losing.

#### 2. Card
- **File**: `src/weekly-goal/WeeklyGoalCard.tsx` (new)
- **Goal**: states `loading | failed | choose | progress`, mirroring `PracticeTimeCard`. `choose` shows a radiogroup "Ile dni w tygodniu chcesz grać?" with options 1–6 (min-h-14), 3 preselected (or the current goal when changing), 3 and 4 labelled with the hint, the spare-day note, "Zapisz" (and "Anuluj" when a goal already exists). `progress` shows the goal label, then either `progressLabel` (neutral style) or the amber `REACHED` marker with `reachedDays`, and "Zmień". Load failure renders nothing; save failure keeps the chooser and shows `RETRY_MESSAGE`.
- **Contract**: props `{ musicDayCount: number; now: Date; practiceStore: PracticeStore; store?: WeeklyGoalStore }`. The progress line has `role="status"` so the change after a save is announced.

#### 3. Mount
- **File**: `src/profile/ProfileScreen.tsx`
- **Goal**: render `<WeeklyGoalCard musicDayCount={musicDays.size} now={now} practiceStore={practiceStore} />` directly below `WeekView`; one import, one element, nothing else.
- **Contract**: no new props on `ProfileScreen`; `App.tsx` unchanged.

#### 4. Tests
- **File**: `src/weekly-goal/WeeklyGoalCard.test.tsx` (new), `src/weekly-goal/copy.test.ts` (new), `src/App.test.tsx`
- **Goal**: the card renders the chooser with 6 options and 3 checked, no option 7; saving 4 with 0 days shows "0 z 4 dni" (FR-002 AC); with count 3 it shows "3 z 4 dni"; at count 4 "Cel osiągnięty!"; the change flow; load failure renders nothing; save failure shows the retry text. App flow (real IndexedDB): set goal 1, log a session, the card shows "Cel osiągnięty!" without a reload; a second session the same day keeps the count at 1. Copy test: no string in `copy.ts` matches failure wording (e.g. `/porażk|nie udało|przegap|strac|niestety/i`).

### Success criteria
#### Automated
- `pnpm test` passes, including the card tests, the App goal-reached-after-save test and the no-failure-wording copy test
- `pnpm typecheck` passes
- `pnpm lint` passes
- `git diff --name-only e4e6ed3..HEAD` shows no change to `src/App.tsx`
#### Manual
- On a phone, the six goal buttons are easy to hit for a child and "3 z 4 dni" / "Cel osiągnięty!" read clearly under the week row

## Phase 3: Gentle raise offer and end-to-end check
### Overview
The no-pressure suggestion after 3 reached weeks, and an offline e2e proof of the whole goal flow.

### Required changes
#### 1. Raise offer in the card
- **File**: `src/weekly-goal/WeeklyGoalCard.tsx`, `src/weekly-goal/copy.ts`
- **Goal**: in `progress`, when the goal is below 6, load `practiceStore.listWeek` for each of `previousWeekStarts(now, 3)` (on mount and when `weekStart(now)` changes), count distinct days per week, and if `shouldOfferRaise` holds show a small, secondary-styled block below the progress: `raiseOffer(next)` → "Świetnie Ci idzie! Chcesz spróbować <next> dni?" with `RAISE_ACCEPT` "Tak, spróbuję" (calls `setGoal(next)`) and `raiseDecline(current)` → "Zostaję przy <current>" (calls `declineRaise()`). Both hide the block. A failed past-week load or save just hides the block.
- **Contract**: the offer never replaces or delays the progress line; it is never shown for goal 6 or without a goal; no count of reached weeks is displayed.

#### 2. Tests
- **File**: `src/weekly-goal/WeeklyGoalCard.test.tsx`, `e2e/weekly-goal.spec.ts` (new)
- **Goal**: card with a fake `PracticeStore`: three reached weeks after `since` → offer visible; accept → goal N+1 and offer gone; decline → offer gone and still gone after a re-mount in the same week; two reached weeks or goal 6 → no offer. E2E (fixed clock, pattern of `e2e/practice-time.spec.ts`): create a profile, set goal 4, see "0 z 4 dni", log a session, see "1 z 4 dni", go offline after the service worker controls the page, reload, still "1 z 4 dni".

### Success criteria
#### Automated
- `pnpm test` passes, including the raise offer accept, decline and not-offered tests
- `pnpm test:e2e` passes, including the weekly-goal offline reload test
- `pnpm build` succeeds
- `pnpm typecheck` passes
- `pnpm lint` passes
#### Manual
- On a phone, the raise offer reads as an invitation, not pressure, and "Zostaję przy N" is as easy to tap as "Tak, spróbuję"

## Testing Strategy
- Unit (Vitest + `fake-indexeddb`): rules and store (Phase 1), card and App flow with `@testing-library/react` (Phases 2–3), with fixed dates passed in so week boundaries are deterministic.
- E2E (Playwright against `vite preview`): goal set, progress after a log, offline reload (Phase 3). Existing specs must stay green.
- Manual: child-friendliness and tone on a real phone, which only a human can judge.

## Performance Notes
- Current-week progress costs nothing extra (reuses `musicDays`). The raise check is at most three small index range queries, once per week change, only when a goal below 6 exists.

## Migration Notes
- No schema change and no migration: the goal is a new record under the fixed key `weeklyGoal` in the existing `profile` store (v2). Nothing in `src/storage/` changes, so this branch neither uses nor collides with v5 (F-02) or v7 (S-05); the v6 reserved for this slice stays unused.
- Rollback: redeploy the previous build. It never reads the `weeklyGoal` key (`profileStore.ts` reads only `current`), so the extra record is harmless and is picked up again on redeploy.

## References
- Roadmap slice S-03: `context/foundation/roadmap.md` (Slices, S-03)
- PRD: US-01 `context/prd/prd.md:52-60`, FR-002 `:68-70`, NFRs `:102-107`, Business Logic `:110-118`
- Glossary: `context/discovery/glossary.md:19-20` (Cel tygodniowy)
- ADR 0002: `context/discovery/decisions/0002-grywalizacja-bez-waluty-i-rankingow.md`
- Code: `src/profile/ProfileScreen.tsx`, `src/practice/week.ts`, `src/practice/practiceStore.ts`, `src/practice-time/PracticeTimeCard.tsx`, `src/storage/connection.ts`, `src/storage/migrations.ts:27`

## Progress

### Phase 1: Goal rules and persistence
#### Automated
- [ ] 1.1 `pnpm test` passes, including the weekly-goal rules and store tests (options 1..6 only, reached, raise rule, coexistence with the Profile)
- [ ] 1.2 `pnpm typecheck` passes
- [ ] 1.3 `pnpm lint` passes
- [ ] 1.4 `git diff --name-only` for the change touches no file under `src/storage/`
#### Manual

### Phase 2: Goal card on the home screen
#### Automated
- [ ] 2.1 `pnpm test` passes, including the card tests, the App goal-reached-after-save test and the no-failure-wording copy test
- [ ] 2.2 `pnpm typecheck` passes
- [ ] 2.3 `pnpm lint` passes
- [ ] 2.4 `git diff --name-only e4e6ed3..HEAD` shows no change to `src/App.tsx`
#### Manual
- [ ] 2.5 On a phone, the six goal buttons are easy to hit for a child and "3 z 4 dni" / "Cel osiągnięty!" read clearly under the week row

### Phase 3: Gentle raise offer and end-to-end check
#### Automated
- [ ] 3.1 `pnpm test` passes, including the raise offer accept, decline and not-offered tests
- [ ] 3.2 `pnpm test:e2e` passes, including the weekly-goal offline reload test
- [ ] 3.3 `pnpm build` succeeds
- [ ] 3.4 `pnpm typecheck` passes
- [ ] 3.5 `pnpm lint` passes
#### Manual
- [ ] 3.6 On a phone, the raise offer reads as an invitation, not pressure, and "Zostaję przy N" is as easy to tap as "Tak, spróbuję"
