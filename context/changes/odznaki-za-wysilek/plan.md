# Unannounced effort badges and the earned-badges collection — Implementation Plan

## Overview
Roadmap slice S-05 (FR-007, PRD Business Logic, ADR 0002): right after saving a practice session the student (Uczeń) may receive an unannounced Odznaka for effort (total practice time, number of Dni z muzyką, reached goal weeks, coming back after a break). Nothing announces a badge before it is earned: there is no list of badges to collect and no progress towards the next one. Earned badges can never be lost and are visible in a "Moje odznaki" collection. Existing history earns its badges once, quietly, behind a single summary message. No currency, points or randomness. This plan also settles roadmap Open Question 3 (badge catalog and thresholds).

## Current State Analysis
- Home screen = `ProfileScreen` (`src/profile/ProfileScreen.tsx:17-126`). It counts saves in `savedCount` (`:24`, incremented in `onSaved` at `:96`) after `practiceStore.add` resolved, so a component keyed on `savedCount` sees the new practice in IndexedDB. The logging block ends at `:115`, followed by `WeekView`, `ShareCardButton`, `WeeklyGoalCard` (`:116-118`).
- `App.tsx` renders `ProfileScreen`, `PracticeTimeCard`, `MonthCard` in the profile branch (`src/App.tsx:67-71`) and `NotificationsPanel` after it (`:89`). Mounting inside `ProfileScreen` leaves `App.tsx` untouched.
- Practices live in the `practices` store (v4, keyPath `id`, index `byDay`, `src/storage/migrations.ts:36-43`); each record has `day` (local `YYYY-MM-DD`) and `durationMinutes` (`src/practice/practiceStore.ts:12-21`). Sessions are never edited or deleted, so totals only grow (`src/month/monthStore.ts:1-7`). `monthStore.lifetime()` already scans all records directly (`monthStore.ts:52-61`): precedent for a read-only module reading `practices` through its own `createConnection`.
- Weekly goal: one record in the out-of-line `profile` store under key `weeklyGoal` (`src/weekly-goal/weeklyGoalStore.ts:1-7,36-37`), shape `{ daysPerWeek, since, raiseDeclinedWeek?, updatedAt }` (`src/weekly-goal/weeklyGoal.ts:15-22`). `since` is reset to the current Monday on every `setGoal`, including an accepted raise (`weeklyGoalStore.ts:55-64`), so the goal history is not kept. `validateGoal`, `isReached`, `weekStart` are exported from `src/weekly-goal/index.ts`; the store's `usable()` guard is private (`weeklyGoalStore.ts:38-44`).
- Storage: schema is at v5 (`migrations.ts:22-50`); `profileStore` touches only key `current` (`src/profile/profileStore.ts:9-11`). The `profile` store already serves as a per-feature key/value store, so a `badges` key needs no migration.
- Calendar helpers: `dayKey`, `weekDays` (`src/practice/week.ts:12-24`), local-time, DST-safe.
- UI conventions: amber = good, neutral white/10, never red; large targets `min-h-14`; collapsed toggle with `aria-expanded` like `MonthCard` (`src/month/MonthCard.tsx:51-133`); cards render nothing on storage failure (`PracticeTimeCard`).
- Tests: Vitest + jsdom + `fake-indexeddb`, stores injected with `openDb({ name })` per test (`src/weekly-goal/weeklyGoalStore.test.ts:1-13`, `src/App.test.tsx:1-12`); e2e with a fixed clock (`e2e/weekly-goal.spec.ts:3-9`).
- No `context/foundation/lessons.md`.

## Desired End State
- First save ever (e.g. 15 min): under the save confirmation an announcement appears: a large icon and "Nowa odznaka: Pierwszy dzień z muzyką" with one line praising the effort. "Super!" hides it. A "Moje odznaki" button appears for the first time; it was not visible before.
- FR-007 acceptance: when the total practice time crosses 5 hours, the save that crosses it shows the "Pięć godzin z muzyką" badge, which had not been visible on any list before.
- Several badges earned by one save show in one announcement (one card listing them), never as a sequence of pop-ups.
- "Moje odznaki" expands to the earned badges only (icon, name, one effort line), with no empty slots, no "locked" items, no count of remaining badges and no progress bar.
- A student who already has history when this version first starts gets every badge the history qualifies for, without one announcement per badge: one summary message "Twoje dotychczasowe ćwiczenia przyniosły Ci N odznak(i)! Zajrzyj do kolekcji." Later starts show nothing.
- Badges never disappear: changing or raising the goal, a pause, or a new week never removes one.
- Works offline and survives a reload. A storage failure hides the badges block; logging still works.

