# Fix round 3: telemetria-zagraj-i-sprawdz, increment 3 (client feedback 1)

Renamed from `fix-r3.md` to `fix-r3-inc-3.md` when increment 2 (which has its own
`fix-r3.md`) was merged into this branch; the commits keep `(r3)`.

Report: `reviews/impl-review-inc-3-feedback-1.md` (its `**Round**: 1`). Named `fix-r3`
because `fix-r1.md` and `fix-r2.md` already hold increment 1's fix-round evidence; the
commit carries `(r3)` to match this file. FIX findings: F1-F7. F8 is ACCEPT (covered by
F6: the emulator suite was run below).

The plan's phases 7-9 (feedback aggregates, `topMisjudged`, feedback CSV columns) are
superseded by the owner's redirect; `plan.md` is locked, so no plan text changed and
no Progress row moved (7.1-9.2 stay `[x]`). Carried as an `adaptation` guard.

## Decisions

| Decision | Choice | Source |
|---|---|---|
| Estimate used in stats/export (F2) | `resolveEstimate(doc)`: the stored `estimate` when `heuristicVersion === HEURISTIC_VERSION` **and** its `notes`/`events` lists are as long as the record's; otherwise `estimateRecognition({notes, events, signal, ended})`. The length check guards the per-note alignment `byExpectedNote` relies on. | Auto (report F2 rule + alignment safety) |
| Recompute core location (F4) | Pure core in `functions/src/spike-nuty/recompute.ts` (args with the safety rules, plan/diff, batches, summary), unit-tested; the `.mjs` only does I/O and imports `functions/lib`. | Auto (report F4 allows either; testable in `src/`) |
| Recompute target rule (F4) | `FIRESTORE_EMULATOR_HOST` set → emulator, and it wins over `--project` (a set emulator host can never reach production); else `--project <id>` required, otherwise refuse (exit 2). So `--write` against a non-emulator target always carries `--project`. | Auto (report F4) |
| "Already current" (F4) | Stored estimate equal (key-order independent) to the recomputed one; anything else "would change" (split into missing / other version). | Auto |
| Repeat constants (F3) | `REPEAT_WINDOW_MS = 5 min` (inclusive), `REPEAT_SCORE_DIFF = 30` (inclusive), consecutive pairs per `deviceId`+`melodyId` by `receivedAt`. | Auto (report F3 values) |
| `repository.ts` touched | Only `feedbackAt` dropped from `DATE_FIELDS` (report F5 location); file is increment 3's per phase 8. | Auto |

## Changes per finding

- **F1** `functions/src/spike-nuty/stats.ts`: `feedback`/`topMisjudged` removed; new `estimateSource`,
  `estimate` {`heuristicVersion`, `accuracyHistogram` (10 buckets over 0..1), `noAccuracy`, `meanAccuracy`,
  `medianAccuracy`, `topRecognitionReasons` (summed `estimate.reasons`, ties in `REASON_CODES` order, top 10),
  `byMelody`, `byExpectedNote` (verdict counts aligned with `doc.notes`, `midiName`), `byDeviceClass`, `daily`
  (UTC day), `signals` (median unvoicedRatio / clarity / latencySpreadMs / eventsPerNote, `stoppedShare`)}.
  Latency, octave/twelfth, score histogram kept.
- **F2** `resolveEstimate` in `stats.ts` (rule above), `estimateSource: {stored, recomputed}`.
- **F3** `REPEAT_WINDOW_MS`, `REPEAT_SCORE_DIFF` exported; `repeats: {pairs, divergent, medianAccuracyDiff}`.
- **F4** `functions/src/spike-nuty/recompute.ts` + `functions/scripts/recompute-estimates.mjs` (dry run default,
  `--write`, `--project`, `--from/--to`, paginated reads of 500, batched `update({estimate})` of 400, `--help`).
- **F5** `export.ts`: feedback columns and `misjudged` removed; `heuristicVersion`, `estimatedAccuracy`,
  `estimateSource`, `estimateReasons` added (one `resolveEstimate` per row). `stats.ts`: `LegacyFeedback`,
  `MisjudgedNote`, `findNote`, `AttemptDoc.feedback/feedbackAt` removed. `repository.ts`: `feedbackAt` dropped.
