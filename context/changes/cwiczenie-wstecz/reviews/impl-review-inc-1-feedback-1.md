<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Practice backdating (up to 3 days back) — client feedback 1

**Plan**: context/changes/cwiczenie-wstecz/plan.md   **Scope**: increment 1 (phases 1-3), feedback cycle 1 (`reviews/feedback-inc-1-1.md`)   **Date**: 2026-10-12
**Round**: 1   **Verdict**: NEEDS_ATTENTION   **Findings**: 3

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Feedback analysis
The client (product owner, PR #18) asks that the "Kiedy grałeś?" day picker become a one-row timeline: oldest day on the left, "Dziś" on the right (still preselected), fitting a ~360 px phone with no text wrapping, readable for children 7-13, optionally with a subtle connecting line.

Verified against the code: `src/practice/LogPractice.tsx:136` renders the group as `grid grid-cols-2` and iterates `days` in `backdateDays` order (today first, `src/practice/week.ts` `backdateDays`), labels `[Dziś, Wczoraj, Przedwczoraj, <weekday short>]` (`LogPractice.tsx:139`). So the client sees a 2x2 grid Dziś, Wczoraj / Przedwczoraj, <weekday> — the claim is accurate. The plan itself specified this order (plan.md, Desired End State and Critical Implementation Details), so this is a requested change of the agreed layout, not a defect: `WARNING`, `FIX`.

Fit at 360 px: the app column has `px-6` (`src/App.tsx:52`), leaving 312 px. Four equal columns with `gap-2` give 72 px per chip, ~52 px of text after `px-2` and the border. "Przedwczoraj" cannot fit in a quarter of that row at any size a child can read (≈ 110 px at 16 px bold), and "Wczoraj" does not fit in an equal quarter at `text-lg`. Hence the label decision in F1 (Auto: the client's own example offers "Sob/Przedwczoraj"; the short weekday names are the ones the week row already uses, `WEEKDAY_LABELS`) and content-sized chips instead of equal columns. Estimate at `text-lg` bold, `px-3`: Pt ≈ 50, So ≈ 50, Wczoraj ≈ 96, Dziś ≈ 68, plus 3 gaps = ≈ 288 px ≤ 312 px. The e2e check in F2 makes the fit a measured fact rather than an estimate.

## Findings

### F1 — Day picker must be a one-row, oldest-to-today timeline
- **Severity**: WARNING
- **Impact**: MEDIUM
- **Dimension**: Plan Adherence
- **Location**: src/practice/LogPractice.tsx:132-155
- **Detail**: Client comment: "Wybór dnia … ma wyglądać jak oś czasu — wszystkie 4 dni w JEDNEJ linii, chronologicznie od najstarszego do dzisiaj, od lewej do prawej … „Dziś” nadal domyślnie zaznaczone … Musi się mieścić na wąskim telefonie (ok. 360 px) bez łamania tekstu … rozważ wizualny akcent osi (np. linia łącząca), ale bez przesady." The group is a 2x2 grid in today-first order, and "Przedwczoraj" cannot fit one row at 360 px.
- **Fix**: In `LogPractice.tsx` only: render the chips from a reversed copy (`[...days].reverse()`) while leaving `backdateDays` order, `days[0]` (today) and the save logic untouched; replace `grid grid-cols-2` with a single non-wrapping row (`flex flex-nowrap gap-2`, chips `flex-auto whitespace-nowrap px-3 text-lg`, keep `min-h-14` touch height and `chipClass` colours); visible labels oldest → today: `<short weekday>` · `<short weekday>` · `Wczoraj` · `Dziś` (e.g. on Monday "Pt · So · Wczoraj · Dziś"), each short-weekday chip's accessible name is its full weekday (`WEEKDAY_LABELS[…].full`, the existing pattern of the 3-days-back chip); `DAY_BEFORE_CHIP` is then unused — remove it from `copy.ts`; add one decorative connecting line behind the row (`aria-hidden`, `pointer-events-none`, thin and low-contrast, e.g. `h-0.5 bg-white/30` at vertical centre) that never shows through a chip's text (chips get an opaque background, or the line sits only between chips); update the component doc comment ("oldest on the left, today on the right, preselected").
- **Decision**: FIX — client feedback; one unambiguous change. Label choice is Auto (see Feedback analysis).

### F2 — Tests must pin the new order, labels and the 360 px fit
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Success Criteria
- **Location**: src/practice/LogPractice.test.tsx:181-229; src/App.test.tsx:466-494; e2e/practice-backdating.spec.ts:35
- **Detail**: Client: "Zaktualizować testy (unit/integracyjne/e2e) do nowego układu." Current tests assert the old order (`['Dziś','Wczoraj','Przedwczoraj','Nd']`) and query `name: 'Przedwczoraj'` (unit `:218`, App AC-03 `:471`, AC-05 `:494`, e2e `:35`), which F1 removes. No test checks single-row layout or width.
- **Fix**: Unit: assert chip text order oldest → today (for the fixed clock in `renderPanel`, `['Nd','Pn','Wczoraj','Dziś']`-style per that date), accessible names of the two weekday chips are full weekdays, "Dziś" is the last chip and the only checked one, and the reversed rendering still saves today without `day` and a past chip with its key; replace `name: 'Przedwczoraj'` queries in unit, App (AC-03 → "Poniedziałek", AC-05 → "Sobota") and e2e (→ "Poniedziałek") with the full weekday; e2e: add a test (or extend `practice-backdating.spec.ts`) with `page.setViewportSize({ width: 360, height: 780 })` that opens the panel and asserts the four radios of "Kiedy grałeś?" share one row (equal `boundingBox().y`), are ordered left → right by `x` with "Dziś" rightmost and checked, each chip's text does not wrap or overflow (`scrollWidth <= clientWidth` and a single line height), and the row's right edge is ≤ 360.
- **Decision**: FIX — required by the feedback and by F1.

### F3 — One flaky unrelated test under full-suite load
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Success Criteria
- **Location**: src/weekly-goal/WeeklyGoalCard.test.tsx:79
- **Detail**: Full suite 469 tests, 468 passed, 1 failed ("holds a reload onto a new version once the student changes the choice, until the goal is saved", `expected true to be false`). The file is untouched by this branch (`git diff origin/main...HEAD -- src/weekly-goal` empty) and passes 14/14 when run alone; round 1 of the original review had 469/469. Timing flake under parallel load, not a regression of this change.
- **Fix**: none in this change; worth its own issue if it recurs.
- **Decision**: ACCEPT — out of scope of this change, pre-existing file.

## Success criteria (run by reviewer, feedback round 1, on HEAD a90a966)
| Check | Result |
|---|---|
| `pnpm test --reporter=json` (full suite; covers 1.1, 2.1, 3.1) | PASS with one unrelated flake — 468/469 (F3); the flaky file passes 14/14 alone |
| `pnpm typecheck` (1.2, 2.2) | PASS |
| `pnpm lint` (2.2) | PASS |
| `pnpm build` (3.2) | PASS |
| `PLAYWRIGHT_BROWSERS_PATH=… pnpm test:e2e e2e/practice-backdating.spec.ts e2e/practice.spec.ts` (3.3) | PASS — 2/2 (Pixel 7 project, 412 px; no 360 px check exists yet, F2) |
| 3.4 Manual (phone feel) | pending — client preview |

## Notes for the implementer
- The plan's Desired End State and Critical Implementation Details still describe the old order ("Dziś (preselected) · Wczoraj · Przedwczoraj · …"); the feedback supersedes them. Record it as an adaptation in `reviews/fix-r1.md`; plan.md is outside your writable sections.
- Files of the fix: `src/practice/LogPractice.tsx`, `src/practice/copy.ts` (remove `DAY_BEFORE_CHIP`), `src/practice/LogPractice.test.tsx`, `src/App.test.tsx`, `e2e/practice-backdating.spec.ts`. No store, week-window or WeekView change.
- Re-run: phase 2 criteria (2.1, 2.2), 3.1, 3.2, 3.3 with the browsers path above.
