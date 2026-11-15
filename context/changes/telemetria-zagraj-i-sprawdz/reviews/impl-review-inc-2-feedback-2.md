<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Telemetry and accuracy feedback for "Zagraj i sprawdź" (client feedback 2)

**Plan**: context/changes/telemetria-zagraj-i-sprawdz/plan.md   **Scope**: increment 2 (phases 4-6), feedback cycle 2 (`reviews/feedback-inc-2-2.md`)   **Date**: 2026-11-15
**Round**: 1   **Verdict**: REJECTED   **Findings**: 3

Base: `feat/telemetria-zagraj-i-sprawdz/1` (stacked). Code is unchanged since the approved feedback-1 round 2 (`git diff --stat 274d514..HEAD` = only the feedback file), so the local suite results recorded there stand (609 unit, 18 e2e, typecheck, lint, build green on Windows). The owner reports that CI (ubuntu, job `check`) fails `e2e/spike-nuty-narrow.spec.ts:68`: worst-case `tableWidth` 331 > `sectionWidth` 324 at 360 px, also on retry. The owner asks to fix the layout, not the test, with margin for wider fonts. Jev hint `feedback_out_of_scope=no` (p=0.07) agrees: the feedback is a defect of this increment's F4 fix.

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | FAIL |

Architecture: no `context/architecture/model.c4`; gate not applicable. Success Criteria FAIL: the e2e criterion fails in CI, the only build that gates merge.

## Reproduction (local, Windows, Chromium, 360x800, worst-case rows of the spec)

Throwaway measurement spec (deleted afterwards) that fills the rows exactly as the spec's worst case does, then forces the table's font. Columns `#, Wzór, Gra, Cent, Czas, Ocena` in px:

| Font on `<table>` | Table scrollWidth / section | Column widths |
|---|---|---|
| default (`system-ui` → Segoe UI), 12 px | 324 / 324 | 24, 43, 35, 47, 92, 84 |
| default, 14 px | 324 / 324 | 24, 44, 35, 49, 87, 85 |
| Verdana / "DejaVu Sans", 12 px | **330** / 324 | 26, 48, 39, 54, 69, 93 |
| Verdana / "DejaVu Sans", 14 px | **340** / 324 | 27, 50, 40, 56, 72, 96 |
| Tahoma 12 / 14 px | 324 / 324 | — |

Verdana at 12 px reproduces CI's 331 within a pixel. With the default font the table already fills the section to the pixel (`w-full`), i.e. zero headroom: any font with wider glyphs overflows.

## Findings
### F1 — "Nuta po nucie" table overflows the 360 px section with wider fonts (CI red)
- **Severity**: CRITICAL
- **Impact**: MEDIUM
- **Dimension**: Success Criteria
- **Location**: src/spike-nuty/SpikeScreen.tsx:117-151 (`NotesTable`: `w-full table-auto`, `[&>td]:break-words`, `px-1` on 6 columns, `whitespace-nowrap` on the Cent cell); src/spike-nuty/results.ts:95 (timing `"<±ms> ms, <status>"` for late/early); src/spike-nuty/copy.ts:60 (`NOTE_COLUMNS`)
- **Detail**: In an auto-layout table each column's minimum width is its longest unbreakable token; `break-words` (`overflow-wrap: break-word`) does not lower that minimum, so it never shrinks the table. The six minimums plus 6 × 8 px padding sum to more than 324 px as soon as glyphs are a few percent wider than Segoe UI (DejaVu Sans on ubuntu CI). The Czas column also repeats the status word that Ocena already shows ("+1180 ms, za wcześnie" next to "za wcześnie"), which makes it the second-widest column for no information.
- **Fix**: Reduce the table's minimum width so the worst case fits at 360 px with a wide font at a larger size, without mid-word breaks (the owner's original complaint was "dobrz"): (a) mandatory: timing for late/early is the signed offset only (`copy.signedMs(offsetMs)`), the status word stays in Ocena; update `results.test.ts:87-88` and any SpikeScreen test that reads the old text; (b) then whatever combination of: tighter cell padding (e.g. `px-0.5` or `pl-0`/`pr-1`), drop `whitespace-nowrap` on Cent or keep "ms"/sign wrapping sensibly, `table-fixed` with explicit `colgroup` widths only if no cell ends up clipped, or a stacked/card row layout below `sm`. Acceptance bar: with the table forced to `font-family: "DejaVu Sans", Verdana, sans-serif` and `font-size: 14px`, worst-case `table.scrollWidth <= section.clientWidth` and no cell has `scrollWidth > clientWidth`, measured locally on Windows (Verdana is present there; DejaVu Sans is the CI font). Record those numbers in `fix-r1.md` of this cycle.
- **Decision**: FIXED (60d430f) — owner-requested, a red CI check blocks merge.

### F2 — The 360 px spec cannot catch font-dependent overflow on the developer's machine
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Success Criteria
- **Location**: e2e/spike-nuty-narrow.spec.ts:51-70 (worst-case block)
- **Detail**: The spec passed on Windows and failed only on ubuntu, because it measures with whatever default font the OS gives. Its worst-case texts also encode the timing format F1 removes (`'+1180 ms, za wcześnie'`), so after F1 they would no longer be texts the list can show.
- **Fix**: Keep both existing assertions (no clipped cell; table not wider than the section) for the real rows and the default-font worst case, and add a second worst-case measurement after forcing the table's font to `"DejaVu Sans", Verdana, sans-serif` at `14px` (inline style set in `evaluate`), asserting the same two conditions; update the worst-case texts to the longest values the code can actually render per column after F1 (Czas: alternate `−1180 ms`, `+1180 ms`, `za krótko`, `za długo`; Ocena: alternate `za wcześnie`, `dodatkowa`, `zła nuta`). Do not loosen any assertion or add a tolerance. Red-first proof: the new wide-font assertion fails on the current `NotesTable` (expected ~340 > 324 locally).
- **Decision**: FIXED (60d430f) — the owner asked that the test stay meaningful; this makes it fail locally for the same reason it failed in CI.

### F3 — Push and CI verification requested in the feedback
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Scope Discipline
- **Location**: reviews/feedback-inc-2-2.md (last paragraph)
- **Detail**: The owner asks to run the full suite, push to the same branch (PR #23, no new PR) and confirm green check-runs on the new head SHA via the GitHub API. Implementer and reviewer only commit (rs-core §5); pushing and watching CI are the orchestrator's publishing step.
- **Fix**: none in code; the caller pushes after the re-review and checks the `check` job on the new head, repeating the fix cycle if it is still red.
- **Decision**: ACCEPT — caller's step, not a code change.
