# Practice backdating (up to 3 days back) — Implementation Plan

## Overview
A student can log a practice session for today, yesterday, the day before
yesterday or 3 days ago, either from day chips in the "Ile grałeś?" panel or by
tapping an empty past day in "Ten tydzień". Today stays preselected so logging
for today takes the same taps as before (FR-004).

## Current State Analysis
- `src/practice/practiceStore.ts:110-121` — `add` always stamps `day: dayKey(now())`; `NewPractice` (`:23-28`) has no `day`; `validate` (`:70-87`) knows the reasons `instrument-empty | duration | note-too-long | emoji` (`:54`).
- `src/practice/week.ts:13-25` — `dayKey` / `weekDays` build day keys from local date parts (DST-safe); `WEEKDAY_LABELS` (`:33-41`) holds short and full Polish names, Monday first, no genitive forms.
- `src/practice/LogPractice.tsx:182-221` — the panel offers instrument (only with several) and duration chips, then calls `store.add` without a day; chip styling is `chipClass` (`:35-39`).
- `src/practice/WeekView.tsx:22-50` — days are plain `<li>` elements with an `aria-label`; nothing is interactive.
- `src/profile/ProfileScreen.tsx:86-120` — opens the panel from "Zagrałem!", shows `SAVED_MESSAGE` ("Super! Zapisane.", `src/practice/copy.ts:14`) after save, then bumps `now` and `savedCount`, which reloads the week (`:40-53`), the badges (`:121`) and the weekly goal (`:124`).
- FR-003 needs no change: month (`src/month/monthStore.ts:45-53`), weekly goal (`src/weekly-goal/WeeklyGoalCard.tsx:92-93`), badges (`src/badges/badgeRules.ts:71`) and instrument stats (`src/instruments/stats.ts:46-50`) all key off `practice.day`, never `createdAt`.
- `lastPractice` (`src/practice/practiceStore.ts:99-107`) orders by day, then save time; a backdated session therefore does not become "the last practice" when a later day exists. That is acceptable (preselection only) and left as is.
- No schema change: `day` already exists on every record and is indexed (`byDay`).

## Desired End State
- The panel shows, above the durations, a day radiogroup "Kiedy grałeś?": Dziś (preselected) · Wczoraj · Przedwczoraj · the short weekday name of 3 days ago.
- In "Ten tydzień", an empty circle of yesterday, the day before or 3 days ago (only days inside the shown week) is a button; tapping it opens the panel with that day preselected. Today, music days, future days and days 4+ back stay non-interactive and neutral.
- Saving for a past day stores that `day` and shows "Super! Dopisane do <weekday in the genitive>." (e.g. "Super! Dopisane do wtorku."); saving for today still shows "Super! Zapisane.". The day lights up in the week view.
- `store.add` with a `day` outside today..3 days back (or malformed) rejects with `PracticeError('invalid', 'day')`.

### Key discoveries
- Saves left open across midnight must land on the new today (`src/profile/ProfileScreen.tsx:97-99`, test `src/App.test.tsx:259`): so "Dziś" must keep omitting `day` and let the store stamp the clock at save time.
- Every downstream view refreshes on `savedCount` (`src/profile/ProfileScreen.tsx:53,121,124`), so a backdated save is picked up with no extra wiring.
- e2e already fixes the clock with `page.clock.setFixedTime` (`e2e/weekly-goal.spec.ts:9`).

## What we're NOT doing
- Logging more than 3 days back, or for future days.
- Editing or deleting sessions.
- Tapping days of the previous week (the week view shows only the current week; on Monday/Tuesday/Wednesday the out-of-week days are reachable through the chips only).
- Changing `lastPractice` ordering or any storage schema.

