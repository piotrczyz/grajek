# Log a practice session with the current-week view — Implementation Plan

## Overview
Roadmap slice S-02 (north star): from the home screen the student (Uczeń) logs a practice session (Ćwiczenie) in at most 3 taps, fully offline. The duration is required; "nad czym pracowałem" (a short note) and an emoji are optional and collapsed by default. The home screen shows the current Monday-to-Sunday week, with days that have at least one session (Dzień z muzyką) highlighted and empty days neutral. The change also adds the connection lifecycle that S-01 review F2 asked the v3 slice to deliver, so an open tab no longer blocks a schema upgrade.

## Current State Analysis
- Schema: an append-only list, version = `migrations.length` (`src/storage/db.ts:21-35`). v1 is empty and v2 creates `profile` and `instruments` (`src/storage/migrations.ts:18-28`). The rule is documented in the file header (`migrations.ts:3-7`).
- `openDb` passes only an `upgrade` callback to `idb.openDB` (`src/storage/db.ts:28-34`). It has no `blocking`, `blocked` or `terminated` handling: this is S-01 review F2 (`context/archive/2026-10-11-profil-i-instrument/reviews/impl-review-inc-1.md:61-72`).
- The profile store caches one connection promise for the page lifetime and drops it only when opening fails (`src/profile/profileStore.ts:84-95`). It never notices a connection that was closed later.
- Rolling back this change by redeploying the S-01 build is not safe on its own: that build opens at version 2 (`db.ts:28`), so on a device already at v3 it gets `VersionError` and shows the retry screen (`src/App.tsx:30-32`, `:62-80`).
- The home screen is `ProfileScreen` (greeting, instrument icon and name) and holds no actions (`src/profile/ProfileScreen.tsx:8-20`). `App` switches screens on profile state and takes an injectable `store` prop for tests (`src/App.tsx:9-19`).
- The profile has exactly one instrument, `profile.instrument.id` (`src/profile/profileStore.ts:12-22`). The v2 comment already says "S-02 references a row by its `id`" (`migrations.ts:23-25`).
- Tests: Vitest + jsdom + `fake-indexeddb` (`src/storage/db.test.ts:1`, `src/App.test.tsx:1`). Playwright e2e covers offline reloads against `vite preview` (`e2e/profile.spec.ts:10-35`, `playwright.config.ts:24-30`). `db.test.ts:13-17` and `:44-46` assert version 2 and two migrations, so they must move to 3.
- No `context/foundation/lessons.md` exists.

## Desired End State
- A returning student sees the home screen: greeting, instrument, a large "Zagrałem!" button, and a 7-day row for the current week (Pn–Nd) with today marked.
- Tap 1 "Zagrałem!" opens the log panel. Tap 2 picks a duration chip. Tap 3 "Zapisz" saves. The last used duration is preselected (15 min on first use), so 2 taps are often enough. "Dodaj więcej" expands the optional note and emoji. These extra taps are optional and never required.
- After saving, the panel closes, a short encouraging confirmation shows, and today's cell is highlighted. A second session on the same day keeps one highlighted day.
- Everything works in airplane mode and survives a reload, online and offline.
- A tab holding an older connection closes it when another tab or a newer build upgrades the database. The next store call reopens transparently.

### Key discoveries
- Version = list length, so parallel slices that append a migration collide on the version number (`src/storage/db.ts:28`).
- The connection cache in `profileStore.ts:84-95` is the pattern F2 flags. A second store must not copy it.
- `instrumentIcon` (`src/profile/instruments.ts:24-26`) is reusable for the home screen.

## What we're NOT doing
- Weekly goal or "N z M" progress (S-03), month view and total tally (S-04), badges (S-05), share card (S-06), choosing among several instruments (S-09), reminders (S-08).
- Editing or deleting a logged session; logging for a past day; free-form duration input.
- Navigating to previous or next weeks.
- Any network, sync or export.
- Handling `blocked` beyond the default wait: an S-01 tab, which runs code without the new handler, can still hold the first v3 upgrade until it is closed or reloaded (see Migration Notes).

## Implementation Approach
One area, one increment, four phases ordered by dependency: storage contract, then practice domain, then logging UI, then week view and e2e.

