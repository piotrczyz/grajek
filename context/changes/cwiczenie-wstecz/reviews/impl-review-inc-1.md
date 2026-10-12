<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Practice backdating (up to 3 days back)

**Plan**: context/changes/cwiczenie-wstecz/plan.md   **Scope**: increment 1 (phases 1-3, full plan)   **Date**: 2026-10-12
**Round**: 1   **Verdict**: APPROVED   **Findings**: 2

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Scope classification
All 13 changed code files are named in the plan (`src/practice/{week,practiceStore,index,copy,LogPractice,WeekView}.ts(x)`, their tests, `src/profile/ProfileScreen.tsx`, `src/App.test.tsx`, `e2e/practice-backdating.spec.ts`). No out-of-plan files; nothing planned is missing. No `context/architecture/model.c4`, so the architecture gate does not apply. Not bug mode.

## Plan adherence (evidence)
- `week.ts:43-72` — `BACKDATE_DAYS`, `backdateDays` (local parts), `weekdayIndex`, `WEEKDAY_GENITIVE` exactly per contract; exported from `index.ts`.
- `practiceStore.ts:116-127` — absent `day` stamps today at save time; a `day` outside `backdateDays(now())` throws `PracticeError('invalid','day')`; reason union extended; doc comments updated.
- `LogPractice.tsx:73-95,132-155` — day radiogroup "Kiedy grałeś?" above durations; Dziś preselected; `day` sent only when a past chip is chosen (midnight-safe, per Key decisions); 3-days-ago chip uses short label with full name as accessible name.
- `WeekView.tsx:23-77` — only empty days 1-3 back become buttons, only with `onLogDay`; neutral dashed look, no red.
- `ProfileScreen.tsx:79-134` — `openPanel(day?)`, `onLogDay` withheld while the panel is open, message chosen from `practice.day` vs today at save time.
- Tests cover every plan test goal: window across month boundary and DST (`week.test.ts`), accept/reject cases incl. malformed and empty day and Saturday-on-Monday (`practiceStore.test.ts`), AC-01/02/03/05 with a faked `Date` only (`App.test.tsx`, timers restored in `afterEach`), existing midnight test untouched, e2e on a fixed Wednesday tapping Monday with offline reload.

## Success criteria (run by reviewer, round 1)
| Check | Result |
|---|---|
| `pnpm exec vitest run --reporter=json` (full suite, covers 1.1, 2.1, 3.1) | PASS — 469/469, 0 failed |
| `pnpm lint` (2.2) | PASS — exit 0 |
| `pnpm typecheck` (1.2, 2.2) | PASS — exit 0 |
| `pnpm build` (3.2) | PASS — exit 0, service worker generated |
| `pnpm test:e2e e2e/practice-backdating.spec.ts e2e/practice.spec.ts` (3.3, with `PLAYWRIGHT_BROWSERS_PATH` set to the local browser cache) | PASS — 2 passed |
| 3.4 Manual (phone: speed of logging yesterday, neutral but tappable past days) | PENDING — diff evidence: chips in `LogPractice.tsx:132-155`, dashed neutral button `WeekView.tsx:65-74`; left for the human on the preview |

## Findings
### F1 — Stale home-screen clock can drop a tapped day across midnight
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/practice/LogPractice.tsx:75, src/profile/ProfileScreen.tsx:29
- **Detail**: `ProfileScreen`'s `now` only refreshes on save (pre-existing). If the app stays open past midnight, the week view's tappable days are computed from yesterday's clock while the panel builds its chips from a fresh `new Date()`; a tapped day that has just left the window falls back to "Dziś" silently. Likewise a panel left open across midnight with the 3-days-back chip selected is rejected by the store and shows the generic retry message. Both are narrow edges; the store guard keeps data correct.
- **Fix**: none required now; a later change could refresh `now` on visibility/focus.
- **Decision**: ACCEPT — rare edge, data stays valid, stale-clock behaviour predates this change and the plan keeps the store as the single authority.

### F2 — Tappable day carries two accessible names
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Pattern Consistency
- **Location**: src/practice/WeekView.tsx:57-74
- **Detail**: the `<li>` keeps its day `aria-label` and the nested button adds "<Dzień>: dopisz granie". Screen readers announce both, which is understandable and matches the plan's "existing accessible day name plus a hint".
- **Fix**: none.
- **Decision**: ACCEPT — as planned (Critical Implementation Details).

## Notes
- Diff exceeded the inline size threshold (13 code files); two read-only evidence passes were launched, but the decisions above rest on the reviewer's own reading of the full source and test diff.
