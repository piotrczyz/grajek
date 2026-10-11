# Month view and lifetime total — Implementation Plan

## Overview
Roadmap slice S-04 (FR-006 month part, PRD Business Logic "łączny dorobek"): the student (Uczeń) can open one simple screen section showing the current month with every Dzień z muzyką highlighted and empty days neutral, a counter "Dni z muzyką w tym miesiącu", and the lifetime total (all music days and all practice time), which only grows. It is read-only over the `practices` store that S-02 already writes; no schema change, no charts, no failure messaging after a break.

## Current State Analysis
- Practice sessions live in the IndexedDB store `practices` (keyPath `id`, non-unique index `byDay` on `day`), created by migration v4; DB version = `migrations.length` = 4 (`src/storage/db.test.ts:20`, `src/storage/db.test.ts:122-131`). Everything this change reads already exists, so no migration is needed.
- A `Practice` carries `day` (local `YYYY-MM-DD`, fixed at save time) and `durationMinutes` (integer 1-600) (`src/practice/practiceStore.ts:12-21`, `:70-73`).
- `PracticeStore` exposes only `add`, `listWeek`, `lastDuration` (`src/practice/practiceStore.ts:31-38`); there is no delete or edit API anywhere, so totals derived from the records can only grow.
- Store modules share a lazy connection via `createConnection(open?)` from `src/storage/index.ts` (`src/storage/connection.ts:14-33`); `listWeek` reads a day range with `IDBKeyRange.bound` over `byDay` (`src/practice/practiceStore.ts:117-121`) — the same pattern fits a month range.
- Local-date helpers `dayKey` and Monday-first `WEEKDAY_LABELS` exist in `src/practice/week.ts:13-45`; `weekDays` builds dates from local parts to stay DST-safe (`src/practice/week.ts:17-23`).
- `WeekView` sets the visual vocabulary: music day `bg-amber-300 text-blue-950` with "♪", empty day `bg-white/10`, today `ring-4 ring-white`, accessible label "<Day>: Dzień z muzyką (dziś)" (`src/practice/WeekView.tsx:15-31`).
- `PracticeTimeCard` is the precedent for a self-contained card with an optional injected store and a default IndexedDB store, rendered from `App.tsx` (`src/practice-time/PracticeTimeCard.tsx:34-56`, `src/App.tsx:68-71`). App tests run against `fake-indexeddb` with default stores (`src/App.test.tsx:1`).
- E2E tests drive the real app offline with Playwright (`e2e/practice.spec.ts:3-40`).

## Desired End State
On the home screen, below the existing cards, a button "Mój miesiąc" (collapsed by default, `aria-expanded`). Tapping it opens one section that, read fresh from the device at open time, shows:
- the month name and year (e.g. "Październik 2026");
- the counter "Dni z muzyką w tym miesiącu: N";
- a Monday-first calendar grid of the current month: music days amber with "♪", empty days neutral (never red), today outlined; each day has an accessible label like "12 października: Dzień z muzyką (dziś)";
- the lifetime total: "Razem: X dni z muzyką · Y godz. Z min" (correct "dzień"/"dni" form, minutes-only below an hour); with no sessions yet, an encouraging line instead of zeros.
No streaks, no "you missed" texts, no charts, no month navigation. Works offline. Tapping the button again closes the section.

### Key discoveries
- No migration needed: `practices` + `byDay` already cover month range reads and full scans (`src/storage/db.test.ts:122-131`).
- Records are never deleted or edited (`src/practice/practiceStore.ts:31-38`), so "only grows" holds by construction.
- `ProfileScreen` keeps its own week state and refreshes after a save (`src/profile/ProfileScreen.tsx:34-47`); a separate card loading on open stays fresh without coupling to that state.

