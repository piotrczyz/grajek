<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Telemetry for "Zagraj i sprawdź" — increment 3 (Owner stats and export, A3), feedback cycle 1

**Plan**: context/changes/telemetria-zagraj-i-sprawdz/plan.md   **Scope**: increment 3 (phases 7-9), feedback 1   **Date**: 2026-11-15
**Round**: 2   **Verdict**: APPROVED   **Findings**: 8

Base: `feat/telemetria-zagraj-i-sprawdz/1` (stacked; `git diff feat/telemetria-zagraj-i-sprawdz/1...HEAD`).
Feedback: `reviews/feedback-inc-3-1.md` (owner, 2026-11-15). HEAD `e6120b4`; increment 1 merged in at `4fc80cf`
(feedback endpoint removed, `recognition-estimate.ts` with `HEURISTIC_VERSION = '1'`, optional
`pitchSpreadCents` / `windowLevelDb` / `signal` / `estimate` record fields).

The owner redirected the change: manual "Czy ocena się zgadza?" feedback is gone, the recognition
accuracy is estimated automatically, and increment 3's stats must aggregate that estimate. The owner
explicitly authorised the work, so every point of the redirect that falls in increment 3
(`functions/` stats, export, scripts, README) is in scope and every gap below is `FIX`. Nothing of
the redirect is implemented on this branch yet: the only post-merge commit is the feedback file.

