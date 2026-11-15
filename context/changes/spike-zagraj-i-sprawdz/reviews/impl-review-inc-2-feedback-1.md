<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Spike "Zagraj i sprawdź" — increment 2, client feedback 1

**Plan**: context/changes/spike-zagraj-i-sprawdz/plan.md   **Scope**: increment 2 (phases 3-5), feedback cycle 1   **Date**: 2026-11-15
**Round**: 2   **Verdict**: APPROVED   **Findings**: 8

Feedback: `reviews/feedback-inc-2-1.md` (owner's iPhone test with a clarinet, screenshot of the result
screen). Diff: `git diff feat/spike-zagraj-i-sprawdz/1...HEAD`; no code changed since review r1 of this
increment (only `context/` commits: archive, reopen, feedback). Code part is unchanged from r1, so no
evidence subagents; the feedback was checked by reading the code directly.

Scope note: Jev hinted `feedback_out_of_scope=yes` (p=0.74). Overridden: the requester explicitly asked
for all three points on this branch for the spike and authorised touching increment-1 pure logic from
increment 2. All three points are treated as in scope (`FIX`).

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Plan Adherence is WARNING because the delivered behaviour, while matching the plan, does not serve the
owner's test in the cases the feedback describes (F1-F5). No architecture model exists
(`context/architecture/model.c4` absent), so the boundary gate did not run.

## Success criteria (baseline, run locally in the worktree)
| Row | Command | Result |
|---|---|---|
| 3.1, 4.1, 5.1 | `vitest run --reporter=json` (full suite) | PASS: 160 files, 527 tests, 0 failed |
| 3.2, 4.2, 5.2 | `pnpm lint`, `pnpm typecheck`, `pnpm build` | PASS (exit 0) |
| 3.3, 5.4, 5.3 | entry-chunk greps, `pnpm test:e2e` | not re-run: no code changed since r1 (PASS there) |

## What the screenshot shows (evidence for F3, F5, F6)
- Two staves per system, unlabelled; the played row is formatted on its own, so a played half note sits
  under two reference quarters (`Staff.tsx:58-68`: one `Formatter` per stave, `Voice.Mode.SOFT`;
  `staffModel.ts:149-167`: played notes bucketed by onset bar, overflowing the bar).
- Bar 1-2: reference `G E E F | D D C E`, played `G E(half) F | D D C E` → the repeated E was merged
  into one event (see F6), so one reference E is red and the half note is yellow.
- Bars 3-4 and 5-6: most pitch-correct notes are yellow (rhythm). At 60 BPM a note goes yellow only when
  its onset is ≥ 250 ms off the grid (`quantize.ts:484` rounds to the nearest 500 ms eighth, onset
  tolerance 0). A run of consecutive yellows with correct pitch points to a constant offset (input
  latency is not compensated at all, `pitchTracker.ts:310,322` subtracts only `outputLatency`/`baseLatency`,
  which iOS Safari may report as 0) or a steady lag of the child behind the click, not random errors.
- A third system has an empty reference stave and played notes after the melody's end (extras drawn red).

## Decisions taken in this review (Auto)
| Decision | Choice | Reason |
|---|---|---|
| Point 2 comparison variant | **Aligned two-row staff** ("Wzór" over "Zagrałeś", one shared `Formatter` per system so tick positions line up vertically) | At 360 px the staff already fits 2 bars per system (~140 px per bar, `Staff.tsx:43,48`), enough for 8 eighth slots. An overlay puts reference and played heads of different pitches on one stave with shared stems, and a correct-pitch late note collides with the reference head; a child cannot read that. Two labelled full-bar voices formatted together is native VexFlow behaviour (joined voices on separate staves share tick contexts). |
| Point 3 timing correction | **Automatic median onset correction**, on by default with a toggle in diagnostics, clamped to ±250 ms, needs ≥ 3 pitch-matched notes; diagnostics show mean and median offset before correction and the applied value | A calibration step adds a separate flow the child must perform and needs persistence, which the plan excludes ("No persistence of recordings, results or settings"). Loosening the tolerance would hide genuine lateness at every tempo and does not remove a constant offset. Median is robust to a few wrong/missing notes; the toggle lets the team compare corrected and raw grading on the same recording. Rhythm tolerances stay at the plan defaults. |
| Point 1 lead-in | Prep countdown 3 / 5 / 10 s (default 5) before the metronome count-in, scheduled on the same `AudioContext` clock | Single-clock design of the plan (`plan.md` Implementation Approach); mic and context are already opened inside the tap (`SpikeScreen.tsx:116-124`). |
| Extra notes colour | Grey, overriding the plan's "extra = red" | Explicit in the feedback; red stays for wrong and missing notes only. |
| Note names in the result list | Polish letters (C D E F G A H; Cis Dis Fis Gis Ais) + octave number, written pitch | The list is child-facing Polish UI; diagnostics keep international names for the team. |

