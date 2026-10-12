# Fix round 1: cwiczenie-wstecz increment 1 (client feedback 1)

**Report**: `reviews/impl-review-inc-1-feedback-1.md`   **Date**: 2026-10-12

## Findings addressed
- **F1** — the day picker in `src/practice/LogPractice.tsx` is now one non-wrapping row (`relative flex flex-nowrap gap-2`) rendered from `[...days].reverse()`: oldest on the left, "Dziś" on the right and preselected. `backdateDays` order, `days[0]` as today and the save logic are untouched. Labels: `<short weekday>` · `<short weekday>` · `Wczoraj` · `Dziś`; the two weekday chips carry the full weekday as accessible name. Chips use `text-lg`, `px-2`, `whitespace-nowrap`, `flex-auto`, keep `min-h-14` and the `chipClass` colours (`chipClass` gained an optional size argument so `text-lg` does not compete with `text-xl`). A decorative line (`aria-hidden`, `pointer-events-none`, `h-0.5 bg-white/30`, vertically centred) sits behind the row; each chip sits in an opaque `bg-brand` wrapper so the line never shows through a translucent chip. `DAY_BEFORE_CHIP` removed from `src/practice/copy.ts`. Doc comment updated.
- **F2** — unit test asserts order `['Nd','Pn','Wczoraj','Dziś']`, full-weekday accessible names, "Dziś" last and the only checked chip; a new unit test saves the oldest (reversed) chip with its key; today still saves without `day` (existing test). `Przedwczoraj` queries replaced: unit and App AC-03 → "Poniedziałek", App AC-05 → "Sobota", e2e → "Poniedziałek". New e2e test at a 360 x 780 viewport: four radios share one row (equal `y`), ordered left → right with "Dziś" rightmost and checked, each label on one line without overflow (`scrollWidth <= clientWidth`, one client rect), right edge ≤ 360.

## Adaptation
- Plan's Desired End State / Critical Implementation Details describe the old order "Dziś (preselected) · Wczoraj · Przedwczoraj · …"; client feedback 1 supersedes it (oldest → today, short weekday labels instead of "Przedwczoraj"). plan.md left as is (outside the writable sections).
- Chip padding `px-2` instead of the report's `px-3`: the root font size is 18 px (`src/index.css`), so `px-3` + `text-lg` risked overflowing 306 px of usable width at 360 px; the e2e fit check passes with `px-2`.

## Verification (after the fix)
| Command | Last lines |
|---|---|
| `pnpm test src/practice/LogPractice.test.tsx src/practice/WeekView.test.tsx` (2.1) | `Test Files 2 passed (2)` / `Tests 25 passed (25)` |
| `pnpm lint && pnpm typecheck` (2.2) | `eslint .` exit 0, `tsc -b` exit 0 |
| `pnpm test` (3.1, full suite) | `Test Files 45 passed (45)` / `Tests 470 passed (470)` |
| `pnpm build` (3.2) | exit 0 (`dist/sw.js` generated) |
| `PLAYWRIGHT_BROWSERS_PATH=C:\Users\NUC\AppData\Local\ms-playwright pnpm test:e2e e2e/practice-backdating.spec.ts e2e/practice.spec.ts` (3.3) | `3 passed (6.4s)` incl. the new 360 px test |

## Baseline comparison
Reviewer's baseline: 469 tests, 468 passed + 1 known flake (F3, `WeeklyGoalCard.test.tsx`). Now 470/470 (one new unit test); no new failures, the flake did not recur.

## Red-first proof (fix reverted: `LogPractice.tsx`, `copy.ts` restored to HEAD, tests kept)
- `pnpm test src/practice/LogPractice.test.tsx src/App.test.tsx` → `Tests 4 failed | 41 passed (45)`: "offers 3 days back and today as a timeline…", "preselects initialDay and saves it right away", "AC-03…", "AC-05…".
- `pnpm test:e2e e2e/practice-backdating.spec.ts` → `2 failed` ("the day choice is one timeline row…" `toHaveText` failed; the offline backdating test: element not found).
- Fix restored → all green (table above).
