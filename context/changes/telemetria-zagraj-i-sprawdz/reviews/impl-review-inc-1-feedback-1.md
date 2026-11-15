<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Telemetry and accuracy feedback for "Zagraj i sprawdź" (increment 1, Backend ingest) — client feedback 1

**Plan**: context/changes/telemetria-zagraj-i-sprawdz/plan.md   **Scope**: increment 1 (phases 1-3), feedback `reviews/feedback-inc-1-1.md`   **Date**: 2026-11-15
**Round**: 1   **Verdict**: REJECTED   **Findings**: 6

Diff: `git diff main...HEAD` (increment 1, no dependency; base `main`, branch already up to date with it). Code is unchanged since review r2 (APPROVED): the only commits after `8d54bdc` touch `plan.md` (`## Increments`) and the feedback file.

The owner's feedback redirects the change: no manual "Czy ocena się zgadza?" answer any more; instead the recognition accuracy is estimated automatically from the record data, computed on the client, stored in the record, aggregated in the stats. The owner authorised implementing this on the existing branches, so every point that lands in increment 1 is a FIX finding (orchestrator note; the Jev hint `feedback_out_of_scope=yes`, p=0.71, is overridden by the owner's explicit authorisation). Points that land in increments 2 and 3 are recorded as ACCEPT here and are fixed in those increments' own feedback rounds.

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | FAIL |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Plan Adherence is measured against the plan as redirected by the owner: the delivered backend still implements the manual feedback path and has no automatic estimate.