## What we're NOT doing
- No IndexedDB migration or version bump; no new store or index.
- No change to `PracticeStore`, `practiceStore.ts`, `week.ts`, `WeekView.tsx`, `ProfileScreen.tsx` (avoids conflicts with S-03 / S-06 and keeps S-02 contracts untouched).
- No navigation to previous/next months, no per-instrument split (S-09), no weekly goal progress (S-03), no badges (S-05), no charts or statistics beyond the counter and the lifetime total.
- No router or new screen; no deploy.

## Implementation Approach
A new self-contained module `src/month/` with three parts: pure calendar/formatting helpers, a read-only IndexedDB query object over `practices`, and a `MonthCard` component with an optional injected store (the `PracticeTimeCard` pattern). `App.tsx` gets only an import and one `<MonthCard />` element next to `<PracticeTimeCard />`.

Alternatives rejected:
- Extending `PracticeStore` with `listMonth`/`totals`: changes a shared S-02 interface that S-03/S-06 are likely to touch and forces every fake implementing it to change; a separate read-only module over the same store is file-disjoint.
- Rendering the month inside `ProfileScreen` (sharing its refresh after save): `ProfileScreen` is the most likely conflict point with S-03 (goal progress) and S-06; loading on open gives the same freshness.
- Always-visible month grid on the home screen: lengthens the screen a student sees after every save (NFR Czas w aplikacji, roadmap S-04 risk "browsing instead of leaving"); a collapsed toggle keeps the home screen short and the view one tap away.

The `practices` store is reused through `createConnection(open?)` so the card opens lazily, retries after a failed open and reopens after a version change exactly like the other stores.

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Month view and lifetime total | 1-2 | — | yes | in-progress | — |

## Critical Implementation Details
- **Local dates only.** Month bounds are built from local date parts (`new Date(y, m, d)`) and turned into keys with `dayKey`; never `toISOString()` (UTC shift around midnight, see `src/practice/week.ts:1-8`).
- **Month range query.** Day keys are lexicographically ordered, so `IDBKeyRange.bound('<YYYY-MM>-01', '<YYYY-MM>-<lastDay>')` over `byDay` returns exactly the month.
- **Lifetime total** = distinct `day` values and the sum of `durationMinutes` over all records of `practices`, regardless of instrument (PRD Business Logic: a Dzień z muzyką counts on any instrument).
- **Fresh at open.** The card loads month and totals each time it is opened (and on `visibilitychange` to visible while open, so a PWA left open across midnight/month end shows the new day); nothing is cached between openings.
- **Load failure** shows the shared neutral `RETRY_MESSAGE` from `src/profile/copy.ts` with a retry button, never anything about missed days.

## Phase 1: Month data
### Overview
Pure helpers and a read-only query over `practices`, fully unit-tested.

### Required changes
#### 1. Calendar and formatting helpers
- **File**: `src/month/month.ts`, `src/month/month.test.ts`
- **Goal**: Build the current month's grid and format the totals in Polish, child-friendly.
- **Contract**:
  - `monthDays(now: Date): string[]` — day keys of the month containing `now`, 1st to last, local time.
  - `leadingBlanks(now: Date): number` — empty cells before the 1st in a Monday-first week (0-6).
  - `monthRange(now: Date): { first: string; last: string }`.
  - `MONTH_NAMES` (nominative, for the heading) and `MONTH_NAMES_GENITIVE` (for day labels: "12 października").
  - `formatDuration(minutes: number): string` — "45 min", "2 godz.", "12 godz. 30 min".
  - `musicDaysLabel(count: number): string` — "1 dzień z muzyką", otherwise "N dni z muzyką".
  - Reuses `dayKey` from `src/practice/week.ts` (import only, no edit).