### Key discoveries
- `savedCount` is incremented only after the session is persisted (`ProfileScreen.tsx:88-97`), a reliable "after save" trigger with no change to `LogPractice` or `practiceStore`.
- `since` resets on every goal change (`weeklyGoalStore.ts:55-64`), so reached goal weeks must be remembered by the badge module, or a student who accepts the encouraged raise after 3 reached weeks would lose progress towards later week badges.
- The `profile` store holds per-feature keys without schema changes (`weeklyGoalStore.ts:4-6`, `profileStore.ts:9-11`).

## What we're NOT doing
- No migration and no change to `src/storage/**` (no v6, so no numbering collision with S-09).
- No change to `App.tsx`, `practiceStore.ts`, `LogPractice.tsx`, `WeekView.tsx`, `profileStore.ts`, `src/weekly-goal/**`, `src/month/**`.
- No list of badges to earn, no hints, no progress to the next badge, no locked silhouettes, no count of earned badges (ADR 0002, FR-007 challenge).
- No points, currency, unlockables, random rewards, streaks, sharing of badges, or badges on the Karta postępu (S-06 stays as is).
- No badges for skill, speed or comparison; no per-instrument badges (S-09); no push notification about a badge (S-08).
- No repeatable badges: each badge is earned at most once.

## Implementation Approach
One area (A1 Odznaki za wysiłek), one increment, four phases: pure catalog and rules; persistence and the atomic award operation; the badges block on the home screen; e2e.

A new self-contained module `src/badges/` mirrors `src/weekly-goal/`: `catalog.ts` (badge definitions), `badgeRules.ts` (pure evaluation), `copy.ts` (Polish texts), `badgeStore.ts` (persistence and award), `BadgesCard.tsx` (announcement, summary, collection), `index.ts`. The only edit outside the module is one import and one JSX line in `ProfileScreen.tsx`, placing `<BadgesCard savedCount={savedCount} />` directly after the logging block and before `WeekView`, so the announcement appears where the student is looking right after saving ("tuż po zapisie", `context/prd/prd.md:118`).

Earned badges and the remembered reached weeks are one record in the existing `profile` store under key `badges` (Consult, agreed): no migration, the same pattern as `weeklyGoal`, and structurally free of the v6 collision with S-09. Awarding is recomputation, not event counting: on every evaluation the rules derive all qualifying badges from the full practice history plus the remembered reached weeks; the new badges are the qualifying ones not yet in the record. This is idempotent, self-healing (a crash between save and award is caught up on the next evaluation) and gives the retroactive award for free.

Retroactive award without a flood: the card evaluates once on mount and once after each save. Badges found on mount (history from before this version, or a catch-up) produce the single summary message; badges found after a save produce the announcement. A brand-new student has no history at mount, so their first badge arrives as a normal announcement.

Alternatives rejected: a dedicated v6 `badges` store (cleaner separation, but a schema change for a tiny record and a likely v6 collision with S-09; the project splits stores only on a privacy boundary, `migrations.ts:32-34`); awarding inside `practiceStore.add` (couples S-02 to S-05 and needs edits S-09 also makes); mounting in `App.tsx` with an event bus (more churn in a file S-08 also touches); counting reached weeks only from the current goal's `since` (loses progress after a goal change).

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Unannounced effort badges with retroactive award and collection | 1-4 | — | yes | in-progress | — |

## Critical Implementation Details
### Badge catalog (settles roadmap Open Question 3; single source `catalog.ts`)
Thresholds grow roughly geometrically, so early badges come quickly for a 7-year-old and later ones stay rare. 15 badges, each earned once.

