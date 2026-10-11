# Pora ćwiczeń (practice time) — Implementation Plan

## Overview
Delivers roadmap slice S-07 (FR-003): the student (Uczeń) sets a practice time ("when and where": a time of day and a place), optionally a different one for chosen weekdays, and sees today's practice time on the home screen. The data lives on the device in a dedicated IndexedDB store so S-08 (reminders) can later read it without touching Profile data. No notifications in this change.

## Current State Analysis
- The DB schema evolves only by appending to `migrations` (`src/storage/migrations.ts:1-9`); the version is `migrations.length` (`src/storage/db.ts:26`). Today: v1 empty, v2 creates `profile` (out-of-line keys) and `instruments` (`src/storage/migrations.ts:18-28`).
- `openDb` passes only an `upgrade` callback to `idb`'s `openDB` (`src/storage/db.ts:26-33`): no `blocking` / `terminated` handling. S-01 review finding F2 (`context/archive/2026-10-11-profil-i-instrument/reviews/impl-review-inc-1.md:61-72`) deferred that fix to "the slice that appends v3".
- `createIndexedDbProfileStore` caches one connection promise for the page lifetime and only resets it on open failure (`src/profile/profileStore.ts:84-95`); a connection closed by an upgrade elsewhere would stay cached.
- The `profile` store is documented as data that never leaves the device (`src/profile/profileStore.ts:1-8`); the PRD privacy NFR lets the practice time leave the device later (`context/prd/prd.md:106`), the name never.
- There is no router: `App` switches screens with a `ScreenState` union and renders `ProfileScreen` as the home screen once a profile exists (`src/App.tsx:9-13`, `src/App.tsx:57`).
- UI conventions: big touch targets (`min-h-14`, `rounded-2xl`), amber primary button, `role="radio"` buttons with `aria-checked` for choices, `RETRY_MESSAGE` alert on failure (`src/profile/CreateProfileScreen.tsx:13-19`, `src/profile/copy.ts:4`).
- Tests: Vitest + Testing Library + `fake-indexeddb/auto` with a unique DB name per test (`src/App.test.tsx:1-10`, `src/storage/db.test.ts:1-7`); Playwright e2e checks persistence across reload, online and offline (`e2e/profile.spec.ts`).

## Desired End State
- On the home screen, below the profile, a student without a practice time sees a large "Ustal porę ćwiczeń" button; a student with one sees today's slot, e.g. "Dziś: 17:00 · W domu", and a "Zmień" button.
- The editor asks "O której ćwiczysz?" (time) and "Gdzie ćwiczysz?" (place, prefilled "W domu"), and offers "Inna pora w wybrane dni": seven day toggles (Pn … Nd); each selected day gets its own time and place, prefilled from the default. "Zapisz" saves and returns to the card; "Anuluj" discards.
- On a weekday with an override, the card shows that day's time and place.
- The practice time survives a reload, also offline. A failed save shows the retry message and keeps the editor; a failed load hides the card without breaking the home screen.
- The first-run flow (create profile) is unchanged.

### Key discoveries
- Append-only migrations with version = list length: `src/storage/migrations.ts:4-9`, `src/storage/db.ts:26`.
- F2 location and deferral: `src/profile/profileStore.ts:84-95`, review `impl-review-inc-1.md:72`.
- Home screen mount point: `src/App.tsx:57`.
- Privacy split between profile data and practice time: `src/profile/profileStore.ts:4-7`, `context/prd/prd.md:106`.

## What we're NOT doing
- No notifications, push registration or server sync (S-08, F-02).
- No "no practice on this day" / plan-days flag; every weekday has a slot (default or override). S-08 adds limiting reminders to plan days if needed.
- No practice-time step in the first-run flow (roadmap S-07 risk: an extra start step lengthens first launch).
- No changes to `ProfileScreen`, `CreateProfileScreen` or the Profile data shape.
- No live update of "today" across midnight while the app stays open (visits last under 30 s, PRD NFR).
- No routing library.

## Implementation Approach
A new module `src/practice-time/` holds the domain (types, validation, "slot for a date"), an IndexedDB-backed store, and one self-contained `PracticeTimeCard` component that owns both the home-screen display and the editor. `App.tsx` gets a one-line mount of the card inside the profile branch, so home-screen churn stays minimal next to the parallel S-02 change.