#### 2. Read-only month store
- **File**: `src/month/monthStore.ts`, `src/month/monthStore.test.ts`
- **Goal**: Read the month's music days and the lifetime total from the existing `practices` store without any schema change.
- **Contract**:
  - `interface MonthStore { musicDaysInMonth(now?: Date): Promise<ReadonlySet<string>>; lifetime(): Promise<{ musicDays: number; minutes: number }>; }`
  - `createIndexedDbMonthStore(open?: OpenConnection, now?: () => Date): MonthStore` — uses `createConnection(open)`; reads store `practices`, index `byDay`; never writes.
  - Tests seed records through `createIndexedDbPracticeStore` (or direct puts) on a uniquely named fake-indexeddb database and cover: days of other months excluded; several sessions on one day count once; lifetime sums minutes across months and instruments; empty database gives an empty set and zeros; DB version stays `migrations.length` (no upgrade triggered).

#### 3. Module entry
- **File**: `src/month/index.ts`
- **Goal**: Export the public surface of the module (`MonthCard` is added in Phase 2).
- **Contract**: re-exports from `month.ts` and `monthStore.ts`.

### Success criteria
#### Automated
- `pnpm test src/month` passes, covering month grid (31/30/28/29-day months, a month starting on Monday and on Sunday), duration and plural formatting, month range and lifetime queries
- `pnpm typecheck` and `pnpm lint` pass
- `git diff --stat e4e6ed3..HEAD -- src/storage` shows no change to the storage module (no migration)
#### Manual
- none

## Phase 2: Month card on the home screen
### Overview
The collapsed "Mój miesiąc" card, its copy, and the one-line hook in `App.tsx`.

### Required changes
#### 1. Copy
- **File**: `src/month/copy.ts`
- **Goal**: Polish, encouraging texts only.
- **Contract**: `MONTH_TOGGLE = 'Mój miesiąc'`, `MONTH_LIST_LABEL = 'Ten miesiąc'`, `monthCounter(n) = 'Dni z muzyką w tym miesiącu: ' + n`, `LIFETIME_PREFIX = 'Razem:'`, `LIFETIME_EMPTY` (an encouraging first-step line, no zeros), day label built from `MUSIC_DAY_LABEL` / `TODAY_LABEL` of `src/practice/copy.ts` (import only). No text mentions missed days, breaks or failure.

#### 2. MonthCard component
- **File**: `src/month/MonthCard.tsx`, `src/month/MonthCard.test.tsx`, `src/month/index.ts`
- **Goal**: One simple, read-only view: toggle button; when open, heading (month name + year), counter, Monday-first grid with weekday header (`WEEKDAY_LABELS` short names, `aria-hidden`), blank leading cells (`aria-hidden`), and the lifetime line. Visuals match `WeekView` (amber + "♪" for music days, `bg-white/10` neutral empty days, `ring` for today); large touch target for the toggle (`min-h-14`).
- **Contract**:
  - `MonthCard({ store?: MonthStore, now?: () => Date })` — defaults to `createIndexedDbMonthStore()` and `() => new Date()`, created once (`useState` initializer), like `PracticeTimeCard`.
  - Toggle is a `button` with `aria-expanded`; closed by default, so nothing loads and nothing changes on the home screen until tapped.
  - Open → load `musicDaysInMonth` and `lifetime` (fresh every opening; also on `visibilitychange` to visible while open). States: loading (nothing rendered beyond the toggle), ready, failed (`RETRY_MESSAGE` + retry button).
  - Grid is `<ul aria-label="Ten miesiąc">` with one `<li>` per day of the month, accessible name "<d> <month genitive>[: Dzień z muzyką][ (dziś)]".
  - Component tests with an injected fake `MonthStore` and a fixed `now`: closed by default (no store call); opening shows counter, the right number of day items and music-day labels; empty days carry no music label and no red class; lifetime with 1 day shows "1 dzień z muzyką"; zero lifetime shows the empty-state line; store rejection shows the retry message and retry reloads; closing hides the section.

#### 3. Home screen hook
- **File**: `src/App.tsx`
- **Goal**: Show the card on the profile screen. Minimal touch (parallel S-03/S-06 work edits this file): one import line and one `<MonthCard />` element right after `<PracticeTimeCard />` in the `profile` branch; nothing else changes.
- **Contract**: no new `AppProps`; existing `src/App.test.tsx` passes unchanged.