| id | Rule | Name (pl) | Icon |
|---|---|---|---|
| `days-1` | ≥ 1 distinct Dzień z muzyką | Pierwszy dzień z muzyką | 🌱 |
| `days-10` | ≥ 10 distinct days | 10 dni z muzyką | 🎵 |
| `days-30` | ≥ 30 distinct days | 30 dni z muzyką | 🎶 |
| `days-100` | ≥ 100 distinct days | 100 dni z muzyką | 🌳 |
| `time-1h` | total ≥ 60 min | Pierwsza godzina z muzyką | ⏱️ |
| `time-5h` | total ≥ 300 min | Pięć godzin z muzyką | 🔥 |
| `time-10h` | total ≥ 600 min | Dziesięć godzin z muzyką | 💪 |
| `time-25h` | total ≥ 1500 min | 25 godzin z muzyką | 🚀 |
| `time-50h` | total ≥ 3000 min | 50 godzin z muzyką | ⛰️ |
| `time-100h` | total ≥ 6000 min | 100 godzin z muzyką | 🏔️ |
| `weeks-1` | ≥ 1 reached goal week | Pierwszy cel tygodnia | 🎯 |
| `weeks-5` | ≥ 5 reached goal weeks | 5 tygodni z celem | 📅 |
| `weeks-10` | ≥ 10 reached goal weeks | 10 tygodni z celem | 🗓️ |
| `weeks-25` | ≥ 25 reached goal weeks | 25 tygodni z celem | 🌟 |
| `comeback` | some music day follows the previous distinct music day by ≥ 8 calendar days (at least 7 empty days between) | Powrót do muzyki | 🌈 |

- Each catalog entry also carries a one-sentence praise line for effort and persistence (e.g. "Ćwiczysz regularnie, to się liczy!", "Wróciłeś do grania, super, że jesteś!"). Never talent, skill, being the best, or winning; never anything about losing or missing.
- Catalog order (days, time, weeks, comeback) is the display order in the collection and in a multi-badge announcement.

### Rules (`badgeRules.ts`, pure)
- Input: all practices (`day`, `durationMinutes`), the weekly goal record or `null`, the remembered reached weeks, `now`.
- Distinct days and total minutes over all practices, any instrument.
- Reached weeks: group practices by the Monday of their `day` (parse the key from local parts, DST-safe); a week counts when it starts on or after `goal.since` and its distinct days reach `goal.daysPerWeek` (`isReached`). The current week counts as soon as it is reached. Result = union of these weeks with the remembered weeks; the remembered set only grows. No goal → only remembered weeks.
- Comeback: over sorted distinct day keys, any consecutive pair with a calendar-day difference ≥ 8.
- Output: `{ qualifying: BadgeId[]; reachedWeeks: string[] }`. Newly earned = qualifying minus already earned.

### Atomic award (`badgeStore.award`)
- One `readwrite` transaction over `['practices', 'profile']`: read all practices, the `weeklyGoal` key and the `badges` key, evaluate synchronously, write the merged `badges` record only when something changed. No non-IndexedDB `await` inside the transaction (idb auto-commits otherwise). IndexedDB serializes overlapping readwrite transactions on the same stores, so StrictMode's double effect or two tabs never award a badge twice.
- The `badges` record is read through a `usable()` guard that drops malformed entries and unknown ids but keeps the rest; a write merges into it and never replaces earned entries.
- The weekly goal is read raw and checked with the exported `validateGoal` plus a `since` string check; `src/weekly-goal/**` is not edited.

### UI timing
- Mount: `award(now)`; newly earned → summary message (one line, count with Polish plural: 1 odznaka, 2-4 odznaki, 5+ odznak, 12-14 odznak). Then `list()` for the collection.
- `savedCount` change after mount: `award(now)`; newly earned → announcement (replaces a summary still shown). Nothing new → nothing shown.
- Announcement and summary use `role="status"`, stay until "Super!" or the next save, and never block logging.
- The "Moje odznaki" toggle renders only when at least one badge is earned; collapsed by default (keeps a visit short, NFR Czas w aplikacji).
- Any storage failure → the block renders nothing; the next save tries again.

## Phase 1: Catalog and award rules
### Overview
The badge catalog, the pure evaluation, and the Polish texts, without storage or UI.

### Required changes
#### 1. Catalog
- **File**: `src/badges/catalog.ts` (new)
- **Goal**: one place for every badge: id, kind, threshold, name, icon, praise line.
- **Contract**: `type BadgeId` (union of the 15 ids above); `interface BadgeDefinition { id: BadgeId; kind: 'days' | 'time' | 'weeks' | 'comeback'; threshold: number; name: string; icon: string; praise: string }`; `BADGES: readonly BadgeDefinition[]` in display order; `badgeById(id: string): BadgeDefinition | undefined`.

