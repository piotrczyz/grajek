# Fix round 3: telemetria-zagraj-i-sprawdz, increment 2 (client feedback 1)

Report: `reviews/impl-review-inc-2-feedback-1.md` (its `**Round**: 1`). Named `fix-r3`
because `fix-r1.md` and `fix-r2.md` (increment 1, merged into this branch) are taken; the
commits carry `(r3)`. FIX findings: F1, F2, F3, F4. F5 is ACCEPT and was left untouched.

Commits: `288e2d9` (the fix), `03c4608` (restores LF in ten files the fix had rewritten with
CRLF, so the diff is content only; hardens the 360 px e2e with worst-case texts).

## F1: manual feedback removed

- `SpikeScreen.tsx`: the "Czy ocena się zgadza?" section, Tak/Nie, the misjudged checkbox
  column and its `Misjudging` prop, the comment field, `FeedbackStep`, `SentAttempt`/`sent`,
  `resetFeedback`, `sendFeedback`, `MAX_COMMENT` are gone. Automatic attempt sending, the
  anonymous-data notice and the opt-out switch stay.
- `telemetry/api.ts`: `putFeedback` and the URL suffix removed.
- `telemetry/queue.ts`: `QueueKind = 'attempt'`, `MAX_FEEDBACK_TRIES` and the 404 retry rule
  removed (a 404 now drops like any other 4xx). `readQueue` drops stored legacy
  `kind: 'feedback'` items silently, rewrites the queue without them and keeps the attempts;
  anything else malformed still resets the queue.
- `copy.ts`: every `FEEDBACK_*`/`MISJUDGED_*`/`misjudgedRowLabel` text removed.
- `README.md` (spike): the feedback paragraph is replaced by the automatic estimate, where it
  is shown, and the legacy-queue note; the record list names the new fields.

## F2: raw signals and the estimate in the record

- `logic/segment.ts`: every event gets `pitchSpreadCents` = population standard deviation of
  its frame pitches in cents, rounded (Auto: a range would flag normal vibrato; the README
  contract only says "spread"). New pure helpers `isVoicedFrame` (the segmenter's own voiced
  test, now used by `segment`), `analysedFrames` (drops click ignore windows), `frameSignal`
  (`frames`, `voicedFrames`, `medianClarity` over all analysed frames) and `windowLevelDb`.
- `SpikeScreen.tsx`: `Recording.frames` keeps the analysed frames (after the count-in cut and
  the click windows) for the record.