## Findings

### F1 — No time to get ready; the reference notes are hidden until the end
- **Severity**: WARNING
- **Impact**: MEDIUM
- **Dimension**: Plan Adherence
- **Location**: `src/spike-nuty/SpikeScreen.tsx:137-154,261-277,292-301`, `src/spike-nuty/audio/metronome.ts:195,256-264`
- **Detail**: Feedback 1: "Przydałby się jakiś cold start, żeby można było się przygotować." The count-in starts 150 ms after the tap (`START_DELAY_SEC`), so a child who must put the phone down and lift the clarinet misses it. The staff section shows only `STAFF_EMPTY` until a result exists (`SpikeScreen.tsx:294-301`), so the child cannot see what to play, and nothing shows where in the melody they are. Count-in and beat are small text (`countInLabel`, `beatLabel`).
- **Fix**: (a) Add a "Czas na przygotowanie" select (3 / 5 / 10 s, default 5, disabled while busy) to the settings. (b) Keep opening the mic and resuming the `AudioContext` synchronously in the Start tap; give `Metronome.start` an optional lead-in (`start(leadInSec = 0)`: first click at `currentTime + START_DELAY_SEC + leadInSec`; downbeat after the count-in as now), create the pitch tracker right away (live diagnostics work during prep) and keep the auto-stop computed from the downbeat as today. (c) Before segmentation drop frames with `timeMs < -eighthMs(bpm) / 2`, so nothing played during prep or count-in is graded. (d) During prep show a large centred display (at least `text-6xl`, readable at 360 px) "Przygotuj się…" with the remaining seconds 5…1 driven by a 1 s timer whose handle goes into `session.timers` (Stop during prep cancels cleanly); during the count-in show the beat number 1 2 3 4 in the same large style; at the downbeat show "Graj!" (large), then the current bar number in small text. (e) Render the reference melody on the staff (ungraded, black) whenever there is no result: before Start, during prep, count-in and playing. (f) While playing, highlight the current reference note (colour `#2563eb`) using a pure, tested helper `refIndexAt(melody, eighth): number | null` (the note whose `[startEighth, startEighth + durationEighths)` contains `eighth`), with `eighth = ((bar - 1) * 4 + (beat - 1)) * 2` from the existing `onBeat` callback. All new strings in `copy.ts`, Polish. Tests: `refIndexAt` unit cases (first note, inside a half note, past the end → null); `metronome` lead-in schedules the first click at `START_DELAY_SEC + leadIn` (fake `AudioContext` or a pure `scheduleTimes` helper); SpikeScreen test with fake timers shows "Przygotuj się" and the countdown after Start, and the `Staff` mock receives the reference before Start.
- **Decision**: FIXED (d61e1d5) — verified r2

