<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Weekly goal with a spare day and current-week progress

**Plan**: context/changes/cel-tygodniowy/plan.md   **Scope**: increment 1 (phases 1-3, full plan)   **Date**: 2026-10-11
**Round**: 1   **Verdict**: APPROVED   **Findings**: 6

Diff base: `e4e6ed3` (feat/zapis-cwiczenia/1, the unmerged prerequisite stack), not `origin/main`.
Both passes were done directly on every non-test source file in the diff (`weeklyGoal.ts`, `weeklyGoalStore.ts`, `copy.ts`, `index.ts`, `WeeklyGoalCard.tsx`, `ProfileScreen.tsx`, `profileStore.ts`) plus `e2e/weekly-goal.spec.ts` and the `App.test.tsx` addition, then cross-checked against two read-only evidence subagents (plan drift: all items MATCH except the copy adaptations in F1, nothing MISSING, no out-of-plan files; safety/patterns: no CRITICAL, barrel imports verified, three minor items recorded as F4-F6).

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Classification of the diff
- In plan AND diff: all 13 code files (`src/weekly-goal/**` 10 files, `src/profile/ProfileScreen.tsx` +2 lines, `src/profile/profileStore.ts` comment only, `src/App.test.tsx`, `e2e/weekly-goal.spec.ts`).
- In diff NOT plan: none.
- In plan NOT diff: none.
- `src/storage/**` and `src/App.tsx` untouched (verified by `git diff --name-only e4e6ed3..HEAD`).
- No `context/architecture/model.c4`: architecture gate not applicable. Not bug mode.

## Plan drift checks (MATCH unless noted)
- Rules (`weeklyGoal.ts:8-76`): options 1..6, `GOAL_MAX=6`, default 3, suggested [3,4], `RAISE_AFTER_WEEKS=3`; `validateGoal` reasons; `isReached` `>=`; `previousWeekStarts` from local date parts (DST-safe); `shouldOfferRaise` = goal<6, 3 weeks, each reached, each start strictly after `since` and after `raiseDeclinedWeek` (string compare on `YYYY-MM-DD`, correct).
- Store (`weeklyGoalStore.ts:46-89`): `profile` store, key `weeklyGoal`, through `createConnection`; `setGoal` validates, sets `since`, drops `raiseDeclinedWeek`; `declineRaise` in one readwrite transaction, aborts and throws `missing` without a goal; invalid stored record loads `null`.
- Card (`WeeklyGoalCard.tsx`): states loading/failed/choose/progress; radiogroup with `role="radio"`/`aria-checked`, `min-h-14`; preselect current goal or 3; "Anuluj" only with an existing goal; `role="status"` progress line; amber reached marker; load failure renders nothing; save failure keeps chooser with `RETRY_MESSAGE`.
- Raise offer: past weeks read only when `currentWeek` / `canRaise` change (`:160-181`), never on save; result tagged with its week so a stale result is ignored (`:216`); failure hides only the offer; accept -> `setGoal(N+1)` (new `since` suppresses the offer), decline -> `declineRaise()`; equal-weight buttons; no count of reached weeks shown.
- Mount: one import + one element under `WeekView` (`ProfileScreen.tsx:7,107`); no new props.
- Tests listed in the plan exist (rules 21, store 10, card 13, copy 2, App +1, e2e +1).

## Success criteria (run locally, round 1)
| Check | Result |
|---|---|
| `vitest run --reporter=json` (full suite) | PASS — 158/158 tests, 50 suites, 0 failed |
| `pnpm typecheck` (`tsc -b`) | PASS (exit 0) |
| `pnpm lint` | PASS (exit 0) |
| `pnpm build` | PASS (exit 0, PWA precache 12 entries) |
| `pnpm test:e2e` | PASS — 7/7 incl. `weekly-goal.spec.ts`; run with a temporary uncommitted config on private port 4391 (`--strictPort`, no server reuse) against the fresh build, config deleted afterwards |
| no change under `src/storage/` | PASS |
| no change to `src/App.tsx` | PASS |
| 2.5 Manual (goal buttons / labels on a phone) | pending — no `[x]`, diff evidence present (`min-h-14` options, `text-3xl` labels) |
| 3.6 Manual (raise offer tone, equal buttons) | pending — diff evidence present (shared `offerButton` class) |

## Findings
### F1 — Goal save button reads "Ustaw cel", not "Zapisz"
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: src/weekly-goal/copy.ts:17
- **Detail**: The plan's copy contract names `SAVE` "Zapisz" (and `progressLabel` as plain "dni"; the code says "0 z 1 dnia" for a goal of 1, which is the correct Polish form); the implementation uses `SAVE_GOAL` "Ustaw cel" with a recorded reason: the logging panel shows its own "Zapisz" on the same screen, so two identical buttons would be ambiguous (and collide in role queries). The change is an improvement and is consistently covered by the App test and e2e.
- **Fix**: none needed.
- **Decision**: ACCEPT — deliberate, documented adaptation; raised as an `adaptation` guard.

### F2 — Loaded record only validates `daysPerWeek` and `since`
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/weekly-goal/weeklyGoalStore.ts:38-44
- **Detail**: `raiseDeclinedWeek`/`updatedAt` types are not checked. The record is written only by this module, and a malformed value can at worst suppress or allow the offer once; no crash path.
- **Fix**: none needed now.
- **Decision**: ACCEPT — within the plan's defensive scope ("daysPerWeek fails validation loads as null").

### F3 — A failed raise answer hides the offer for the session
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/weekly-goal/WeeklyGoalCard.tsx:218-229
- **Detail**: On a save failure `offerHidden` stays true until re-mount; the goal is unchanged.
- **Fix**: none.
- **Decision**: ACCEPT — matches the plan ("A failed past-week load or save just hides the block").

### F4 — Late raise-answer save can override a just-opened chooser
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/weekly-goal/WeeklyGoalCard.tsx:142-153
- **Detail**: `answer()` applies `setState({kind:'progress'})` when the save resolves without checking that the card is still in `progress`. Tapping "Zmień" inside the few-millisecond IndexedDB write window would close the chooser again. No data loss; the window is far shorter than a child's second tap.
- **Fix**: optional hardening later: apply the result only while the state is still `progress`.
- **Decision**: ACCEPT — negligible window, no data effect; not worth a fix round.

### F5 — Radio options are six tab stops without arrow-key navigation
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Pattern Consistency
- **Location**: src/weekly-goal/WeeklyGoalCard.tsx:309-328
- **Detail**: `button role="radio"` with correct `aria-checked`, but no roving tabindex. Identical to the existing instrument chooser (`CreateProfileScreen.tsx:75-85`), touch-first app.
- **Fix**: none in this change; a repo-wide a11y pass could adopt roving tabindex.
- **Decision**: ACCEPT — consistent with the established pattern.

### F6 — Store stamps weeks with its own clock, the card with the `now` prop
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/weekly-goal/weeklyGoalStore.ts:60,79; src/weekly-goal/WeeklyGoalCard.tsx:156
- **Detail**: Only if the app stays open across Monday midnight without a visibility change can `since`/`raiseDeclinedWeek` land in a different week than the card's `currentWeek`; the worst effect is one offer shown a week early or late. The store's real clock is the more correct value for persistence. Likewise the old week's count can flash for one IndexedDB read after a week change (existing `ProfileScreen` behaviour).
- **Fix**: none.
- **Decision**: ACCEPT — edge case with no harmful outcome.