- **Storage.** Append migration v3: a `practices` store (keyPath `id`) with a `byDay` index on `day`. `openDb` gains lifecycle handling:
  - On `blocking` (another context wants a newer version) and on `terminated`, it closes the connection and marks it closed.
  - On `VersionError` (the device database is newer than this build's list) it retries once without a version and without `upgrade`. A rolled-back build then keeps working with its known stores. This is safe only while migrations stay additive.
  - A shared cached-connection helper in `src/storage` reopens after a close or a failed open. Both the profile store and the new practice store use it, which fixes F2 once instead of per store.
- **Alternatives.** Leaving the per-store caches and letting the UI show the retry message (rejected: breaks the offline 10-second flow). Computing the day at read time from `createdAt` (rejected: a past Dzień z muzyką would move when the device's time zone changes, and every reader would repeat the conversion). One record per day (rejected: needs a read-modify-write and fits per-session note/emoji badly). Both storage choices were consulted.
- **Domain.** A `PracticeStore` (`add`, `listWeek`) over the helper. The `day` key comes from the local calendar date (`getFullYear/getMonth/getDate`), never from `toISOString()`. Week math (Monday start, 7 day keys) lives in pure functions with an injectable clock.
- **UI.** `ProfileScreen` becomes the home screen. A `LogPractice` panel opens in place, with no router and no modal library, matching how `App` already switches views. `WeekView` is a pure component fed by `listWeek`. `App` takes an optional `practiceStore` prop the same way it takes `store`.

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Practice logging with the current-week view | 1-4 | — | yes | done | — |

## Critical Implementation Details
- **Day key.** `day` is the local date at save time as `YYYY-MM-DD`, built from local date parts. A unit test must cover a time just after local midnight in a non-UTC zone, for example by running a test with `TZ=Europe/Warsaw` or by building the `Date` from local parts, and assert that the key is the local date.
- **Week.** Monday to Sunday (Polish convention). `weekDays(now)` returns 7 day keys. `listWeek(now)` queries `byDay` with `IDBKeyRange.bound(monday, sunday)`.
- **Today rollover.** The home screen recomputes "now" when the page becomes visible again (`visibilitychange`), so a PWA left open overnight shows the new day and the new week.
- **Tap budget.** Exactly 3 taps from the home screen to a saved session in the worst case: open, pick duration, save. The optional fields sit behind a collapsed toggle, and saving never requires them.
- **Duration chips.** 5, 10, 15, 20, 30, 45, 60 minutes. The last used value is remembered in memory for the session and read back from the latest record on load. With no record it defaults to 15.
- **Emoji.** A fixed set of five non-judgemental emoji, defined in copy. Tone is only encouraging (PRD NFR Czytelność). The note is trimmed and limited to 80 characters; an empty note is not stored.
- **Lifecycle.** The `blocking` handler must call `db.close()` synchronously. The shared helper checks a "closed" flag that `openDb` sets, and does not wait for an error. The `VersionError` fallback catches only `error.name === 'VersionError'` and retries once.

## Phase 1: Storage contract — schema v3 and connection lifecycle
### Overview
Adds the `practices` store and makes connections safe across upgrades and rollbacks (S-01 review F2).

### Required changes
#### 1. Migration v3
- **File**: `src/storage/migrations.ts`
- **Goal**: append the third entry, which creates the store for practice sessions. Never touch v1 or v2.
- **Contract**: `migrations[2]` creates object store `practices` with keyPath `id` and index `byDay` on `day` (non-unique). A comment names S-02 and the additive-only rule the fallback relies on: no later migration may delete or rename an existing store or index.

#### 2. Connection lifecycle in openDb
- **File**: `src/storage/db.ts`
- **Goal**: close on `blocking` and `terminated`; fall back on `VersionError`.
- **Contract**: `openDb(options)` keeps its signature and test overrides. A returned connection is closed and flagged when another context requests a newer version, or when the browser terminates it. The flag is exposed as `isClosed(db): boolean`, or an equivalent exported predicate. When `idb.openDB(name, list.length)` rejects with `VersionError`, it retries once with `openDB(name)` (no version, no upgrade) and returns that connection with the same handlers.

#### 3. Shared cached connection
- **File**: `src/storage/connection.ts` (new), `src/storage/index.ts`
- **Goal**: one reusable lazy connection that reopens after a close or a failed open.
- **Contract**: `createConnection(open = () => openDb()): () => Promise<IDBPDatabase<unknown>>`. It returns the cached connection while it is open. It opens anew when there is none, when the cached one is flagged closed, or after a rejected open (failures are not cached). Exported from `src/storage/index.ts`.

#### 4. Profile store uses the helper
- **File**: `src/profile/profileStore.ts`
- **Goal**: replace the local cache (`:84-95`) with `createConnection(open)`. Behaviour and the `open` injection signature stay the same.
- **Contract**: `createIndexedDbProfileStore(open?)` is unchanged.

#### 5. Tests
- **File**: `src/storage/db.test.ts`, `src/storage/connection.test.ts` (new)
- **Goal**: move the shipped-migration assertions to version 3, and cover the upgrade, the lifecycle and the fallback.
- **Contract**:
  - A fresh database is at v3 with stores `instruments`, `practices` and `profile`. `practices` has keyPath `id` and index `byDay`.
  - A v2 database with a saved profile upgrades to v3 and keeps the profile.
  - Opening v3 while a v2 connection from `openDb` is open completes, and the old connection is flagged closed.
  - Opening with a shorter list than the device version returns a usable connection, through the `VersionError` fallback.
  - `createConnection` reopens after a close and after a failed open.

### Success criteria
#### Automated
- `pnpm test` passes, including the v3 schema, v2→v3 upgrade, blocking-close, VersionError fallback and reconnect tests
- `pnpm typecheck` passes
- `pnpm lint` passes
#### Manual
- None

## Phase 2: Practice domain — store and week math
### Overview
The data API the UI uses: save a session, read the current week.

### Required changes
#### 1. Week and day helpers
- **File**: `src/practice/week.ts` (new)
- **Goal**: pure date logic in local time.
- **Contract**:
  - `dayKey(date: Date): string` gives the local `YYYY-MM-DD`.
  - `weekDays(now: Date): string[]` gives 7 keys, Monday first.
  - `WEEKDAY_LABELS` holds `Pn, Wt, Śr, Cz, Pt, So, Nd`, with full Polish names for accessible labels.

#### 2. Practice store
- **File**: `src/practice/practiceStore.ts` (new), `src/practice/index.ts` (new)
- **Goal**: persist sessions and answer "which days of this week have music".
- **Contract**:
  - `interface Practice { id; instrumentId; durationMinutes; day; createdAt; note?; emoji? }`
  - `interface NewPractice { instrumentId; durationMinutes; note?; emoji? }`
  - `interface PracticeStore { add(input: NewPractice): Promise<Practice>; listWeek(now?: Date): Promise<Practice[]>; lastDuration(): Promise<number | null> }`
  - `createIndexedDbPracticeStore(open?, now = () => new Date())` is built on `createConnection`.
  - Validation: `durationMinutes` must be an integer from 1 to 600. The note is trimmed, limited to 80 characters, and dropped when empty. `emoji` must be one of the fixed set. Invalid input rejects with `PracticeError('invalid', reason)`.
  - `DURATION_CHOICES` and `PRACTICE_EMOJI` are exported constants.

#### 3. Tests
- **File**: `src/practice/week.test.ts` (new), `src/practice/practiceStore.test.ts` (new)
- **Goal**: cover the date edges and the persistence.
- **Contract**:
  - `dayKey` uses local parts. A time just after local midnight maps to the local date, not the UTC one.
  - `weekDays` on a Sunday and on a Monday returns the right Monday to Sunday.
  - `add` then `listWeek` returns the session. Sessions from the previous and next week are excluded. Two sessions on one day are both returned.
  - Validation rejects 0, 601, a non-integer, a note longer than 80 characters and an unknown emoji.
  - `lastDuration` returns the latest record's duration, or `null`.

### Success criteria
#### Automated
- `pnpm test` passes, including week math and practice store tests
- `pnpm typecheck` passes
- `pnpm lint` passes
#### Manual
- None

## Phase 3: Logging flow on the home screen
### Overview
The 3-tap flow: open, pick a duration, save, with collapsed optional fields.

### Required changes
#### 1. Copy
- **File**: `src/practice/copy.ts` (new)
- **Goal**: Polish, encouraging texts.
- **Contract**: button "Zagrałem!", panel heading "Ile grałeś?", the minutes label for each chip, toggle "Dodaj więcej", note label "Nad czym pracowałem?", emoji group label "Jak było?", save button "Zapisz", a cancel button, confirmation "Super! Zapisane.", and a save-failure message that reuses `RETRY_MESSAGE`.

#### 2. Log panel
- **File**: `src/practice/LogPractice.tsx` (new)
- **Goal**: an in-place panel with duration chips as a `radiogroup`, the last used duration preselected, a collapsed "Dodaj więcej" section (note input of at most 80 characters and an emoji `radiogroup`) and "Zapisz".
- **Contract**:
  - Props: `{ store: PracticeStore; instrumentId: string; initialDuration: number; onSaved(p: Practice): void; onCancel(): void }`.
  - "Zapisz" is disabled while saving. On failure the panel stays open with an alert.
  - Touch targets are at least `min-h-14`, matching `CreateProfileScreen`.

#### 3. Home screen and App wiring
- **File**: `src/profile/ProfileScreen.tsx`, `src/App.tsx`
- **Goal**: the home screen shows "Zagrałem!" under the greeting and instrument, toggles the panel, and shows the confirmation after a save. `App` creates or accepts the practice store and passes it down.
- **Contract**:
  - `App({ store?, practiceStore? })`.
  - `ProfileScreen({ profile, practiceStore })`. On mount it loads `lastDuration()` (default 15).
  - The first-launch screen and the existing App tests stay unchanged.

#### 4. Tests
- **File**: `src/App.test.tsx`, `src/practice/LogPractice.test.tsx` (new)
- **Goal**: prove the tap budget and the optional fields.
- **Contract**:
  - From the home screen: click "Zagrałem!", click a chip, click "Zapisz". That is 3 `fireEvent.click` calls, after which the store holds one session with that duration and the instrument id.
  - With the preselected duration, 2 clicks save it.
  - The note and emoji are hidden until "Dodaj więcej". When filled in, they are stored.
  - A failed save shows the alert and keeps the panel.

### Success criteria
#### Automated
- `pnpm test` passes, including the 3-tap save test and the optional-fields test
- `pnpm typecheck` passes
- `pnpm lint` passes
#### Manual
- On a phone, logging a session from the home screen takes about 10 seconds and the buttons are easy to hit for a child

## Phase 4: Current-week view and end-to-end check
### Overview
Shows this week's Dni z muzyką on the home screen and proves the whole flow offline.

### Required changes
#### 1. Week view
- **File**: `src/practice/WeekView.tsx` (new), `src/practice/index.ts`
- **Goal**: 7 cells, Monday to Sunday. A day with at least one session is highlighted (filled amber with a note icon). An empty day is neutral (translucent white, never red). Today is outlined.
- **Contract**:
  - Props: `{ days: string[]; musicDays: ReadonlySet<string>; today: string }`.
  - Semantics: a `list` with the accessible name "Ten tydzień". Each item has an accessible label "<pełna nazwa dnia>: Dzień z muzyką" or "<pełna nazwa dnia>", plus "(dziś)" for today.
  - No counter, goal or totals.

#### 2. Home screen integration
- **File**: `src/profile/ProfileScreen.tsx`
- **Goal**: load `listWeek(now)` on mount and after each save, and recompute `now` on `visibilitychange`. Render `WeekView` below the button.
- **Contract**: after `onSaved`, today's cell becomes a Dzień z muzyką without a reload.

#### 3. Tests
- **File**: `src/practice/WeekView.test.tsx` (new), `src/App.test.tsx`, `e2e/practice.spec.ts` (new)
- **Goal**: highlighting rules, a live update, and offline persistence.
- **Contract**:
  - The unit test renders the highlighted and neutral days, and asserts that no empty day carries the music class or label.
  - The App test: after a save, today's item is labelled Dzień z muzyką. A second save the same day still yields exactly one highlighted day.
  - The e2e test creates a profile, goes offline once the service worker controls the page, logs a session in 3 taps, reloads offline, and today is still highlighted. It follows the pattern of `e2e/profile.spec.ts:10-35`.

### Success criteria
#### Automated
- `pnpm test` passes, including week view and same-day-once tests
- `pnpm test:e2e` passes, including the offline log-and-reload test
- `pnpm build` succeeds
- `pnpm typecheck` passes
- `pnpm lint` passes
#### Manual
- In airplane mode on a phone, a logged session shows today highlighted in the week and empty days look neutral, not red

## Testing Strategy
- Unit (Vitest + `fake-indexeddb`): migrations and lifecycle (Phase 1), date math and store (Phase 2), components and App flows with `@testing-library/react` (Phases 3-4).
- E2E (Playwright, mobile Chromium against `vite preview`): offline log and reload (Phase 4). The existing `offline`, `installability` and `profile` specs must stay green.
- Manual: the timing and child-friendliness feel on a real phone, which only a human can judge.

## Performance Notes
- `listWeek` is one index range query over at most a handful of rows. The home screen renders immediately and the week fills in after the query, so no loading spinner is needed.

## Migration Notes
- **v3 is additive.** It adds a new `practices` store with a `byDay` index. Existing `profile` and `instruments` data is untouched and stays readable, covered by the v2→v3 test.
- **Rollback.**
  - Preferred: deploy a build that reverts the UI but keeps migration v3 in the list (`git revert` of the feature files except `src/storage/migrations.ts`, or keep the whole storage phase). Devices at v3 open normally and the `practices` data stays on the device for redeploy.
  - From this build on, the `VersionError` fallback in `openDb` also makes a plain redeploy of an older build safe, as long as no migration ever deletes or renames a store or index.
  - Redeploying the S-01 build itself (which predates the fallback) on a v3 device fails with `VersionError` and shows the retry screen. Do not use it as the rollback.
- **First upgrade and old tabs.** A tab still running the S-01 build has no `blocking` handler, so it can delay the very first v3 upgrade until that tab is closed or reloaded. The PWA's `autoUpdate` service worker reloads on the next start (`src/main.tsx`), so the window is short. From v3 on, every tab closes on `blocking`.
- **Parallel migrations (F-02, S-07).** The version is the list length, so two slices appending "v3" collide. Whoever merges second must rebase, move their migration after the merged one, update their version assertions (`db.test.ts`), and re-run the upgrade tests before any build ships. A device that ran a differently ordered list cannot be repaired, so never ship two builds with conflicting orders.

## References
- Roadmap slice S-02: `context/foundation/roadmap.md` (Slices, S-02)
- PRD: US-01 `context/prd/prd.md:52-60`, FR-005/FR-006 `:79-84`, NFRs `:100-108`, Business Logic `:110-118`
- Glossary: `context/discovery/glossary.md` (Ćwiczenie, Dzień z muzyką)
- S-01 review F2: `context/archive/2026-10-11-profil-i-instrument/reviews/impl-review-inc-1.md:61-72`
- Storage contract: `src/storage/db.ts`, `src/storage/migrations.ts`; profile store `src/profile/profileStore.ts`

## Progress

### Phase 1: Storage contract — schema v3 and connection lifecycle
#### Automated
- [x] 1.1 `pnpm test` passes, including the v3 schema, v2→v3 upgrade, blocking-close, VersionError fallback and reconnect tests — 270d661
- [x] 1.2 `pnpm typecheck` passes — 270d661
- [x] 1.3 `pnpm lint` passes — 270d661
#### Manual

### Phase 2: Practice domain — store and week math
#### Automated
- [x] 2.1 `pnpm test` passes, including week math and practice store tests — 301f555
- [x] 2.2 `pnpm typecheck` passes — 301f555
- [x] 2.3 `pnpm lint` passes — 301f555
#### Manual

### Phase 3: Logging flow on the home screen
#### Automated
- [x] 3.1 `pnpm test` passes, including the 3-tap save test and the optional-fields test — 8b4734c
- [x] 3.2 `pnpm typecheck` passes — 8b4734c
- [x] 3.3 `pnpm lint` passes — 8b4734c
#### Manual
- [ ] 3.4 On a phone, logging a session from the home screen takes about 10 seconds and the buttons are easy to hit for a child

### Phase 4: Current-week view and end-to-end check
#### Automated
- [x] 4.1 `pnpm test` passes, including week view and same-day-once tests — 7842e7d
- [x] 4.2 `pnpm test:e2e` passes, including the offline log-and-reload test — 7842e7d
- [x] 4.3 `pnpm build` succeeds — 7842e7d
- [x] 4.4 `pnpm typecheck` passes — 7842e7d
- [x] 4.5 `pnpm lint` passes — 7842e7d
#### Manual
- [ ] 4.6 In airplane mode on a phone, a logged session shows today highlighted in the week and empty days look neutral, not red