## Implementation Approach
One shared helper in `week.ts` defines the backdating window (today and the 3
previous local days, as day keys built from local parts), so the store
validation, the panel chips and the week view tap targets can never disagree.
The store accepts an optional `day`; absent means "today at save time"
(unchanged behaviour), present must be one of the window keys. The panel holds
the selected day as a day key: the "Dziś" chip means "omit `day`" so the
midnight behaviour is preserved. `ProfileScreen` keeps the day to preselect and
remounts the panel per opening, and chooses the save message from the saved
practice's `day` versus today. Alternatives rejected: an offset (0..3) instead
of a day key would shift meaning across midnight; a separate "backdate" store
method would duplicate validation.

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Practice backdating | 1-3 | — | yes | in-progress | — |

## Critical Implementation Details
- Window: `backdateDays(now)` returns `[today, -1, -2, -3]` day keys built with `new Date(y, m, d - i)` (local parts, DST-safe, like `weekDays`).
- Genitive weekday names (for "Dopisane do …"): poniedziałku, wtorku, środy, czwartku, piątku, soboty, niedzieli.
- The 3-days-ago chip shows the existing short label (`WEEKDAY_LABELS[...].short`, e.g. "Cz") with the full name as its accessible name, for consistency with the week row.
- WeekView past-day buttons keep the empty-day look (neutral, never red) and the existing accessible day name plus a hint (e.g. "Środa: dopisz granie"), and appear only when `ProfileScreen` passes the tap handler (not while the panel is open).

## Phase 1: Store accepts a chosen day
### Overview
The data layer and the shared window helper.

### Required changes
#### 1. Backdating window helper
- **File**: `src/practice/week.ts`
- **Goal**: one definition of which days may be logged, plus the weekday of a day key and genitive weekday names.
- **Contract**: `BACKDATE_DAYS = 3`; `backdateDays(now: Date): string[]` (today first, then 1..3 days back); `weekdayIndex(day: string): number` (0 = Monday); `WEEKDAY_GENITIVE: readonly string[]` (Monday first).

#### 2. Store validation
- **File**: `src/practice/practiceStore.ts`
- **Goal**: `add` stores a chosen `day` inside the window; absent `day` keeps stamping today at save time.
- **Contract**: `NewPractice.day?: string`; `PracticeInputReason` gains `'day'`; a `day` not in `backdateDays(now())` → `PracticeError('invalid', 'day')`; doc comments on `Practice.day` and `add` updated ("the chosen day, today by default").

#### 3. Exports
- **File**: `src/practice/index.ts`
- **Goal**: export the new helpers.

#### 4. Tests
- **File**: `src/practice/practiceStore.test.ts`, `src/practice/week.test.ts`
- **Goal**: cover yesterday / 3 days back accepted, 4 days back / tomorrow / malformed rejected with reason `day`, absent day = today, a Saturday saved on Monday listed in last week's `listWeek`, the window across a month boundary and a DST change.

### Success criteria
#### Automated
- `pnpm test src/practice/practiceStore.test.ts src/practice/week.test.ts` passes, including the new day cases
- `pnpm typecheck` passes
#### Manual
- none

## Phase 2: Day chips and tappable past days
### Overview
The two UI entry points, without screen wiring.

### Required changes
#### 1. Copy
- **File**: `src/practice/copy.ts`
- **Goal**: `DAY_LABEL = 'Kiedy grałeś?'`, `TODAY_CHIP = 'Dziś'`, `YESTERDAY_CHIP = 'Wczoraj'`, `DAY_BEFORE_CHIP = 'Przedwczoraj'`, `backdatedMessage(day)` → `Super! Dopisane do <genitive weekday>.`, and the week-day tap hint.

#### 2. Day chips in the panel
- **File**: `src/practice/LogPractice.tsx`
- **Goal**: a day radiogroup above the durations, built from `backdateDays(now)`; preselected `initialDay` (today when absent); saving passes `day` only when a past chip is selected.
- **Contract**: new optional props `initialDay?: string`, `now?: Date` (defaults to `new Date()` at mount); `onSaved(practice)` unchanged.

#### 3. Tappable empty past days
- **File**: `src/practice/WeekView.tsx`
- **Goal**: empty days that are in `backdateDays(today)` but not today render as buttons calling `onLogDay(day)`; all others unchanged.
- **Contract**: new optional prop `onLogDay?: (day: string) => void`; without it the view is display-only as today.