### F2 — No dedicated result view with a plain summary for the child
- **Severity**: WARNING
- **Impact**: MEDIUM
- **Dimension**: Plan Adherence
- **Location**: `src/spike-nuty/SpikeScreen.tsx:292-325`, `src/spike-nuty/copy.ts:47-54`
- **Detail**: Feedback 2: the result sits below the settings form with only "Wynik: N%" and a legend; nothing tells the child how many notes were right, late or wrong.
- **Fix**: When `phase === 'done'` render a separate result view instead of the settings form (same component tree, no router): on top the score in % (large) and a one-line Polish summary built by a pure, tested `summarize(result)` → `{total, good, late, early, rhythm, wrongPitch, missing, extra}` (yellow with `played.startEighth > ref.startEighth` = late, `<` = early, else rhythm/duration; red with a `playedIndex` = wrongPitch, without = missing; `extra` = played notes graded `extra`) and a pure `summaryText(summary)` in `copy.ts` with Polish plural forms via a tested `plural(n, one, few, many)` (1 nuta, 2 nuty, 5 nut, 12 nut, 22 nuty), e.g. "8 z 10 nut dobrze, 2 za późno, 1 zła nuta, 1 brakująca, 1 dodatkowa" (zero counts omitted); the colour legend (green "dobrze", yellow "dobra nuta, zły rytm", red "zła lub brakująca nuta", grey "nuta dodatkowa"); then the aligned staff (F3) and the note list (F4); buttons "Zagraj jeszcze raz" (calls `start()` with the same settings; it is a tap, so iOS audio rules hold) and "Zmień utwór" (back to the settings view, result cleared). Pitch-only % stays, in smaller text or in diagnostics. Diagnostics remain below on both views. Tests: `summarize` and `plural` unit cases; SpikeScreen test: after a synthetic recording the result view shows the summary text and both buttons, "Zmień utwór" returns to the settings.
- **Decision**: FIXED (d61e1d5) — verified r2

### F3 — Reference and played staves are not aligned in time and not labelled
- **Severity**: WARNING
- **Impact**: HIGH
- **Dimension**: Plan Adherence
- **Location**: `src/spike-nuty/Staff.tsx:50-70`, `src/spike-nuty/staffModel.ts:122-167`
- **Detail**: Feedback 2: "nuty pod sobą się nie pokrywają w czasie (np. zagrana półnuta pod dwiema ćwierćnutami), nie wiadomo, która linia jest którą". Each stave gets its own `Formatter` and the played voice is SOFT and may overflow the bar, so x positions are unrelated across rows; missing notes leave no trace in the played row; extras are red like wrong notes.
- **Fix**: Variant decided in this review: aligned two-row staff. Add a pure, tested `toAlignedBars(result, melodyLengthEighths)` in `staffModel.ts` returning per bar `{reference: StaffSlot[], played: StaffSlot[]}` where every row of every bar fills exactly 8 eighths with notes and rests (`StaffSlot = {kind: 'note' | 'rest', key, accidental, duration, colour, startEighth, refIndex: number | null, playedIndex: number | null}`): reference notes coloured by grade (or black/ungraded, or the F1 highlight); played notes placed at their `startEighth`, length clipped to the next played onset and the bar end, then floored to the largest renderable value (8, q, qd, h, hd, w) with the remainder as rests (no ties); two played notes on the same eighth keep the non-extra one (else the first); a missing reference note becomes a red rest at its onset over the free part of its span (if the slot is covered by a sustained played note, no rest, the miss shows in the list and on the red reference note); extras grey `#6b7280`; other rests neutral grey; bars after the melody that only hold extras get a whole rest in the reference row. In `Staff.tsx` draw both rows of a system with identical x and width and format both bar voices with one `Formatter` (`joinVoices([ref]).joinVoices([played]).format([ref, played], width)`, `Voice.Mode.STRICT`) so a played note stands vertically under the reference note of the same eighth; draw the row labels "Wzór" and "Zagrałeś" on every system, visible at 360 px without horizontal page scroll. Replace `STAVES_HINT` with the labels and legend. Update `gradeColour('extra')` to grey. Keep `Staff` usable with the reference only (F1). Tests: each row of each bar sums to 8 eighths; a perfect performance puts each played note at the same `startEighth` as its reference note; a note one eighth late sits one eighth later with the reference slot above; a missing note yields a red rest at its onset; an extra note is grey; a played note longer than the gap to the next note is clipped; existing `staffModel` cases updated for the grey extra.
- **Decision**: FIXED (d61e1d5) — verified r2

