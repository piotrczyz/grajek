# Weekly goal (Cel tygodniowy) — Plan Brief
Full plan: [plan.md](plan.md) · request: [change.md](change.md) · roadmap slice S-03: `context/foundation/roadmap.md` (Slices, S-03)

## What & why
FR-002 and the rest of US-01: the student picks how many days a week they want to play (N of 7, always with a spare day), sees "3 z 4 dni" on the home screen right after logging, and sees the goal marked when reached. Every week is a fresh start. After a few reached weeks Grajek gently offers one more day. No points or streaks (ADR 0002).

## Starting point
S-02 is on this branch: `ProfileScreen` already keeps the current week's Dni z muzyką (`musicDays`) and refreshes it after each save. Schema v4 (`profile`, `instruments`, `practiceTime`, `practices`). `App.tsx` mounts `ProfileScreen` + `PracticeTimeCard`.

## Desired end state
Under the week row: a goal chooser (1–6, 3 preselected, 3–4 "dobry start", spare-day note) or the progress "X z N dni" / amber "Cel osiągnięty!" with "Zmień". After 3 reached weeks on the same goal (goal < 6): an optional "Chcesz spróbować N+1 dni?" with an equally easy "Zostaję przy N".

## Complexity
LOW — one self-contained module plus a one-line mount, no migration and no shared-contract change. The only non-trivial logic is the week-based raise rule, which is pure and unit-tested.

Skipped: rs-research (the relevant code, storage, practice, profile and practice-time, is small and was read directly) and rs-frame (the request states a roadmap outcome, not a cause or a fix; scope is set by FR-002 and the slice). Jev unavailable (dry mode), decided here.

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Areas | A1 cel-tygodniowy, no dependencies; kept as one area | Orchestrator split; the code confirms it is file-disjoint | Orchestrator |
| Increments | One increment, 3 phases | Caller prefers one; a goal without its UI is not deployable value; fits the 4-phase budget | Orchestrator |
| Research / framing | Both skipped | Small, directly read codebase; outcome-shaped request | Auto (Jev unavailable) |
| Spare day | Goal options are 1..6; 7 is never offered and is rejected by validation and the store | PRD `prd.md:114` "cel nigdy nie wymaga wszystkich 7 dni"; glossary `glossary.md:20` | Auto |
| Default / suggestion | 3 preselected; 3 and 4 tagged "dobry start" | PRD `prd.md:70,118` "sugeruje rozsądny start (3–4 dni)"; the lower end is gentler for 7-year-olds | Auto |
| Where to persist | Existing `profile` store, fixed key `weeklyGoal`; no new store, no migration | Caller prefers no migration; `profile` has out-of-line keys (`migrations.ts:27`) and `profileStore` touches only key `current` (`profileStore.ts:77,87,114`); same never-leaves-device class | Orchestrator |
| IndexedDB version | None used; v6 reserved for S-03 stays unused | Follows from the row above; no renumbering at merge | Auto |
| Record shape | `{ daysPerWeek, since (Monday), raiseDeclinedWeek?, updatedAt }` | Smallest state that drives progress and the raise rule; reached weeks are recomputed from practices, never stored | Auto |
| Current-week count | `musicDays.size` from `ProfileScreen` | Already deduplicated per day and live after a save (`ProfileScreen.tsx:39-53`); US-01 AC `prd.md:59` | Auto |
| Card placement | `WeeklyGoalCard` mounted in `ProfileScreen` under `WeekView`; `App.tsx` unchanged | Caller: minimal `App.tsx` changes; PRD: rule met "tuż po zapisie" (`prd.md:118`) | Orchestrator |
| Module | New `src/weekly-goal/` mirroring `src/practice-time/` | Established module pattern; keeps parallel S-04/S-05/S-06 file-disjoint | Auto |
| Reached display | Below goal "X z N dni"; reached → "Cel osiągnięty!" + "W tym tygodniu: X dni z muzyką" | FR-002 AC `prd.md:69`; avoids an odd "5 z 4" | Auto |
| Fresh start | Progress reads only the current week; no copy for past or missed weeks; copy test bans failure wording | PRD `prd.md:116` "brak komunikatów o porażce" | Auto |
| "Several" weeks | 3 consecutive completed weeks reached on the current goal, counted only after the week it was set | PRD "kilku zaliczonych tygodni"; excluding the partial setup week avoids an instant offer | Auto |
| Raise UX | Optional block, accept = N+1, decline "Zostaję przy N" hides it for 3 more reached weeks; never for goal 6; no automatic raise | Roadmap S-03 risk: the offer may feel like pressure | Auto |
| Past-week data | `practiceStore.listWeek(date)` for the 3 previous weeks; `practiceStore.ts` untouched | It takes any date (`practiceStore.ts:126`); avoids touching a file S-04 may extend | Auto |
| First-run step | None; goal chosen from the home screen | S-07 precedent: extra start steps lengthen first launch | Auto |
| Errors | Load failure hides the card; save failure shows `RETRY_MESSAGE`; past-week failure hides only the offer | Mirrors `PracticeTimeCard.tsx:49-70` | Auto |

## Scope
In: `src/weekly-goal/**` (rules, store, copy, card, tests), one mount in `ProfileScreen.tsx`, a comment in `profileStore.ts`, an App test, `e2e/weekly-goal.spec.ts`.
Out: migrations and `src/storage/**`, `App.tsx`, streaks/points, history, first-run goal step, per-instrument goals, reminders.

## Architecture / Approach
Pure rules in `weeklyGoal.ts`; persistence in `weeklyGoalStore.ts` via `createConnection`; `WeeklyGoalCard` gets `musicDayCount`, `now`, `practiceStore` from `ProfileScreen`.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Goal choice, "X z N dni", reached marker, gentle raise offer | — | yes | Raise offer tone felt as pressure |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | Rules + store in `profile` under `weeklyGoal` | Week boundaries across DST |
| 2 | 1 | Card + mount, progress and reached marker | Child-friendly sizing |
| 3 | 1 | Raise offer + offline e2e | Offer wording |

Prerequisites: S-02 present on this branch (stacked); dependencies installed.

## Open risks & assumptions
- Parallel S-04 may also edit `ProfileScreen.tsx`; this change adds only one import and one element there, so a merge conflict is trivial.
- Tone of the raise offer and the reached marker needs a human check on a phone (Manual 2.5, 3.6).

## Success criteria (summary)
`pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm typecheck`, `pnpm lint` pass; no file under `src/storage/` and no change to `App.tsx`; FR-002 AC (0 z 4 → reached after 4 distinct days) covered by tests.
