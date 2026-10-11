<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Unannounced effort badges and the earned-badges collection

**Plan**: context/changes/odznaki-za-wysilek/plan.md   **Scope**: increment 1 (phases 1-4, full plan)   **Date**: 2026-10-11
**Round**: 1   **Verdict**: APPROVED   **Findings**: 5

Diff base: `feat/cel-tygodniowy/1...HEAD` (stacked on the weekly-goal increment). 14 code files (+1407 lines incl. tests); two read-only evidence subagents (plan drift; safety/patterns), decisions taken here.

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Plan adherence summary
- All planned files present; no MISSING, no EXTRA code. Files in diff outside the plan's file list: only `change.md` and `plan-brief.md` (normal plan artifacts, no guard).
- `catalog.ts`: 15 ids, names, icons, thresholds equal the plan table. `badgeRules.ts`: contract, `mondayOf` via `weekStart` (local parts), reached weeks `>= since` unioned with remembered, comeback `>= 8` with UTC day arithmetic. `copy.ts`: constants and Polish plurals (1/2-4/5+/12-14/22) correct, `retroSummary` uses the accusative forms.
- `badgeStore.ts:95-124`: one readwrite tx over `practices`+`profile`, only IDB requests awaited inside, write only on change, merge never replaces earned entries, header comment present.
- `BadgesCard.tsx`: summary on mount, announcement on `savedCount` change, `role="status"`, "Super!" dismiss, toggle only when something is earned, collapsed, `aria-expanded`, `min-h-14`, amber/no red, failure renders nothing.
- `ProfileScreen.tsx`: exactly one import + one JSX line (`:2`, `:108`) between the logging block and `WeekView`. No migration, `App.tsx`, `src/storage/**`, `src/weekly-goal/**` untouched.

## Success criteria
| # | Command | Result |
|---|---|---|
| 1.1/2.1/3.1 | `pnpm exec vitest run --reporter=json` (full suite) | PASS — 320/320 tests, 100 files; badges: rules 18, card 8, flow 2, store 9, catalog 4, copy 3 |
| 1.2/2.2/3.2 | `pnpm typecheck` (`tsc -b`) | PASS (exit 0) |
| 1.3/2.3/3.3 | `pnpm lint` (`eslint .`) | PASS (exit 0) |
| 3.4 | `pnpm build` | PASS (exit 0, PWA precache generated) |
| 4.1/4.2 | `playwright test` (full e2e, temporary unstaged config on port 4391 to avoid clashing with other worktrees; removed after) | PASS — 13/13, incl. `badges.spec.ts` |
| 3.5 (Manual) | On a phone, announcement visible without scrolling, reads as praise | PENDING — diff evidence: card mounted directly under the logging block (`ProfileScreen.tsx:108`), `text-7xl` icon, copy test forbids talent/loss wording; on-device check left to the human (`manual-pending`) |

No `context/architecture/model.c4`: architecture gate not applicable. Not bug mode.

## Findings
### F1 — Save-triggered result clears a still-visible summary or announcement
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/badges/BadgesCard.tsx:52-55
- **Detail**: A save that earns nothing sets `message` to null, so a retro summary or a previous announcement still on screen disappears. The plan specifies exactly this ("stay until 'Super!' or the next save"; "Nothing new → nothing shown"). The out-of-order case (mount award resolving after a save award) cannot happen in practice: IndexedDB serializes the readwrite transactions and a save needs several taps after mount.
- **Fix**: none needed.
- **Decision**: DISMISS — behaviour is the planned UI timing (plan, "UI timing").

### F2 — A `list()` failure after a committed `award()` loses the announcement
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/badges/BadgesCard.tsx:46-63
- **Detail**: If `award` commits and the following `list()` on the same connection rejects, the block hides and those badges are never announced (they stay earned and appear in the collection on the next successful load). Requires a storage failure between two back-to-back reads; the plan's "any storage failure → the block renders nothing" covers it.
- **Fix**: optional later: set the message from `fresh` before awaiting `list()`.
- **Decision**: ACCEPT — within the planned failure behaviour; no badge is lost.

### F3 — Unknown badge ids are dropped on the next write
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/badges/badgeStore.ts:55, 113-123
- **Detail**: `usable()` drops ids not in the catalog and `award` rewrites the record when content differs, so a badge id removed from a future catalog (or a rollback from a future build that adds ids) would be deleted. The plan explicitly specifies the guard to drop unknown ids; rollback to a pre-badges build is safe as stated in Migration Notes.
- **Fix**: if the catalog ever shrinks or a downgrade must be supported, preserve unknown entries on write.
- **Decision**: ACCEPT — matches the planned `usable()` contract (plan, "Atomic award"); note for future catalog edits.

### F4 — Practice `day` is not re-validated before evaluation
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/badges/badgeRules.ts:34-36, 59-62
- **Detail**: A malformed `day` would yield a `NaN-NaN-NaN` week key. Unreachable: `practiceStore.add` is the only writer and sets `day: dayKey(at)` (`src/practice/practiceStore.ts:104`).
- **Fix**: none needed.
- **Decision**: DISMISS — the only writer always produces a valid day key.

### F5 — `badgeCountLabel` has no caller in the UI
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Pattern Consistency
- **Location**: src/badges/copy.ts:25
- **Detail**: Required by the plan's `copy.ts` contract and unit-tested, but only `retroSummary` is rendered.
- **Fix**: none; keep for later use or drop in a future cleanup.
- **Decision**: ACCEPT — planned contract.

## Risks carried from the plan
- Merge conflict in `src/profile/ProfileScreen.tsx` with S-08/S-09 (two lines; keep both edits at merge). No migration, so no v6 numbering collision with S-09.