### F4 — No note-by-note list linked to the staff
- **Severity**: WARNING
- **Impact**: MEDIUM
- **Dimension**: Plan Adherence
- **Location**: `src/spike-nuty/SpikeScreen.tsx:292-325`, `src/spike-nuty/DiagnosticsPanel.tsx:110-142` (raw events only)
- **Detail**: Feedback 2 asks for a list under the staff: number, expected note, played note, cents difference, time offset ("+180 ms, za późno"), status; tapping a note on the staff highlights its row.
- **Fix**: Add a pure, tested `noteRows(result, bpm)` returning one row per reference note plus one per extra played note, ordered by time: `nr`, `expected` (Polish name via a tested `midiToPolishName`, e.g. 67 → "G4", 59 → "H3", 66 → "Fis4"), `played` (name or "–"), `centsDiff` (`(played.midi − ref.midi) * 100 + played.meanCents`, null when missing), `offsetMs` (played `startMs` after the F5 correction minus `ref.startEighth * eighthMs(bpm)`, rounded), `timing` text consistent with the grade ("+180 ms, za późno", "−120 ms, za wcześnie", "+40 ms" for green, "za krótko"/"za długo" for a duration-only yellow), `status` ("dobrze", "za późno", "za wcześnie", "zły rytm", "zła nuta", "brak", "dodatkowa") and `grade` for the row colour. Render it as a compact table (`text-xs`, short headers, fits 360 px without page scroll). Make staff notes tappable: after drawing, attach a click listener to each note's `getSVGElement()` that reports its `refIndex`/`playedIndex`; the screen highlights that row and scrolls it into view; tapping a row may highlight the note. Tests: `noteRows` cases (green, late yellow with "+… ms, za późno", wrong pitch with cents, missing with "–", extra row); SpikeScreen test that the table shows the expected Polish status texts for a synthetic recording (Staff mocked; the tap wiring is checked manually on the preview).
- **Decision**: FIXED (d61e1d5) — verified r2

### F5 — Rhythm grading ignores audio-path latency; no offset shown in diagnostics
- **Severity**: WARNING
- **Impact**: HIGH
- **Dimension**: Safety & Quality
- **Location**: `src/spike-nuty/audio/pitchTracker.ts:310,322`, `src/spike-nuty/SpikeScreen.tsx:79-83`, `src/spike-nuty/DiagnosticsPanel.tsx:104-108`
- **Detail**: Feedback 3 and the screenshot: long runs of correct-pitch yellow notes. Only output latency is subtracted (often 0 on iOS Safari); input latency and the child's steady lag are not handled, so a constant shift of ≥ half an eighth turns every note yellow. Diagnostics show only the output-latency value.
- **Fix**: Variant decided in this review: automatic median correction. Add a pure, tested `gradeRecording(melody, writtenEvents, bpm, {ignoreOctave, autoLatency})` (new `logic/timing.ts`, exported from `logic/index.ts`): pass 1 = `compare(melody, quantize(events, bpm))`; offsets = `played.startMs − ref.startEighth * eighthMs(bpm)` over reference notes graded green or yellow; `medianMs`, `meanMs`, `samples`; applied correction = median clamped to ±250 ms when `autoLatency` and `samples ≥ 3`, else 0; pass 2 = shift every event's `startMs` by −correction, re-quantize, re-compare; return `{result, correctionMs, medianMs, meanMs, samples, events}`. Use it in `SpikeScreen` instead of the inline `compare(quantize(...))`. Add a checkbox "Automatyczna korekta opóźnienia" (default on) in diagnostics that re-grades the same recording; diagnostics show "Średnie przesunięcie", "Mediana przesunięcia" (before correction, signed ms) and "Zastosowana korekta". No calibration step, no persistence, rhythm tolerances unchanged. Tests: at 100 BPM a perfect melody shifted +200 ms is all yellow with `autoLatency: false` and all green with it on (correction ≈ 200); two outliers among ten notes do not move the median; fewer than 3 matches → correction 0; a +400 ms shift is clamped to 250; ignoreOctave is passed through.
- **Decision**: FIXED (d61e1d5) — verified r2

### F6 — Repeated same-pitch notes merge into one long note
- **Severity**: OBSERVATION
- **Impact**: MEDIUM
- **Dimension**: Safety & Quality
- **Location**: `src/spike-nuty/logic/segment.ts:166` (re-attack needs a 6 dB dip, `DEFAULT_SEGMENT_OPTIONS.reattackDb`)
- **Detail**: Screenshot bar 1: reference `E E` became one played half note. Legato tonguing on a clarinet may not dip the level by 6 dB within the 20 ms frames, so the second E is "missing" and the first one yellow. Tuning the threshold without recorded frames would be guessing.
- **Fix**: none in this round; the F4 list ("brak" next to a merged note) and the diagnostics event table make it visible for the spike verdict. Add a line to the README verdict checklist to note whether repeated notes split.
- **Decision**: ACCEPT — needs measured data from the device; the README line rides with F7.