#### 4. End-to-end check
- **File**: `e2e/month.spec.ts`
- **Goal**: Offline, after creating a profile and logging one session, opening "Mój miesiąc" shows today as a Dzień z muzyką, the counter at 1 and the lifetime line with "1 dzień z muzyką"; after an offline reload the same values are shown.
- **Contract**: follows the setup of `e2e/practice.spec.ts:3-21` (profile creation, service-worker control, `context.setOffline(true)`).

### Success criteria
#### Automated
- `pnpm test` passes (including `src/month/MonthCard.test.tsx` and the unchanged `src/App.test.tsx`)
- `pnpm typecheck`, `pnpm lint` and `pnpm build` pass
- `pnpm test:e2e e2e/month.spec.ts` passes
- `git diff e4e6ed3..HEAD -- src/App.tsx` adds only the `MonthCard` import and one `<MonthCard />` element
#### Manual
- On a phone-sized viewport the closed card adds only one button to the home screen, and the opened month is readable without horizontal scrolling, with no red or "missed" styling on empty days

## Testing Strategy
- Unit (Vitest): pure helpers in `month.test.ts`; queries in `monthStore.test.ts` on `fake-indexeddb` with a unique database name per test (pattern of `src/storage/db.test.ts:8-9`).
- Component (Vitest + Testing Library): `MonthCard.test.tsx` with an injected fake store and fixed clock.
- E2E (Playwright): `e2e/month.spec.ts` offline flow.
- Existing suites (`App.test.tsx`, `ProfileScreen`/`WeekView` tests, e2e specs) must pass untouched.

## Performance Notes
`lifetime()` scans all `practices` records once per opening. At one or two sessions a day that is a few thousand small records after years — well within a single `getAll`. If it ever matters, a key cursor over `byDay` can replace it without a schema change.

## Migration Notes
None. The change only reads the existing `practices` store and `byDay` index (migration v4 from S-02); the database version stays 4.

## References
- Roadmap slice S-04: `context/foundation/roadmap.md` (Change ID `widok-miesiaca`)
- PRD: `context/prd/prd.md` FR-006, NFR Czas w aplikacji, Business Logic
- Prior changes: `context/archive/2026-10-11-zapis-cwiczenia/` (S-02, `practices` store), `context/archive/2026-10-11-pora-cwiczen/` (card pattern)
- Key files: `src/practice/practiceStore.ts`, `src/practice/week.ts`, `src/practice/WeekView.tsx`, `src/practice-time/PracticeTimeCard.tsx`, `src/storage/connection.ts`, `src/App.tsx`

## Progress

### Phase 1: Month data
#### Automated
- [ ] 1.1 `pnpm test src/month` passes, covering month grid (31/30/28/29-day months, a month starting on Monday and on Sunday), duration and plural formatting, month range and lifetime queries
- [ ] 1.2 `pnpm typecheck` and `pnpm lint` pass
- [ ] 1.3 `git diff --stat e4e6ed3..HEAD -- src/storage` shows no change to the storage module (no migration)
#### Manual

### Phase 2: Month card on the home screen
#### Automated
- [ ] 2.1 `pnpm test` passes (including `src/month/MonthCard.test.tsx` and the unchanged `src/App.test.tsx`)
- [ ] 2.2 `pnpm typecheck`, `pnpm lint` and `pnpm build` pass
- [ ] 2.3 `pnpm test:e2e e2e/month.spec.ts` passes
- [ ] 2.4 `git diff e4e6ed3..HEAD -- src/App.tsx` adds only the `MonthCard` import and one `<MonthCard />` element
#### Manual
- [ ] 2.5 On a phone-sized viewport the closed card adds only one button to the home screen, and the opened month is readable without horizontal scrolling, with no red or "missed" styling on empty days