## Success criteria (current code, before the fix)
| Row | Command | Result |
|---|---|---|
| 1.2, 2.3 | `pnpm --dir functions typecheck` | PASS (exit 0) |
| 2.2 | `pnpm --dir functions build` | PASS (exit 0) |
| 1.1, 2.1, 3.2 | `npx vitest run` in `functions/` (one full run) | PASS: 9 files, 190/190 tests (baseline for the fix round) |
| 3.1 | `pnpm --dir functions test:emulators` | not re-run: code identical to r2, where it passed (16 tests); the fix round must run it (F1, F3 change the emulator test) |
| 3.3 (Manual) | TTL policies in the console after deploy | pending (owner's deploy) |

No `context/architecture/model.c4`: architecture gate not applicable. Not bug mode.

## Key decisions (this round)
| Decision | Source | Reason |
|---|---|---|
| Remove the feedback route completely, not leave it dead | Auto (orchestrator decision 1) | Nothing is merged or deployed; feedback point 1 allows removal unless risky. |
| Heuristic is one zero-import TS module in `functions/src/spike-nuty/` | Auto (orchestrator decision 2) | Shared by the Vite client (inc 2, `moduleResolution: bundler`, `lib` ES2022, `tsconfig.app.json`) and NodeNext functions (inc 3); zero imports avoids the `.js` extension mismatch. |
| Keep `v: 1`; all new fields optional | Auto | Additive and optional, nothing deployed, older bodies stay valid (orchestrator decision 3); `estimate.heuristicVersion` versions the derived data, which is what a recompute needs. A bump would force both versions into the validator for no gain. |
| Reason codes validated by format and bounds, not by membership | Auto | A new `HEURISTIC_VERSION` may add codes; pinning the set would make every heuristic change a functions deploy. The module still exports the current code list for tests and stats. |
| Body cap: raise only if a worst-case body at the caps exceeds 128 KiB | Auto (orchestrator decision 3) | Measured by a test, not guessed; r1 F1 showed the old estimate was wrong. |

## Findings

### F1 — Manual feedback path still in the backend
- **Severity**: CRITICAL
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: `functions/src/spike-nuty/handler.ts:3`, `:6`, `:21-25`, `:65-85`, `:102`; `functions/src/spike-nuty/validation.ts:7`, `:14`, `:20`, `:22-23`, `:177-183`, `:224-254`; `functions/src/spike-nuty/types.ts:3`, `:95-114`; `functions/src/spike-nuty/repository.ts:2`, `:19-22`, `:30-40`, `:76-86`; `functions/src/index.ts:12`; `functions/test/spike-nuty-fakes.ts:4`, `:20`, `:34-41`, `:150-164`; `functions/test/spike-nuty-handler.test.ts:12`, `:20`, `:26`, `:168-230`, `:238-253`, `:299-315`; `functions/test/spike-nuty-validation.test.ts:9-11`, `:130-165`; `functions/test/api-router.test.ts:23`; `functions/test-emulator/spike-nuty.emulator.test.ts:8`, `:38`, `:89-104`; `README.md:196-199`, `:207`
- **Detail**: Owner: "Nie trzeba się pytać i poprawiać. To ma dziać się automatycznie." and point 1 "Usuń odpowiadający endpoint/walidację oceny z backendu (#22)". The backend still accepts `PUT /api/spike-nuty/attempts/{id}/feedback`, validates it, stores `feedback`/`feedbackAt`, and counts it in the rate limit; README documents it.
- **Fix**: Remove the feedback route and everything that serves only it: `ROUTE` becomes `^(?:\/api)?\/spike-nuty\/attempts\/([^/]+)\/?$` (a `.../feedback` path now answers 404 `not_found` like any unknown path — add a handler test for that), drop `putFeedback`, `parseFeedback`, `parseMisjudged`, `MAX_FEEDBACK_BYTES`, `MAX_COMMENT`, `MAX_MISJUDGED`, `AttemptFeedback`, `MisjudgedNote`, `StoredAttempt.feedback/feedbackAt`, `saveFeedback`, `toStoredFeedback`, the fake's `saveFeedback`/`calls.saveFeedback`, `sampleFeedback`, and all feedback tests (unit, router, emulator); the rate limit counts accepted attempt writes only (update the `RateLimitOptions` comment, the 429 test and README "60 times per hour (attempts only)"); remove feedback wording from `types.ts:3`, `index.ts:12` and README (`:196-199`, "the feedback" in `:207`).
- **Decision**: FIX — owner feedback point 1; orchestrator decision 1 (removal is safe, nothing is deployed).

### F2 — No automatic estimate of recognition accuracy
- **Severity**: CRITICAL
- **Impact**: MEDIUM
- **Dimension**: Plan Adherence
- **Location**: new `functions/src/spike-nuty/recognition-estimate.ts`, new `functions/test/spike-nuty-recognition-estimate.test.ts`
- **Detail**: Feedback point 2: classify every note and event heuristically as likely player error vs likely recognition error vs uncertain, compute an estimated recognition accuracy per attempt, record the heuristic version; pure, tested logic computed on the client. Nothing of this exists. The module belongs to increment 1 so increments 2 (client computes and sends) and 3 (stats, recompute script) import one implementation.
- **Fix**: Add `functions/src/spike-nuty/recognition-estimate.ts` with **zero imports** and only syntax/APIs available in ES2022 (no `toSorted`, `findLast`, etc.; it is also compiled by the client's `tsconfig.app.json`), defining its own structural input types (not importing `types.ts`; `types.ts`/`validation.ts` may import from it). Export: `HEURISTIC_VERSION` (e.g. `'1'`), named threshold constants (`SHORT_EVENT_MS = 120`, `LOW_CLARITY`, `LOW_LEVEL_DB`, `HIGH_LEVEL_DB` for missing notes, `PITCH_SPREAD_CENTS`, `RHYTHM_OFFSET_MS`, `ON_TIME_MS`), the verdict type `'player' | 'recognition' | 'uncertain' | 'ok'`, a `REASON_CODES` list, and `estimateRecognition(input)` where `input` = `{ notes, events, timing, signal?, ended, counts }` (same field names as the record). Rules: note/event → `recognition` with codes for exact octave (±12/±24 → `octaveJump`) or twelfth (+19 → `twelfthJump`), very short event (< `SHORT_EVENT_MS` → `shortEvent`), low clarity or low level (`lowClarity`, `lowLevel`), one reference note split into several same-pitch events (`splitNote`) or repeated reference notes merged into one event (`mergedNotes`, from event count vs reference count around that note), high pitch spread within the event (`unstablePitch`, from `pitchSpreadCents`), missing note while the window level was high (`missingLoud`, from `windowLevelDb`); → `player` for a stable, confident event at a different pitch that is not octave/twelfth (`wrongPitchStable`) and for a single note's stable rhythm offset while the others are on time (`rhythmOutlier`); a graded `good` note with no suspicion → `ok`; anything else (including a missing note without level data) → `uncertain`. Return `{ heuristicVersion, estimatedAccuracy, noteCounts {player, recognition, uncertain, ok}, eventCounts {…}, reasons: {code: count} (recognition suspects), notes: [{verdict, reasons}] aligned with input notes, events: [{verdict, reasons}] aligned with input events, signals: { unvoicedRatio|null, medianClarity|null, latencySpreadMs|null, eventsPerNote|null, stopped } }`; `estimatedAccuracy` = 1 − (reference notes, i.e. `refIndex !== null`, with verdict `recognition`) / (reference notes), clamped 0..1, `null` when there are no reference notes. Tests: one synthetic case per rule and per verdict type, the accuracy formula, and edge cases (no notes → `null`, all notes missing with and without loud windows, stopped attempt → `signals.stopped` true and missing notes after the stop not counted as `missingLoud`, records without the new optional fields → `uncertain` instead of throwing), plus a test that the module has no `import` statement.
- **Decision**: FIX — owner feedback point 2; orchestrator decision 2.

### F3 — Record contract lacks the heuristic's raw signals and the stored estimate
- **Severity**: CRITICAL
- **Impact**: MEDIUM
- **Dimension**: Plan Adherence
- **Location**: `functions/src/spike-nuty/types.ts:40-95`, `functions/src/spike-nuty/validation.ts:135-222`, `functions/test/spike-nuty-validation.test.ts`, `functions/test/spike-nuty-handler.test.ts`, `functions/test/spike-nuty-fakes.ts`, `functions/test-emulator/spike-nuty.emulator.test.ts`, `README.md:185-233`
- **Detail**: Feedback point 2 wants the estimate "zapisywana w rekordzie" with the heuristic version "żeby dało się ją później przeliczyć na surowych danych". The record has no per-event pitch spread (`parseEvent`, `validation.ts:151-164`), no frame totals for the unvoiced ratio, no level for a missing note's window (`parseNote`, `:135-149`), and no `estimate` (`parseAttempt`, `:200-222` would drop it as an unknown field). README has no field-level contract.
- **Fix**: Add optional, bounded fields, keep `v: 1` and accept bodies without them: event `pitchSpreadCents?: number 0..2400`; note `windowLevelDb?: number|null` (finite, −200..20); attempt `signal?: { frames: int ≥0, voicedFrames: int 0..frames, medianClarity: number 0..1 | null }`; attempt `estimate?: { heuristicVersion: string 1..32, estimatedAccuracy: number 0..1 | null, noteCounts / eventCounts: {player, recognition, uncertain, ok: int 0..MAX_NOTES}, reasons: map of ≤32 keys matching `^[a-z][A-Za-z0-9]{0,31}$` to int 0..MAX_NOTES, notes: [{verdict, reasons: ≤6 codes}] with length = `notes.length`, events: same with length = `events.length`, signals: {unvoicedRatio 0..1|null, medianClarity 0..1|null, latencySpreadMs ≥0|null, eventsPerNote ≥0|null, stopped: boolean} }`; any violation → 400 `invalid_attempt`, absent fields stay absent in the stored document. Take the verdict set from `recognition-estimate.ts`. Tests: a body with all new fields round-trips; a v1 body without them is still accepted; each new bound rejected (bad verdict, length mismatch, 7 reasons, bad code, accuracy 1.1, voicedFrames > frames); a handler test that a worst-case body at the caps (400 notes, 200 events, every new field, estimate with 6 reasons per item) is accepted — if it exceeds 131072 bytes, raise `MAX_ATTEMPT_BYTES` to 262144 and justify it in README and in the fix evidence file (Firestore document limit 1 MiB); emulator test stores `estimate` and the new fields. README: replace the endpoint list with the single attempt route and add a "Record contract" subsection listing the fields, the optional signal/estimate fields, `HEURISTIC_VERSION` and that the estimate is for the owner only (never shown to the child).
- **Decision**: FIX — owner feedback point 2; orchestrator decision 3.

### F4 — App-side changes (remove the question, compute and send the estimate, 360 px note table)
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Scope Discipline
- **Location**: feedback points 1 (app part), 2 (client computation), 3
- **Detail**: These live in `src/` (increment 2, PR #23), which is stacked on this increment and receives F1-F3 by merge.
- **Fix**: none in increment 1; increment 2's feedback round implements them against the module and contract from F2/F3.
- **Decision**: ACCEPT — out of scope of increment 1, handled in increment 2.

### F5 — Stats aggregates, repeat-attempt detection and the recompute script
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Scope Discipline
- **Location**: feedback point 2 (statistics, "powtórzenia … liczone w statystykach na serwerze")
- **Detail**: Owner stats and the recompute script are increment 3 (PR #24), stacked on this increment.
- **Fix**: none in increment 1; increment 3's feedback round removes the "% ocena się zgadza" aggregates and adds the estimate aggregates, repeats and the script using `recognition-estimate.ts`.
- **Decision**: ACCEPT — out of scope of increment 1, handled in increment 3.

### F6 — Plan body still describes the v1 contract with feedback
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: `context/changes/telemetria-zagraj-i-sprawdz/plan.md:43-53`, `:97-111`, `:163-199`, `:224-303`
- **Detail**: Overview, Desired End State, Record contract and phases 1-3 still name the feedback endpoint (and the 64 KiB cap, already superseded in r1). The plan body is locked while the change is `implementing`; this report and `reviews/feedback-inc-1-1.md` record the redirect, and after the fix README is the contract's source of truth.
- **Fix**: none; README and code are authoritative (raised as an `adaptation` guard).
- **Decision**: ACCEPT — deliberate owner redirect, recorded here.