#### 2. Rules
- **File**: `src/badges/badgeRules.ts` (new)
- **Goal**: decide which badges the history qualifies for, per Critical Implementation Details.
- **Contract**: `interface BadgeInput { practices: readonly { day: string; durationMinutes: number }[]; goal: { daysPerWeek: number; since: string } | null; rememberedWeeks: readonly string[] }`; `evaluateBadges(input: BadgeInput): { qualifying: BadgeId[]; reachedWeeks: string[] }` (both sorted, `qualifying` in catalog order); `newlyEarned(qualifying: readonly BadgeId[], earned: readonly BadgeId[]): BadgeId[]`; helper `mondayOf(day: string): string`.

#### 3. Copy
- **File**: `src/badges/copy.ts` (new)
- **Goal**: Polish texts of the block; encouraging only.
- **Contract**: `NEW_BADGE` ("Nowa odznaka"), `NEW_BADGES` (several), `DISMISS` ("Super!"), `COLLECTION_TOGGLE` ("Moje odznaki"), `COLLECTION_LABEL`, `badgeCountLabel(n)` (Polish plural), `retroSummary(n)`.

#### 4. Tests
- **File**: `src/badges/catalog.test.ts`, `src/badges/badgeRules.test.ts`, `src/badges/copy.test.ts` (new)
- **Goal**: thresholds at their boundaries (299 vs 300 min; 9 vs 10 days), distinct-day counting (two sessions one day = one day), reached weeks with and without a goal, weeks before `since` ignored, remembered weeks kept after `since` moves, current week counted, comeback at 7 vs 8 day difference, idempotent `newlyEarned`, unique ids, and a copy scan forbidding talent/comparison/loss wording (e.g. `talent`, `zdoln`, `najlepsz`, `wygr`, `punkt`, `strac`, `porażk`) in every name, praise line and text.

### Success criteria
#### Automated
- `pnpm test src/badges` passes (catalog, rules, copy tests)
- `pnpm typecheck` passes
- `pnpm lint` passes

## Phase 2: Persistence and atomic award
### Overview
The earned-badges record in the `profile` store and the single award operation.

### Required changes
#### 1. Store
- **File**: `src/badges/badgeStore.ts` (new)
- **Goal**: persist earned badges and remembered reached weeks under the fixed key `badges` in the `profile` store, through `createConnection`; award atomically as described above. Header comment states that the key is owned by `src/badges/` and that no migration is used.
- **Contract**: `interface EarnedBadge { id: BadgeId; earnedAt: string }`; `interface BadgeStore { list(): Promise<EarnedBadge[]>; award(now?: Date): Promise<EarnedBadge[]> /* newly earned only, catalog order */ }`; `createIndexedDbBadgeStore(open?: OpenConnection, now?: () => Date): BadgeStore`. Stored record: `{ earned: EarnedBadge[]; reachedWeeks: string[]; updatedAt: string }`.

#### 2. Public surface
- **File**: `src/badges/index.ts` (new)
- **Goal**: export catalog, rules, store and (Phase 3) the card.
- **Contract**: re-exports only.

#### 3. Tests
- **File**: `src/badges/badgeStore.test.ts` (new)
- **Goal**: with `fake-indexeddb` and a unique DB name per test, seeded through `createIndexedDbPracticeStore` and `createIndexedDbWeeklyGoalStore`: empty history awards nothing; crossing 300 min awards `time-5h` once and a second `award` returns `[]`; two concurrent `award` calls award each badge once; earned badges survive a fresh store; a goal change (new `since`) keeps previously reached weeks counted; a malformed `badges` record is repaired without dropping valid entries; the `current` and `weeklyGoal` keys are untouched.

### Success criteria
#### Automated
- `pnpm test src/badges` passes (including store tests)
- `pnpm typecheck` passes
- `pnpm lint` passes

## Phase 3: Badges block on the home screen
### Overview
The announcement, the one-time summary and the collection, mounted once in `ProfileScreen`.

### Required changes
#### 1. Card
- **File**: `src/badges/BadgesCard.tsx` (new)
- **Goal**: per UI timing above; large icon and text for 7-13 year olds, amber accent, no red.
- **Contract**: `interface BadgesCardProps { savedCount: number; store?: BadgeStore; now?: () => Date }`; `export function BadgesCard(props)`; creates its own store when none is injected.

#### 2. Mount point
- **File**: `src/profile/ProfileScreen.tsx`
- **Goal**: one import from `../badges/index.ts` and one line `<BadgesCard savedCount={savedCount} />` between the logging block and `WeekView`; nothing else changes.
- **Contract**: unchanged `ProfileScreenProps`.