Persistence uses a new object store `practiceTime` created by a new, appended migration v3 (one record under key `current`). The alternative of storing the record under a second key in the existing `profile` store needs no migration, but mixes data that may later leave the device (practice time) with data that must never leave it (the name); `rs-advisor` agreed on the dedicated store. Because this bumps the DB version, the same change fixes F2: `openDb` closes the connection when another connection needs to upgrade (`blocking`) or the browser terminates it, and a small shared connection helper drops its cached connection when that happens, so the next call reopens. The profile store switches to the helper; the practice-time store uses it from the start.

The editor is an inline state of the card (display ↔ edit) rather than a new App screen, which keeps `App`'s `ScreenState` untouched.

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Practice time: storage, editor and home-screen display | 1-4 | — | yes | in-progress | — |

## Critical Implementation Details

### Parallel changes and migration numbering
- F-02 and S-02 run in parallel and also append a migration (F-02 already has a v3 `device` store in its worktree). Append this change's entry at the end of the list; never edit existing entries. Whichever change merges second renumbers its entry by moving it below the other on rebase (no device has data beyond v2 yet). `db.test.ts` asserts the version as `migrations.length`-derived and checks the presence of `practiceTime`, not an exhaustive store list, so a rebase does not break it.
- F2 handling may also appear in a parallel change. Keep it small and confined to `src/storage/db.ts` and the new `src/storage/connection.ts`; the change that merges first owns it, the others drop their copy on rebase.

### Timing and weekday
- Weekday uses the device's local date (`Date#getDay`), mapped to ISO 1 (Mon) … 7 (Sun). The card computes "today" when it renders.

## Phase 1: Storage — migration v3 and connection lifecycle (F2)
### Overview
Adds the `practiceTime` object store and makes cached connections safe across version changes.

### Required changes
#### 1. Migration v3
- **File**: `src/storage/migrations.ts`
- **Goal**: append one migration that creates the `practiceTime` object store (out-of-line keys); comment it as `v3 "practice time" (S-07)`, noting the record may later be read by S-08 and contains no Profile data.
- **Contract**: `migrations.length` becomes 3 (or one more than the list at rebase time); existing entries untouched.

#### 2. Version-change handling in `openDb`
- **File**: `src/storage/db.ts`
- **Goal**: fix F2: when another connection wants to upgrade (`blocking`) the connection closes itself; when the browser terminates it (`terminated`) or it is closed this way, an optional callback tells the owner.
- **Contract**: `OpenDbOptions` gains `onClose?: () => void`, called once after the connection is closed because of `blocking` or `terminated`. Existing callers and options keep working.

#### 3. Shared lazy connection helper
- **File**: `src/storage/connection.ts` (new), `src/storage/index.ts`
- **Goal**: one place for "open lazily, reuse, retry after failure, reopen after close" instead of each store copying it.
- **Contract**: `createConnection(open?: (onClose: () => void) => Promise<IDBPDatabase<unknown>>): () => Promise<IDBPDatabase<unknown>>`; default `open` is `(onClose) => openDb({ onClose })`. The returned getter caches the promise, clears it when the open rejects and when `onClose` fires. Exported from `src/storage/index.ts`.