#### 4. Tests
- **File**: `src/practice/LogPractice.test.tsx`, `src/practice/WeekView.test.tsx`
- **Goal**: chips order and labels, "Dziś" preselected and save without `day` (no extra tap), "Wczoraj" saves yesterday's key, `initialDay` preselects; only the last 3 empty past days are buttons, music days / today / older / future days are not, tapping calls `onLogDay` with the key, nothing is tappable without the handler.

### Success criteria
#### Automated
- `pnpm test src/practice/LogPractice.test.tsx src/practice/WeekView.test.tsx` passes
- `pnpm lint && pnpm typecheck` passes
#### Manual
- none

## Phase 3: Home screen wiring and end-to-end
### Overview
Connect the week taps to the panel and show the backdated save message.

### Required changes
#### 1. Home screen
- **File**: `src/profile/ProfileScreen.tsx`
- **Goal**: keep the day to preselect; "Zagrałem!" opens with today, a week-day tap opens with that day; pass `onLogDay` to `WeekView` only while the panel is closed; after save show `SAVED_MESSAGE` when `practice.day` is today, else `backdatedMessage(practice.day)`.

#### 2. Integration tests
- **File**: `src/App.test.tsx`
- **Goal**: with a fixed clock (`vi.setSystemTime`), AC-01 (log yesterday via chip → yesterday is a Dzień z muzyką, message "Super! Dopisane do …"), AC-02 (save right away → today, "Super! Zapisane."), AC-03 (tap the day before yesterday → panel with that chip checked), AC-05 (Monday, log Saturday → not in this week's view, weekly goal unchanged); the existing midnight test still passes.

#### 3. End-to-end
- **File**: `e2e/practice-backdating.spec.ts`
- **Goal**: with `page.clock.setFixedTime` on a Wednesday, tap Monday's empty circle, save, see "Super! Dopisane do poniedziałku." and Monday highlighted after an offline reload.

### Success criteria
#### Automated
- `pnpm test` passes (full suite)
- `pnpm build` succeeds
- `pnpm test:e2e e2e/practice-backdating.spec.ts e2e/practice.spec.ts` passes
#### Manual
- On a phone, logging yesterday from the chips takes about as long as logging today, and empty past days look neutral (not red) but are clearly tappable

## Testing Strategy
Vitest for the store window (fake-indexeddb, injected clock) and for the panel
and week view (Testing Library, fake store); `App.test.tsx` for the screen flow
with a faked `Date`; one Playwright spec with a fixed clock for the full tap
path offline.

## References
- Issue: `context/changes/cwiczenie-wstecz/change.md`
- Archived predecessors: `context/archive/2026-10-11-zapis-cwiczenia/`, `context/archive/2026-10-11-widok-miesiaca/`, `context/archive/2026-10-11-odznaki-za-wysilek/`

## Progress

### Phase 1: Store accepts a chosen day
#### Automated
- [x] 1.1 `pnpm test src/practice/practiceStore.test.ts src/practice/week.test.ts` passes, including the new day cases — abef645
- [x] 1.2 `pnpm typecheck` passes — abef645

### Phase 2: Day chips and tappable past days
#### Automated
- [x] 2.1 `pnpm test src/practice/LogPractice.test.tsx src/practice/WeekView.test.tsx` passes
- [x] 2.2 `pnpm lint && pnpm typecheck` passes

### Phase 3: Home screen wiring and end-to-end
#### Automated
- [ ] 3.1 `pnpm test` passes (full suite)
- [ ] 3.2 `pnpm build` succeeds
- [ ] 3.3 `pnpm test:e2e e2e/practice-backdating.spec.ts e2e/practice.spec.ts` passes
#### Manual
- [ ] 3.4 On a phone, logging yesterday from the chips takes about as long as logging today, and empty past days look neutral (not red) but are clearly tappable
