# Fix round r1 — increment 2, client feedback 1

**Report**: `reviews/impl-review-inc-2-feedback-1.md` (Round 1)   **Date**: 2026-11-15
**Findings fixed**: F1, F2, F3, F4, F5, F7   **Untouched**: F6 (ACCEPT; its README line rides with F7)

## What changed, per finding

| Finding | Change |
|---|---|
| F1 | `audio/metronome.ts`: `start(leadInSec = 0)` and a pure `startTimes()` (first click at `now + START_DELAY_SEC + leadIn`). `SpikeScreen.tsx`: "Czas na przygotowanie" select (3/5/10 s, default 5), prep countdown timers in `session.timers`, large `Cue` (prep seconds, count-in beats, "Graj!" + bar), frames before `-eighthMs/2` dropped before segmentation, reference melody on the staff whenever there is no result, current note highlighted via `refIndexAt` (`results.ts`). |
| F2 | Result view replaces the settings when `phase === 'done'`: score, `summaryText(summarize(result))`, pitch %, four-entry legend, staff, note list, "Zagraj jeszcze raz" / "Zmień utwór". `plural`, `signedMs`, `summaryText` in `copy.ts`; `summarize` in `results.ts`. |
| F3 | `staffModel.ts`: `toAlignedBars`, `referenceBars`, `floorDuration`, `StaffSlot`/`AlignedBar`; extras grey `#6b7280`. `Staff.tsx` takes `bars`, draws "Wzór"/"Zagrałeś" labels, formats both rows of a bar with one `Formatter` (STRICT voices), rests rendered. `toStaffBars` and `STAVES_HINT` removed. |
| F4 | `results.ts`: `noteRows`, `midiToPolishName`. `SpikeScreen.tsx`: compact `NotesTable` (`text-xs`, `table-fixed`); taps on staff notes/missing-note rests report `{refIndex, playedIndex}` and highlight + scroll the row. |
| F5 | New `logic/timing.ts` (`gradeRecording`, `onsetOffsets`, `median`, clamp ±250 ms, ≥ 3 samples), exported from `logic/index.ts`, used by `SpikeScreen`. "Automatyczna korekta opóźnienia" checkbox (default on) in diagnostics re-grades the same recording; `DiagnosticsPanel` shows mean/median offset (before correction) and the applied correction. The old output-latency line is relabelled so it is not confused with the new correction. |
| F7 | `README.md`: test steps for prep time, result view, tap-to-highlight and the latency toggle; verdict items for the device's median offset and repeated-note splitting (F6). |

## Red with the fix reverted

All source files of the fix stashed (`git stash push -u -- <9 source paths>`), tests kept:

```
$ npx vitest run src/spike-nuty
 FAIL  src/spike-nuty/results.test.ts [ src/spike-nuty/results.test.ts ]
 FAIL  src/spike-nuty/logic/timing.test.ts [ src/spike-nuty/logic/timing.test.ts ]
 ... (copy, SpikeScreen x5, staffModel x9, metronome x2)
 Test Files  6 failed | 7 passed (13)
      Tests  20 failed | 52 passed (72)
```

Green with the fix (stash popped):

```
$ npx vitest run src/spike-nuty
 Test Files  13 passed (13)
      Tests  84 passed (84)
```

## Automated criteria of phases 3-5

| Row | Command | Result |
|---|---|---|
| 3.1, 4.1, 5.1 | `pnpm test` (full suite) | PASS: 58 files, 554 tests, 0 failed (7 consecutive runs plus 2 parallel runs) |
| 3.2, 4.2, 5.2 | `pnpm lint`; `pnpm typecheck`; `pnpm build` | exit 0; exit 0; exit 0 (`precache 15 entries`) |
| 3.3, 5.4 | entry script `dist/assets/index-h59psTbm.js` from `dist/index.html` | `Zagraj i sprawdź`: 0, `Bravura`: 0; `Zagraj i sprawdź` found in `dist/assets/SpikeScreen-BAJljrm3.js` |
| 5.3 | `pnpm test:e2e` (with `PLAYWRIGHT_BROWSERS_PATH` set to the local ms-playwright cache) | 17 passed |

## Baseline comparison

Baseline (review r1): 527 tests, 0 failed. Now: 554 tests, 0 failed. +27 new tests (timing 6, copy 4,
results 6, staffModel +6, metronome 2, SpikeScreen +3); one existing SpikeScreen test reworded ("re-grades
when the instrument changes" → "grades in written pitch for the chosen instrument", because the result
view now replaces the settings form). No new failures.

Note: the very first full-suite run of the round reported 1 failed test; its output was not kept, and
it did not reproduce in the 9 runs after it (7 sequential, 2 in parallel under load). Flagged so the
reviewer can watch for a flaky timing-sensitive test.

## Real-browser render check (not a criterion)

Temporary harness (deleted, not committed) rendered `Staff` in Chromium at 360 px through the Vite dev
server: the aligned two-row staff (with a missing note, a wrong note, a late note, a sustained note and an
extra bar) and the reference-only staff with a highlighted note. No console errors, SVG 328 px wide
(no horizontal page scroll), labels "Wzór"/"Zagrałeś" on every system, played notes vertically under the
reference notes of the same eighth, a tap on a note reported `{"refIndex":1,"playedIndex":null}`.