#### 4. Profile store uses the helper
- **File**: `src/profile/profileStore.ts`
- **Goal**: replace the local connection cache (`profileStore.ts:84-95`) with `createConnection`, so the profile store also reopens after a version change. Behaviour otherwise unchanged; the injected `open` parameter stays for tests (adapted to the helper's signature or wrapped).
- **Contract**: `createIndexedDbProfileStore(open?)` keeps its public shape; all existing profile tests pass unchanged.

#### 5. Tests
- **File**: `src/storage/db.test.ts`, `src/storage/connection.test.ts` (new)
- **Goal**: cover v3 and the lifecycle: fresh DB opens at `migrations.length` and contains `practiceTime`; a v2 database with data upgrades to v3 keeping its profile rows; opening a higher version from a second connection closes the first one (no `blocked` stall) and fires `onClose`; the helper reopens after `onClose` and after a failed open.

### Success criteria
#### Automated
- `pnpm test src/storage` passes, including the new v3 upgrade and `blocking`/`onClose` tests
- `pnpm test src/profile` passes unchanged
- `pnpm typecheck` and `pnpm lint` pass

## Phase 2: Practice-time domain and store
### Overview
The data shape, validation, "which slot applies on a date", and persistence.

### Required changes
#### 1. Domain model
- **File**: `src/practice-time/practiceTime.ts` (new)
- **Goal**: types and pure functions for the practice time, with no IndexedDB.
- **Contract**:
  - `type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7` (ISO, 1 = Monday).
  - `interface PracticeSlot { time: string /* "HH:MM", 24h */; place: string }`.
  - `interface PracticeTime { default: PracticeSlot; overrides: Partial<Record<Weekday, PracticeSlot>>; updatedAt: string }`.
  - `type NewPracticeTime = Omit<PracticeTime, 'updatedAt'>`.
  - `PLACE_MAX_LENGTH = 24`; `DEFAULT_SLOT = { time: '17:00', place: 'W domu' }`.
  - `validatePracticeTime(input): { ok: true; value: NewPracticeTime } | { ok: false; reason: 'time-invalid' | 'place-empty' | 'place-too-long' | 'weekday-invalid' }` — trims places, checks `^([01]\d|2[0-3]):[0-5]\d$`, checks every slot (default and overrides), rejects override keys outside 1-7.
  - `weekdayOf(date: Date): Weekday` (local date) and `slotFor(practiceTime, date): PracticeSlot` (override for that weekday, else default). S-08 reuses `slotFor`.

#### 2. Store
- **File**: `src/practice-time/practiceTimeStore.ts` (new), `src/practice-time/index.ts` (new)
- **Goal**: load and save the single practice-time record in the `practiceTime` store under key `current`, via `createConnection`.
- **Contract**: `interface PracticeTimeStore { load(): Promise<PracticeTime | null>; save(input: NewPracticeTime): Promise<PracticeTime> }`; `save` validates (rejects with `PracticeTimeError` code `invalid` and the reason), stamps `updatedAt`, and replaces the record (`put`); `createIndexedDbPracticeTimeStore(open?)` with the same test-injection pattern as the profile store. `index.ts` re-exports the public API.

#### 3. Tests
- **File**: `src/practice-time/practiceTime.test.ts`, `src/practice-time/practiceTimeStore.test.ts` (new)
- **Goal**: validation edge cases (24:00, 7:5, empty/long place, bad weekday key, trimming); `slotFor` on a weekday with and without override, including Sunday → 7; store round trip on a unique fake DB, save replaces the previous record, invalid input rejected without writing.

### Success criteria
#### Automated
- `pnpm test src/practice-time` passes
- `pnpm typecheck` and `pnpm lint` pass

## Phase 3: Practice-time card on the home screen
### Overview
The user-facing part: display of today's slot and the editor, mounted on the home screen.

### Required changes
#### 1. Copy
- **File**: `src/practice-time/copy.ts` (new)
- **Goal**: Polish texts in one place: "Ustal porę ćwiczeń", "Dziś:", "Zmień", "O której ćwiczysz?", "Gdzie ćwiczysz?", "Inna pora w wybrane dni", day labels Pn Wt Śr Cz Pt Sb Nd (accessible names "poniedziałek" … "niedziela"), "Zapisz", "Anuluj". Reuse `RETRY_MESSAGE` from `src/profile/copy.ts`.

#### 2. Card component
- **File**: `src/practice-time/PracticeTimeCard.tsx` (new)
- **Goal**: one component with three states: loading/failed (renders nothing), display (no practice time → "Ustal porę ćwiczeń" button; set → "Dziś: <time> · <place>" from `slotFor(pt, new Date())` plus "Zmień"), edit (time input `type="time"`, place text input with `maxLength` 24, day toggles as `aria-pressed` buttons; each pressed day shows its own labelled time and place inputs prefilled from the default; "Zapisz" disabled while invalid or saving; "Anuluj" returns to display). Save failure → `role="alert"` with `RETRY_MESSAGE`, editor kept. Follows the S-01 styling conventions (big touch targets, amber primary button).
- **Contract**: `PracticeTimeCard({ store?: PracticeTimeStore })`; default store `createIndexedDbPracticeTimeStore()` created once per mount. Exported from `src/practice-time/index.ts`.

#### 3. Mount on the home screen
- **File**: `src/App.tsx`
- **Goal**: render `<PracticeTimeCard />` right after `<ProfileScreen … />` in the `profile` branch, plus its import. No other change to `App`.
- **Contract**: home screen = profile + practice-time card; loading, create and load-failed states unchanged.

#### 4. Tests
- **File**: `src/practice-time/PracticeTimeCard.test.tsx` (new)
- **Goal**: with an injected store on a unique fake DB and a fixed system date (`vi.setSystemTime`): empty state shows the set button; setting 16:30 "U babci" shows "Dziś: 16:30 · U babci" and persists; adding an override for today's weekday shows the override instead; "Anuluj" discards edits; a rejecting `save` shows the retry alert and keeps the editor; a rejecting `load` renders nothing. Existing `src/App.test.tsx` passes unchanged.

### Success criteria
#### Automated
- `pnpm test` passes (whole suite, including `src/App.test.tsx` unchanged)
- `pnpm typecheck`, `pnpm lint` and `pnpm build` pass
#### Manual
- On a phone, the editor's time picker and day toggles are easy to use with a thumb and the card reads well under the profile

## Phase 4: End-to-end persistence
### Overview
Proves the practice time survives a reload online and offline in a real browser.

### Required changes
#### 1. E2E spec
- **File**: `e2e/practice-time.spec.ts` (new)
- **Goal**: create a profile, set a default practice time and an override for today's weekday, see today's override on the home screen, reload and see it again, then go offline (service worker controlling, same pattern as `e2e/profile.spec.ts`) and reload once more.

### Success criteria
#### Automated
- `pnpm test:e2e` passes, including `e2e/practice-time.spec.ts`

## Testing Strategy
- Unit (Vitest): domain validation and `slotFor`, store round trip, migration v3 upgrade from a populated v2 DB, `blocking`/`terminated` lifecycle and connection helper.
- Component (Testing Library): card states and editing flows with a fixed clock.
- E2E (Playwright): persistence across reload, online and offline.

## Migration Notes
- v3 only adds an empty `practiceTime` object store; existing `profile` and `instruments` data are untouched (covered by the v2 → v3 upgrade test).
- Rollback: revert the feature code (card, store, mount) in a new deploy but keep the v3 migration entry in the list. The empty or unused store is harmless and devices that already upgraded keep opening at v3. Never deploy a build whose `migrations` list is shorter than v3: `openDB` at a lower version than the device's DB fails with `VersionError`.
- The F2 handling lets an open tab release its connection when a newer build upgrades the DB, so the upgrade is not blocked.

## References
- Roadmap slice S-07: `context/foundation/roadmap.md:151-160`
- PRD FR-003 and privacy NFR: `context/prd/prd.md:71-73`, `context/prd/prd.md:106`
- Glossary "Pora ćwiczeń": `context/discovery/glossary.md:27-29`
- S-01 review F2: `context/archive/2026-10-11-profil-i-instrument/reviews/impl-review-inc-1.md:61-72`
- Key files: `src/storage/db.ts`, `src/storage/migrations.ts`, `src/profile/profileStore.ts`, `src/App.tsx`, `e2e/profile.spec.ts`

## Progress

### Phase 1: Storage — migration v3 and connection lifecycle (F2)
#### Automated
- [ ] 1.1 `pnpm test src/storage` passes, including the new v3 upgrade and `blocking`/`onClose` tests
- [ ] 1.2 `pnpm test src/profile` passes unchanged
- [ ] 1.3 `pnpm typecheck` and `pnpm lint` pass

### Phase 2: Practice-time domain and store
#### Automated
- [ ] 2.1 `pnpm test src/practice-time` passes
- [ ] 2.2 `pnpm typecheck` and `pnpm lint` pass

### Phase 3: Practice-time card on the home screen
#### Automated
- [ ] 3.1 `pnpm test` passes (whole suite, including `src/App.test.tsx` unchanged)
- [ ] 3.2 `pnpm typecheck`, `pnpm lint` and `pnpm build` pass
#### Manual
- [ ] 3.3 On a phone, the editor's time picker and day toggles are easy to use with a thumb and the card reads well under the profile

### Phase 4: End-to-end persistence
#### Automated
- [ ] 4.1 `pnpm test:e2e` passes, including `e2e/practice-time.spec.ts`