The plan's phases 7-9 (feedback aggregates, `topMisjudged`, feedback CSV columns) are superseded by
the owner's redirect; `plan.md` is locked (`implementing`), so the implementer follows this report
and the deviation is carried as an `adaptation` guard.

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS (r2: the owner's redirect is delivered for increment 3; plan phases 7-9 superseded, `adaptation` guard) |
| Scope Discipline | PASS |
| Safety & Quality | PASS (r2: recompute script dry-run by default, refuses a target without emulator host or `--project`) |
| Architecture | PASS (no `context/architecture/model.c4`; gate not applicable) |
| Pattern Consistency | PASS |
| Success Criteria | PASS (r2: typecheck, build, unit 323/323, lint, emulator 21/21) |

## Success criteria run (round 1, pre-fix HEAD `e6120b4`)

| Check | Command (in worktree) | Result |
|---|---|---|
| Functions typecheck | `functions: npx tsc -p tsconfig.json --noEmit` | PASS (exit 0) |
| Functions unit tests | `functions: npx vitest run --reporter=json` | PASS (289/289, 0 failed) |
| Functions build | `functions: npx tsc -p tsconfig.build.json` | PASS (exit 0) |
| Root lint | `npx eslint .` | PASS (exit 0) |
| Emulator tests | `functions: pnpm test:emulators` | SKIPPED (not run this round; see F8) |

These pass because the legacy feedback code still compiles; they prove nothing about the redirect.

## Findings

### F1 — Stats still report manual feedback, not the automatic estimate
- **Severity**: CRITICAL
- **Impact**: MEDIUM
- **Dimension**: Plan Adherence
- **Location**: functions/src/spike-nuty/stats.ts:57-58, 125-126, 156-177, 193-197
- **Detail**: Feedback point 1 and "Statystyki (#24): rozkład szacowanej dokładności, top typów podejrzanych błędów rozpoznawania, per utwór, per nuta, per typ urządzenia, trend w czasie (dziennie)". `computeStats` still returns `feedback {answered, agrees, agreesPercent}` and `topMisjudged` from the removed manual feedback and never reads `doc.estimate`; none of the estimate aggregates exist.
- **Fix**: Drop `feedback`/`topMisjudged` from `SpikeNutyStats`; add `estimate`: accuracy histogram (10 buckets over 0..1, plus count of `null`), mean/median accuracy, top `REASON_CODES` of recognition-suspect notes (counts summed from `estimate.reasons`), breakdowns `byMelody` (settings.melodyId), `byExpectedNote` (expectedMidi + `midiName`, counts of notes per verdict from `estimate.notes` aligned with `doc.notes`), `byDeviceClass` (existing `deviceClass`), `daily` (UTC day of `receivedAt`): attempts + mean accuracy each; attempt-level signals (median `unvoicedRatio`, median `medianClarity`, median `latencySpreadMs`, median `eventsPerNote`, stopped share). Keep the existing latency/octave/twelfth/histogram fields.
- **Decision**: FIXED (0d5d4b1) — verified r2

### F2 — No server-side estimate for records without one or with an old heuristic version
- **Severity**: CRITICAL
- **Impact**: MEDIUM
- **Dimension**: Plan Adherence
- **Location**: functions/src/spike-nuty/stats.ts:121 (computeStats has no estimate resolution)
- **Detail**: Feedback asks to store `heuristicVersion` "żeby dało się ją później przeliczyć"; the caller requires a decision for records with no stored estimate or a different version. Older records and clients without the estimate would otherwise fall out of every aggregate.
- **Fix**: Add a pure `resolveEstimate(doc)` in `stats.ts`: use `doc.estimate` when present and `heuristicVersion === HEURISTIC_VERSION`, otherwise `estimateRecognition({notes, events, signal, ended})` from the same module; count the source in stats (`estimateSource: {stored, recomputed}`), and record the rule in the README and in `reviews/fix-r1.md` as a decision.
- **Decision**: FIXED (0d5d4b1) — verified r2

### F3 — Repeat detection missing
- **Severity**: CRITICAL
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: functions/src/spike-nuty/stats.ts (absent)
- **Detail**: "ten sam deviceId + utwór zagrany ponownie w ciągu kilku minut z bardzo różnym wynikiem (liczone w statystykach na serwerze)".
- **Fix**: Named constants `REPEAT_WINDOW_MS` (e.g. 5 min) and `REPEAT_SCORE_DIFF` (e.g. 30 points of `scorePercent`); group by `deviceId`+`melodyId`, sort by `receivedAt`, count consecutive pairs within the window as `repeats.pairs` and those with |Δscore| >= threshold as `repeats.divergent` (plus the accuracy difference of divergent pairs, median); export both constants and test them.
- **Decision**: FIXED (0d5d4b1) — verified r2

### F4 — No recompute script
- **Severity**: CRITICAL
- **Impact**: MEDIUM
- **Dimension**: Safety & Quality
- **Location**: functions/scripts/ (only `ensure-secret-local.mjs`, `spike-nuty-stats.mjs`)
- **Detail**: "skrypt przeliczający heurystykę ponownie na surowych rekordach". It writes to Firestore, so it must not touch production by accident.
- **Fix**: Add `functions/scripts/recompute-estimates.mjs` (imports the built `lib/spike-nuty/recognition-estimate.js`, firebase-admin): dry-run by default (prints counts: total, already current, would change, accuracy deltas); writes `estimate` only with `--write`; runs only when `FIRESTORE_EMULATOR_HOST` is set, or with an explicit `--project <id>` (refuse `--write` against a non-emulator target without `--project`); `--from/--to` range, batched writes, never touches other fields; `--help`. Unit-test its pure core (selection + diff) or keep the core in `src/` and test there.
- **Decision**: FIXED (0d5d4b1) — verified r2

### F5 — Export and types still carry the legacy feedback
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: functions/src/spike-nuty/export.ts:43-46, 49 (+ header comment line 3); functions/src/spike-nuty/stats.ts:8-29; functions/src/spike-nuty/repository.ts:31 (`feedbackAt`)
- **Detail**: Feedback point 1 removes the manual feedback; nothing is deployed, so removal is safe (caller's note). `LegacyFeedback`, `MisjudgedNote`, `findNote`, the `feedback*` / `misjudged` CSV columns and the `feedbackAt` date conversion are dead.
- **Fix**: Remove them; add CSV columns `heuristicVersion`, `estimatedAccuracy`, `estimateSource` (stored/recomputed, via F2's resolver) and `estimateReasons` (JSON), keeping `notes`/`events` JSON columns.
- **Decision**: FIXED (0d5d4b1) — verified r2

### F6 — Tests still assert the feedback aggregates
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Success Criteria
- **Location**: functions/test/spike-nuty-stats.test.ts:63, 94-145; functions/test/spike-nuty-admin-handler.test.ts:123, 136; functions/test/spike-nuty-export.test.ts:96-133; functions/test-emulator/spike-nuty-stats.emulator.test.ts:83-84, 99
- **Detail**: Once F1/F5 land these break; the redirect also needs new coverage.
- **Fix**: Replace with synthetic-record tests for each breakdown (melody, expected note, device class, daily), accuracy histogram, top reasons, attempt signals, stored vs recomputed estimate (missing and old `heuristicVersion`), repeat detection (inside/outside the window, below/above the threshold, different device or melody); update handler/export/emulator expectations; run the emulator suite (alternate ports allowed when 8080 is held by a foreign emulator) and record the result in `fix-r1.md`.
- **Decision**: FIXED (0d5d4b1) — verified r2

### F7 — README describes the removed feedback aggregates
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: README.md:274-280
- **Detail**: "how often players agreed with the grading, the ten most often misjudged expected notes … and the misjudged notes are JSON text". Not a one-edit prose fix: it depends on F1-F5's final field names and needs a new recompute section.
- **Fix**: Describe the new stats fields and the estimate-resolution rule (F2), repeat-detection constants (F3), the new CSV columns (F5), and a "Recompute estimates" subsection with emulator and production (`--project`) invocations, dry-run first.
- **Decision**: FIXED (0d5d4b1) — verified r2

### F8 — Emulator suite not run since the increment 1 merge
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Success Criteria
- **Location**: functions/test-emulator/spike-nuty-stats.emulator.test.ts
- **Detail**: Not run in this round; the code under test is about to change wholesale (F1-F6), so a pre-fix run would prove nothing. The fix round must run it (F6).
- **Fix**: Covered by F6.
- **Decision**: ACCEPT — the fix round ran it (`fix-r3.md`) and r2 re-ran it: 21/21.


## Round 2

Re-review of fix commits `0d5d4b1` (code, tests, README, `fix-r3.md`) and `9d90123` (Decision lines).
Read `reviews/fix-r3.md` (baseline 289 -> 323/323, red-first proof with the sources reverted: 20 failed)
and the fix diff. Per finding:

- F1: `computeStats` (functions/src/spike-nuty/stats.ts) drops `feedback`/`topMisjudged` and returns
  `estimate` with the accuracy histogram, `noAccuracy`, mean/median, `topRecognitionReasons`
  (`estimate.reasons` only counts notes judged `recognition`, recognition-estimate.ts:301-306),
  `byMelody`, `byExpectedNote`, `byDeviceClass`, `daily`, `signals`. Latency/octave/twelfth/score
  histogram kept.
- F2: `resolveEstimate` uses the stored estimate only for the current `HEURISTIC_VERSION` with
  aligned `notes`/`events` lengths, else recomputes; `estimateSource` counts both. The extra length
  check is a sound guard for `byExpectedNote`'s per-index alignment.
- F3: `REPEAT_WINDOW_MS` (5 min) / `REPEAT_SCORE_DIFF` (30) exported; consecutive pairs per
  device+melody; five tests cover inside/outside window, below/above threshold, other device/melody.
- F4: pure core `recompute.ts` (args, plan, batches, summary) unit-tested; the script is dry-run by
  default, writes only `estimate`, and exits 2 without `FIRESTORE_EMULATOR_HOST` or `--project`
  (re-run here). The emulator host wins over `--project`, so it can never reach production by accident.
- F5: feedback types, columns and `feedbackAt` removed; four estimate CSV columns added via
  `resolveEstimate`.
- F6: tests rewritten and extended; F7: README describes the fields, the resolution rule, the repeat
  constants, the CSV columns and a "Recompute estimates" subsection.

Regression sweep: the fix touches only increment-3 files (`functions/`, `README.md`, the review
folder); F8 (ACCEPT) not reopened. No new findings.

| Check | Command (in worktree) | Result |
|---|---|---|
| Functions typecheck | `functions: npx tsc -p tsconfig.json --noEmit` | PASS (exit 0) |
| Functions build | `functions: npx tsc -p tsconfig.build.json` | PASS (exit 0) |
| Functions unit tests (7.1, 8.1) | `functions: npx vitest run --reporter=json` | PASS (323/323, 0 failed) |
| Stats script help (9.2) | `node scripts/spike-nuty-stats.mjs --help` | PASS (exit 0) |
| Recompute safety | `node scripts/recompute-estimates.mjs --write` (no emulator host, no `--project`) | PASS (refused, exit 2) |
| Root lint | `npx eslint .` | PASS (exit 0) |
| Emulator suite (9.1) | `firebase --config <untracked alt-port copy> emulators:exec --only functions,firestore --project demo-grajek "vitest run -c vitest.emulator.config.ts"` (functions 15121, firestore 18191; 8080/5001 held by a foreign emulator; copy and debug logs deleted afterwards) | PASS (4 files, 21/21) |

Pending manual: 9.3 (stats over HTTPS after the owner deploys). Guard `adaptation`: plan phases 7-9
(feedback aggregates) superseded by the owner's redirect; `plan.md` is locked, so the plan text was
not changed.