- `telemetry/record.ts`: imports `estimateRecognition` from
  `../../../functions/src/spike-nuty/recognition-estimate.ts` (passes `tsc -b`, eslint and
  `vite build`; the module lands in the lazy `SpikeScreen` chunk only, not `index-*.js`).
  New `attemptDetails` builds the full note list (with `windowLevelDb`: the reference window
  shifted back by `correctionMs` to raw time, or the extra note's own span), all events,
  `signal`, and the estimate **on the full lists before any cap**. `buildAttemptRecord` caps
  notes (400) and events (200), cuts `estimate.notes/events` to the same lengths (the server
  checks alignment) and clamps verdict/reason counts to `MAX_NOTES`. Without frames the record
  has no `signal` and no `windowLevelDb` (both optional in the contract).

## F3: heuristics in diagnostics only

- `DiagnosticsPanel.tsx`: new `RecognitionEstimatePanel`, rendered only after a result and
  only after "Pokaż szacunek rozpoznawania" is pressed (`aria-expanded`): estimated accuracy,
  heuristic version, per-note verdict (błąd grającego / błąd rozpoznawania / niepewne / ok)
  with Polish reasons (unknown codes shown raw), and the attempt signals (odsetek ramek bez
  wysokości, mediana pewności, rozrzut opóźnienia, zdarzenia na nutę, przerwana).
  The child's result view has none of it.

## F4: "Nuta po nucie" at 360 px

- `SpikeScreen.tsx` `NotesTable`: `table-auto` instead of `table-fixed`, no fixed-width
  columns, `px-1` + `break-words` cells, cents `whitespace-nowrap`, status = colour dot
  (`aria-hidden`) + the full word in its own span. `copy.NOTE_COLUMNS` shortened to
  `#, Wzór, Gra, Cent, Czas, Ocena`.
- New `e2e/spike-nuty-narrow.spec.ts` (360x800, Chromium fake media stream): a real
  Start/Stop reaches the result view; no `th`/`td` has `scrollWidth > clientWidth`, the table
  fits the section, every status is a full word. Then every row is filled with the longest
  texts the list can show (`+1180 ms, za wcześnie`, `za wcześnie`, `dodatkowa`) and measured
  again. File outside the plan's `src/` scope (soft guard `out-of-plan-files`), asked for by F4.

## Tests added or changed

- `queue.test.ts`: legacy feedback item dropped silently, attempts beside it kept and sent;
  404 joins the drop list; feedback tests removed.
- `copy.test.ts`: no feedback texts left; every verdict and reason code has a Polish name.
- `SpikeScreen.test.tsx`: no feedback UI after a finished attempt while notice and switch
  stay; record carries `estimate`, `signal`, `windowLevelDb`, `pitchSpreadCents`; estimate
  texts absent from the default view, present only after opening the diagnostics panel;
  octave-high note shown as "błąd rozpoznawania" / "skok o oktawę"; table markup (no fixed
  layout, short headers, full status word + dot). Old feedback tests removed.
- `record.test.ts`: new fields (spread clamp 2400, window levels, signal); `estimate` with
  `heuristicVersion === HEURISTIC_VERSION`, octave/twelfth verdicts, accuracy; the server's
  real `parseAttempt` accepts every record unchanged; no-frames record; 250 events: estimate
  counts 250 events and its note verdicts equal `estimateRecognition` on the full lists.
- `segment.test.ts`: `pitchSpreadCents` (0 steady, 30 for ±30 cents, >60 for ±80 cents);
  `frameSignal`, `windowLevelDb`, `analysedFrames`.

## Red-first proof (new tests fail with the fix reverted)

Each run below swapped the named sources back to `HEAD~1` of `288e2d9` (or mutated one line),
ran the tests, then restored them with `git checkout HEAD -- <files>` (status clean after).

```
# old queue.ts + api.ts
$ pnpm exec vitest run src/spike-nuty/telemetry/queue.test.ts
     × silently drops legacy feedback items and keeps the attempts queued beside them
      Tests  1 failed | 18 passed (19)

# old SpikeScreen.tsx + DiagnosticsPanel.tsx + copy.ts
$ pnpm exec vitest run src/spike-nuty/SpikeScreen.test.tsx src/spike-nuty/copy.test.ts
     × has no manual feedback texts any more
     × names every verdict and reason code of the heuristic in Polish
     × asks nothing after a finished attempt: no manual feedback, the notice and the switch stay
     × sends the automatic estimate, the attempt signal and the note window levels in the record
     × shows the heuristic only in the diagnostics panel, after opening it
     × names the verdict and the reasons of a misrecognised note in Polish
     × lets every cell wrap and keeps the full status word with a colour dot
      Tests  7 failed | 17 passed (24)

# old record.ts + segment.ts + logic/index.ts
$ pnpm exec vitest run src/spike-nuty/telemetry/record.test.ts src/spike-nuty/logic/segment.test.ts
      Tests  10 failed | 21 passed (31)   (all 10 new tests)

# mutation: estimate computed on events.slice(0, MAX_EVENTS)
$ pnpm exec vitest run src/spike-nuty/telemetry/record.test.ts
     × computes the estimate of a recording over 200 events from the full event list
      Tests  1 failed | 12 passed (13)

# mutation: NotesTable back to table-fixed, w-6 / w-[30%] columns, no wrap classes
$ pnpm exec playwright test e2e/spike-nuty-narrow.spec.ts
  ✘  1 [mobile-chromium] › e2e\spike-nuty-narrow.spec.ts:15:1 › the note-by-note list is readable at 360 px
    + Array [ "za wcześnie", "dodatkowa", ... ]   (worst-case status cells clipped)
# restored:
  ✓  1 [mobile-chromium] › e2e\spike-nuty-narrow.spec.ts:15:1 › the note-by-note list is readable at 360 px
```

Note: the first part of the e2e (real beep recording) passes on the old layout too, because a
beep yields short statuses ("brak"); the worst-case part is what reproduces the owner's "dobrz".

## Gates at `03c4608`

Baseline (round-1 report): 593/593 unit, 17/17 e2e.

| Check | Command | Result |
|---|---|---|
| Unit tests | `pnpm exec vitest run` | PASS — 609/609 (61 files), 5 consecutive green runs; vs baseline: 0 new failures (+16 net tests) |
| Typecheck | `pnpm typecheck` (`tsc -b`) | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build | `pnpm build` | exit 0 |
| E2E | `PLAYWRIGHT_BROWSERS_PATH=…\ms-playwright pnpm test:e2e` | PASS — 18 passed (17 + the new 360 px spec) |

One earlier full unit run (right after the line-ending normalisation, cold transform cache)
reported 1 failed / 608 passed; the failing test was not captured and it did not recur in the
five runs that followed. Recorded so the reviewer can watch for a flake.

Functions (`functions/`) were not touched: no emulator run was needed.