- **F6** `test/spike-nuty-stats.test.ts` rewritten (resolveEstimate ×4, each breakdown, histogram, reasons,
  signals, stored vs recomputed, repeats ×5); `test/spike-nuty-export.test.ts` (no feedback columns, recomputed
  and stored estimate columns); `test/spike-nuty-admin-handler.test.ts` (new fields, no feedback);
  new `test/spike-nuty-recompute.test.ts` (args safety, plan, key order, summary, batches);
  `test-emulator/spike-nuty-stats.emulator.test.ts` (one stored + two recomputed, estimate and repeat aggregates,
  CSV estimate header).
- **F7** `README.md` "Owner statistics": new stats fields, resolution rule, repeat constants, CSV columns,
  "Recompute estimates" subsection (emulator and `--project`, dry run first).

## Evidence (all in the worktree)

Touched criteria 7.1, 8.1, 8.2, 9.1, 9.2:

```
$ cd functions && npx vitest run            (7.1, 8.1 + full suite)
 Test Files  14 passed (14)
      Tests  323 passed (323)
$ npx tsc -p tsconfig.build.json            (8.2 build)      exit 0
$ npx tsc -p tsconfig.json --noEmit         (8.2 typecheck)  exit 0
$ node scripts/spike-nuty-stats.mjs --help  (9.2)            exit 0
$ node scripts/recompute-estimates.mjs --help                exit 0
$ node scripts/recompute-estimates.mjs --write   (no FIRESTORE_EMULATOR_HOST, no --project)
no target: set FIRESTORE_EMULATOR_HOST for the emulator, or pass --project <id> for a real project
exit 2
$ (root) pnpm lint                                           exit 0
$ (root) pnpm typecheck                                      exit 0
```

Baseline comparison: review round 1 recorded 289/289 unit tests passing on the pre-fix code; now 323/323
(0 failed; +34 = new and rewritten tests minus removed feedback tests). No new failures.

**9.1 emulator suite** (adaptation: a foreign emulator holds 5001/8080, so an untracked copy of
`firebase.json` with functions 15101, firestore 18181/ws 19151, hub 14410, logging 14510 was used and deleted
afterwards, with `functions/firestore-debug.log`):

```
$ node scripts/ensure-secret-local.mjs
$ FUNCTIONS_EMULATOR_HOST=127.0.0.1:15101 pnpm exec firebase --config ../firebase.alt-ports.json \
    emulators:exec --only functions,firestore --project demo-grajek "vitest run -c vitest.emulator.config.ts"
 Test Files  4 passed (4)
      Tests  21 passed (21)
+  Script exited successfully (code 0)
```

**Recompute script end to end on the Firestore emulator** (same alt-port config; a throwaway seed script,
deleted afterwards, wrote 3 raw docs: `no-estimate`, `old-version` (heuristicVersion `0`, accuracy 0.9) and
`out-of-range` (2026-10-01)):

```
dry run --from 2026-11-01 --to 2026-11-30:
  total 2, alreadyCurrent 0, wouldChange 2, missingEstimate 1, otherHeuristicVersion 1, meanAccuracyDelta -0.233
  Dry run: nothing written (add --write to store).
--write, same range:  same summary, "Wrote 2 estimates."
dry run, no range:    total 3, alreadyCurrent 2, wouldChange 1 (the out-of-range doc), missingEstimate 1
old-version after write: heuristicVersion 1, estimatedAccuracy 0.667, deviceId d1, score 50 (other fields intact)
```

## Red with the fix reverted

`stats.ts`, `export.ts`, `repository.ts` restored from `HEAD` (`git show HEAD:…`) and `recompute.ts` moved
away, new tests kept:

```
$ npx vitest run test/spike-nuty-stats.test.ts test/spike-nuty-export.test.ts \
    test/spike-nuty-admin-handler.test.ts test/spike-nuty-recompute.test.ts
 FAIL  test/spike-nuty-recompute.test.ts (cannot import recompute.js)
 Test Files  4 failed (4)
      Tests  20 failed | 38 passed (58)
```

(The 20: resolveEstimate ×4, the 6 estimate aggregates, the 5 repeat tests, the empty-stats test, the 3 CSV
estimate/no-feedback tests, the admin 200 stats test.) Sources restored; full suite back to 323/323.