### F7 — README describes the old flow
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: `src/spike-nuty/README.md` (`## Jak testować na iPhonie`, `## Werdykt`)
- **Detail**: After F1-F5 the test steps (prep time, result view, latency toggle) and the verdict checklist are outdated.
- **Fix**: Update `## Jak testować na iPhonie` for the prep countdown, the result view and the "Automatyczna korekta opóźnienia" toggle (compare graded results with it on and off, note the median offset); add to `## Werdykt` items for the median offset seen on the device and for repeated-note splitting (F6).
- **Decision**: FIXED (d61e1d5) — verified r2

## Requirements for the fix round
Polish UI; readable at 360 px in the iOS standalone PWA; unit tests for every new pure helper named above
(`refIndexAt`, `toAlignedBars`, `summarize`, `plural`, `noteRows`, `midiToPolishName`, `gradeRecording`);
existing tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, the entry-chunk greps (3.3, 5.4) and
`pnpm test:e2e` must pass. Files expected: `src/spike-nuty/**` only (out-of-plan new files under
`src/spike-nuty/` are expected for this feedback round).

## Manual (for the owner on the preview)
3.4, 4.3, 4.4, 5.5, 5.6 stay pending; after the fix also: prep countdown readable from a distance; the
reference notes visible before Start and the current note highlighted while playing; the result view's
summary, aligned rows and tap-to-highlight; with the latency correction on, a correct performance is
mostly green.

### F8 — Two files switched to CRLF line endings in the fix commit
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Pattern Consistency
- **Location**: `src/spike-nuty/audio/metronome.ts`, `src/spike-nuty/DiagnosticsPanel.tsx` (`git ls-files --eol`: `i/crlf`; every other file in `src/spike-nuty/` is `i/lf`)
- **Detail**: d61e1d5 rewrote both files with CRLF, so their diffs show whole-file churn (235 and 200 lines) for 25 and 18 real line changes (`git show -w --stat`). No `.gitattributes`; lint, typecheck and build are unaffected.
- **Fix**: normalise both files to LF when the feature is rebuilt after the spike verdict.
- **Decision**: ACCEPT — throwaway spike code (plan: "No production hardening"), no functional or tooling effect; not worth a third round.

## Round 2
Re-review of fix d61e1d5 against `reviews/fix-r1.md`. Each FIXED finding is present in the diff:
F1 `metronome.ts` `start(leadInSec)`/`startTimes`, prep select and countdown timers in `session.timers`,
large `Cue`, frames before −½ eighth dropped (`SpikeScreen.tsx:203-205`), reference staff before Start
and `refIndexAt` highlight; F2 result view with `summaryText(summarize(...))`, legend and both buttons;
F3 `toAlignedBars` (rows filled to 8 eighths, red rests for missing, grey extras) and one shared
`Formatter` with STRICT voices and "Wzór"/"Zagrałeś" labels (`Staff.tsx:83-103`); F4 `noteRows`,
`midiToPolishName`, tap wiring through `getSVGElement` (`Staff.tsx:106-114`); F5 `logic/timing.ts`
`gradeRecording` with clamp ±250 ms and ≥ 3 samples, toggle and offsets in diagnostics; F7 README.
The new tests assert the failing behaviour (e.g. `timing.test.ts:33` all yellow without the
correction, all green with it). F6 (ACCEPT) untouched; fix stayed inside `src/spike-nuty/` and the
change folder.

Re-run (phases 3-5 + build): full suite twice with the JSON reporter, 554 tests, 0 failed both times;
the single unreproduced failure noted in `fix-r1.md` did not recur (11 green runs in total across
implementer and reviewer), so no flaky test is identified. `pnpm lint`, `pnpm typecheck`, `pnpm build`
exit 0; entry script `assets/index-h59psTbm.js`: 0 × `Zagraj i sprawdź`, 0 × `Bravura`, the string is in
`SpikeScreen-BAJljrm3.js`; `pnpm test:e2e` 17 passed. Manual rows remain for the owner on the preview.
