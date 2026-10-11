<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Pora ćwiczeń (practice time)

**Plan**: context/changes/pora-cwiczen/plan.md   **Scope**: increment 1 (phases 1-4, full plan)   **Date**: 2026-10-11
**Round**: 1   **Verdict**: APPROVED   **Findings**: 3

Diff base: `246ca4d` (F-01 + S-01, stacked, not yet on main). 13 code files (≈600 source lines, ≈450 test lines), plus `context/`.

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Plan adherence (three-way classification)
Every changed file is in the plan, and every planned file is in the diff. No unplanned files.
- Phase 1: `src/storage/migrations.ts:28-33` appends v3 `practiceTime` (out-of-line keys), existing entries untouched. `src/storage/db.ts:37-63` adds `blocking` (close + notify) and `terminated` (notify), with `onClose` fired at most once. `src/storage/connection.ts:14-32` matches the contract and guards against stale callbacks (`connection === current`). `src/profile/profileStore.ts:80-82` now uses the helper. `profileStore.test.ts` is unchanged and passes.
- Phase 2: `src/practice-time/practiceTime.ts` matches the contract (types, `PLACE_MAX_LENGTH`, `DEFAULT_SLOT`, `validatePracticeTime` reasons, `weekdayOf`, `slotFor`). Store: `practiceTimeStore.ts:40-59` validates, stamps `updatedAt` and calls `put` under `current`. `index.ts` re-exports the public API.
- Phase 3: the copy matches the plan. The card has loading/failed (null), display and edit states, `aria-pressed` day toggles, per-day inputs prefilled from the default, Save disabled while invalid or saving, and a `RETRY_MESSAGE` alert on save failure. `App.tsx` gets only the import and the mount. `App.test.tsx` is unchanged.
- Phase 4: `e2e/practice-time.spec.ts` covers default + override, reload, and offline reload under a controlling service worker, following the `profile.spec.ts` pattern.

## Success criteria
| # | Command | Result |
|---|---|---|
| 1.1 / 1.2 / 2.1 / 3.1 | `pnpm exec vitest run --reporter=json` (full suite, once) | PASS: 67/67 tests, 8 files (storage 18, practice-time 30, profile 11, App 8) |
| 1.3 / 2.2 / 3.2 | `pnpm typecheck` (`tsc -b`) | PASS (exit 0) |
| 1.3 / 2.2 / 3.2 | `pnpm lint` | PASS (exit 0) |
| 3.2 | `pnpm build` | PASS (exit 0, SW generated, 12 precache entries) |
| 4.1 | `CI=1 pnpm test:e2e` | PASS: 5/5, including `practice-time.spec.ts` |
| 3.3 (Manual) | Thumb usability on a phone | pending: diff evidence exists (`min-h-14` toggles in `grid-cols-7`, `type="time"`), so it goes to the human on the preview |

Architecture gate: no `context/architecture/model.c4`, so the gate does not apply. Bug-mode gate: not bug mode.

## Findings

### F1 — Day toggles: accessible name differs from the visible label
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/practice-time/PracticeTimeCard.tsx:196-203
- **Detail**: Each toggle shows "Pn" … "Nd" but its accessible name is "poniedziałek" … "niedziela" (`aria-label`). Voice-control users who say the visible label will not match (WCAG 2.5.3, label in name). The plan specifies these names explicitly (Phase 3, Copy).
- **Fix**: Optionally render the short label with `aria-hidden` and the full name `sr-only` inside the button, instead of `aria-label`.
- **Decision**: ACCEPT. The plan made this choice deliberately, and it is minor.

### F2 — "Zapisz" disabled without saying why
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Pattern Consistency
- **Location**: src/practice-time/PracticeTimeCard.tsx:130, 241
- **Detail**: Clearing a time or place (default or a selected day's) silently disables Save. With several day sections open, a child may not see which field is empty. This matches the plan ("disabled while invalid") and the S-01 create-profile pattern.
- **Fix**: A later slice could add an inline hint next to the invalid field.
- **Decision**: ACCEPT. Planned behaviour; candidate feedback for the preview check.

### F3 — Loaded record is trusted without validation
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/practice-time/practiceTimeStore.ts:43-47, PracticeTimeCard.tsx:97-98
- **Detail**: `load` casts the stored value. A malformed record would make `slotFor(...).time` throw during render, and `App` has no error boundary. Only the validated `save` writes this store, so the risk is theoretical today. It becomes relevant once S-08 or a sync writes the same record.
- **Fix**: When another writer appears, validate on load and treat an invalid record as `null`.
- **Decision**: ACCEPT. There is a single writer today.

## Notes
- Two connections per page now exist (profile store and practice-time store). Both release on `blocking`, so a newer build's upgrade is not stalled. `connection.test.ts:58-76` covers this.
- Parallel-merge risk (F-02/S-02 v3) stays as recorded in the brief. The tests use `migrations.length` and `arrayContaining`, so a renumbering on rebase stays green.

## Key decisions
| Decision | Choice | Source |
|---|---|---|
| Evidence subagents | Not spawned. All ≈1050 code lines were read in full inline, which covers the plan-drift and safety passes, and two sonnet re-reads would add nothing | Auto |
| Dependencies | Existing `node_modules` in the worktree reused, no install | Auto |
| e2e | Run with `CI=1` so Playwright does not reuse another worktree's preview server | Auto (caller instruction) |
| Findings F1-F3 | ACCEPT (observations, planned or theoretical) | Auto |
| Status | `implemented` → `impl_reviewed` (APPROVED, single and last increment) | Auto |
