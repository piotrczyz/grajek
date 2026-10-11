# Unannounced effort badges — Plan Brief
Full plan: `context/changes/odznaki-za-wysilek/plan.md` · request text: `change.md` · roadmap slice S-05 in `context/foundation/roadmap.md`

## What & why
FR-007: right after saving a practice session the student may get an unannounced Odznaka for effort; earned badges are permanent and visible in a collection. No list of badges to earn, no progress bars, no points or randomness (ADR 0002). Settles roadmap Open Question 3 (catalog and thresholds).

## Starting point
Schema v5; weekly goal stored in the `profile` store under key `weeklyGoal`; `ProfileScreen` already counts saves (`savedCount`) after persistence. No badge code exists.

## Desired end state
First save → "Pierwszy dzień z muzyką" announced and a "Moje odznaki" button appears. Crossing 5 h total → "Pięć godzin z muzyką". Existing history gets its badges once, behind one summary message. Collection shows earned badges only.

## Complexity
MEDIUM — a new self-contained module with pure rules, a cross-store atomic award, retroactive logic and UI, four phases; no schema change and one two-line edit outside the module.

Skipped: rs-research (the code paths are small and were read directly: practice, weekly-goal, month, storage) and rs-frame (the request states an outcome, not a cause) — Jev unavailable (dry mode), decided by the planner.

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Areas | One area A1 "Odznaki za wysiłek", one increment | Orchestrator split; fits 4 phases | Orchestrator |
| Research / framing | Both skipped | Jev dry mode (`unavailable`); shape clear from request and code | Auto |
| Persistence | One record in the existing `profile` store under key `badges`, no migration (no v6) | Same pattern as `weeklyGoal` (`weeklyGoalStore.ts:4-6`); stores are split only on a privacy boundary (`migrations.ts:32-34`); removes the v6 collision with S-09 | Consult |
| Badge catalog (Open Question 3) | 15 badges: days 1/10/30/100; time 1/5/10/25/50/100 h; reached goal weeks 1/5/10/25; comeback after ≥7 empty days | Request categories; PRD 5 h acceptance (`prd.md:86`); geometric thresholds so early badges come fast and later ones stay rare (roadmap S-05 risk) | Auto |
| Repeatable badges | No, each once | Simpler, avoids devaluation; collection shows one entry per badge | Auto |
| Award mechanism | Recompute all qualifying badges from full history on each evaluation; new = qualifying − earned | Idempotent, self-healing, gives retroactive award for free | Auto |
| Concurrency | One readwrite transaction over `practices` + `profile` | IndexedDB serializes it; StrictMode double effect or two tabs never double-award | Auto |
| Reached goal weeks | Remember reached weeks in the badges record (union, only grows) | `since` resets on every goal change incl. accepted raise (`weeklyGoalStore.ts:55-64`); otherwise progress would be lost | Auto |
| Current week | Counts as soon as reached | Award "tuż po zapisie" (`prd.md:118`) | Auto |
| Comeback threshold | ≥ 8-day difference between consecutive music days | A full empty week is a real break, not a skipped day | Auto |
| Retroactive award | Mount-time evaluation; anything found → one summary message with a count, no per-badge announcements | Request: no flood; catch-up uses the same path | Auto |
| Trigger | `savedCount` prop from `ProfileScreen` | Incremented after persistence (`ProfileScreen.tsx:88-97`); no change to `LogPractice`/`practiceStore` | Auto |
| Mount point | One `<BadgesCard>` in `ProfileScreen` between the logging block and `WeekView`; `App.tsx` untouched | Announcement visible right after saving; minimal edit for S-08/S-09 merges | Auto |
| Collection visibility | Toggle appears only after the first badge; collapsed by default; no count | FR-007 "not visible on any list before"; short visits (NFR) | Auto |
| Multiple badges per save | One announcement listing them | No pop-up sequence | Auto |
| Weekly goal read | Raw `weeklyGoal` key checked with exported `validateGoal`; `src/weekly-goal/**` unchanged | Keeps the edit surface inside `src/badges/` | Auto |
| `profileStore.ts` header note about the `badges` key | Not added; ownership documented in `badgeStore.ts` | S-09 likely edits `profileStore.ts` | Auto |

## Scope
In: `src/badges/**` (new), two lines in `src/profile/ProfileScreen.tsx`, `e2e/badges.spec.ts`. Out: storage schema, `App.tsx`, practice/weekly-goal/month modules, Karta postępu, notifications, per-instrument badges.

## Architecture / Approach
Pure `catalog.ts` + `badgeRules.ts`; `badgeStore.ts` with `list()` and atomic `award(now)`; `BadgesCard.tsx` evaluates on mount (summary) and after each save (announcement) and shows the collection.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Badges, retroactive summary, collection | — | yes | Merge conflict in `ProfileScreen.tsx` with S-09 |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | Catalog, rules, copy | Threshold boundaries |
| 2 | 1 | `badges` record, atomic award | idb transaction auto-commit |
| 3 | 1 | Card + mount in `ProfileScreen` | Announcement visibility on small phones |
| 4 | 1 | E2E | Clock/offline flakiness |

Prerequisites: S-02 and S-03 merged (present on this base).

## Open risks & assumptions
- **Merge conflict with S-08/S-09** (soft guard): `ProfileScreen.tsx` gets one import and one JSX line; S-09 (instrument picker) will likely edit the same file near the logging block. Resolve at merge by keeping both edits; `App.tsx` is not touched.
- **Migration numbering**: S-05 adds no migration, so it cannot collide with a v6 added by S-09. The archived S-03 plan's note "v7 = S-05" is obsolete.
- **S-09 multi-instrument**: badges count all instruments together, matching "Dzień z muzyką… na dowolnym instrumencie"; S-09 needs no change here.
- **Badge frequency**: thresholds are a first guess; tune in `catalog.ts` after real use (roadmap S-05 risk). Changing a threshold never revokes an earned badge.

## Success criteria (summary)
Unit tests for rules and store, card and App-flow tests, full suite, typecheck, lint, build, one e2e spec; manual on-device visibility and tone check.