#### 3. Tests
- **File**: `src/badges/BadgesCard.test.tsx`, `src/badges/badgesFlow.test.tsx` (new)
- **Goal**: card with an injected fake store: no toggle and no text while nothing is earned; summary on mount when `award` returns badges, announcement after a `savedCount` change, multiple badges in one announcement, "Super!" hides it, collection lists only earned badges with no count or locked items, failure renders nothing. Flow test renders `App` with real IndexedDB stores (mirroring `src/App.test.tsx`): create a profile, log a session → "Pierwszy dzień z muzyką" announced and the toggle appears; seed 5 h of history before mount → one summary, no per-badge announcements, and a remount shows nothing.

### Success criteria
#### Automated
- `pnpm test` passes (full suite, including existing `App.test.tsx`)
- `pnpm typecheck` passes
- `pnpm lint` passes
- `pnpm build` succeeds
#### Manual
- On a phone, after saving a session the badge announcement is visible without scrolling and reads as praise for effort

## Phase 4: End-to-end check
### Overview
One e2e scenario through the real app, offline-safe.

### Required changes
#### 1. E2E spec
- **File**: `e2e/badges.spec.ts` (new)
- **Goal**: with a fixed clock (as `e2e/weekly-goal.spec.ts`): create a profile, check that no "Moje odznaki" button is visible, log a 60-minute session, see one announcement naming "Pierwszy dzień z muzyką" and "Pierwsza godzina z muzyką", dismiss it, reload offline, open "Moje odznaki" and see both badges and nothing else, and no announcement after the reload.

### Success criteria
#### Automated
- `pnpm test:e2e e2e/badges.spec.ts` passes
- `pnpm test:e2e` passes (no regression in existing specs)

## Testing Strategy
- Unit (Vitest): catalog, rules and copy are pure and exhaustively boundary-tested; store tests run on `fake-indexeddb` with seeded practices and goals.
- Component/integration (Vitest + Testing Library): card behaviour with an injected store; one App-level flow with real stores for the first badge and the retroactive summary.
- E2E (Playwright): first badges, collection, offline reload.
- Manual: on-device visibility and tone (Phase 3).

## Performance Notes
`award` reads all practices once per save and once per start, as `monthStore.lifetime()` already does on opening the month view. A heavy user logs a few hundred sessions a year; the scan stays in milliseconds.

## Migration Notes
None: no schema change. The `badges` key in the out-of-line `profile` store is additive; an older build ignores it, so a rollback is safe.

## References
- Roadmap slice S-05 and Open Question 3: `context/foundation/roadmap.md`
- PRD FR-007, Business Logic, NFR Czas w aplikacji: `context/prd/prd.md:85-87,110-118`
- ADR 0002: `context/discovery/decisions/0002-grywalizacja-bez-waluty-i-rankingow.md`
- Glossary "Odznaka", "Dzień z muzyką": `context/discovery/glossary.md:23-33`
- Prior pattern: `context/archive/2026-10-11-cel-tygodniowy/plan.md`
- Key files: `src/profile/ProfileScreen.tsx`, `src/weekly-goal/weeklyGoalStore.ts`, `src/month/monthStore.ts`, `src/storage/connection.ts`

## Progress

### Phase 1: Catalog and award rules
#### Automated
- [ ] 1.1 `pnpm test src/badges` passes (catalog, rules, copy tests)
- [ ] 1.2 `pnpm typecheck` passes
- [ ] 1.3 `pnpm lint` passes

### Phase 2: Persistence and atomic award
#### Automated
- [ ] 2.1 `pnpm test src/badges` passes (including store tests)
- [ ] 2.2 `pnpm typecheck` passes
- [ ] 2.3 `pnpm lint` passes

### Phase 3: Badges block on the home screen
#### Automated
- [ ] 3.1 `pnpm test` passes (full suite, including existing `App.test.tsx`)
- [ ] 3.2 `pnpm typecheck` passes
- [ ] 3.3 `pnpm lint` passes
- [ ] 3.4 `pnpm build` succeeds
#### Manual
- [ ] 3.5 On a phone, after saving a session the badge announcement is visible without scrolling and reads as praise for effort

### Phase 4: End-to-end check
#### Automated
- [ ] 4.1 `pnpm test:e2e e2e/badges.spec.ts` passes
- [ ] 4.2 `pnpm test:e2e` passes (no regression in existing specs)
