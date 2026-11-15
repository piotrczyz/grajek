# Fix round 2: telemetria-zagraj-i-sprawdz, increment 1 (client feedback 1)

Report: `reviews/impl-review-inc-1-feedback-1.md` (its `**Round**: 1`). Named `fix-r2`
because `fix-r1.md` already holds the evidence of the first review's fix round
(commit `6561370`, `(r1)`); this is the second `(r<N>)` fix commit of the increment.
FIX findings: F1, F2, F3. F4-F6 are ACCEPT and were left untouched.

## F1: manual feedback path removed

- `handler.ts`: `ROUTE` is `^(?:\/api)?\/spike-nuty\/attempts\/([^/]+)\/?$`; `putFeedback` gone; a
  `.../feedback` path answers 404 `not_found`; `RateLimitOptions` counts accepted attempt writes only.
- `validation.ts`: `parseFeedback`, `parseMisjudged`, `MAX_FEEDBACK_BYTES`, `MAX_COMMENT`, `MAX_MISJUDGED` removed.
- `types.ts`: `AttemptFeedback`, `MisjudgedNote`, `StoredAttempt.feedback/feedbackAt` removed; header names only the attempt route.
- `repository.ts`: `saveFeedback`, `toStoredFeedback` removed. `index.ts` header reworded.
- Tests: fake `saveFeedback`/`calls.saveFeedback`, `sampleFeedback`, every feedback test (unit, router, emulator) removed;
  new handler test "answers 404 not_found for the removed feedback path and writes nothing"; the 429 test counts two
  attempts instead of attempt + feedback; new emulator test "answers 404 to the removed feedback path".
- README: one endpoint, "60 attempts per hour (retries of a stored attempt are not counted)", no feedback wording.

## F2: `recognition-estimate.ts`

- New `functions/src/spike-nuty/recognition-estimate.ts`: zero imports, its own structural input types, exports
  `HEURISTIC_VERSION = '1'`, `SHORT_EVENT_MS = 120`, `LOW_CLARITY = 0.8`, `LOW_LEVEL_DB = -50`, `HIGH_LEVEL_DB = -40`,
  `PITCH_SPREAD_CENTS = 60`, `RHYTHM_OFFSET_MS = 150`, `ON_TIME_MS = 80`, `ON_TIME_SHARE = 0.8`, `MAX_ITEM_REASONS = 6`,
  `Verdict`, `VERDICTS`, `REASON_CODES`, `estimateRecognition(input)` and the output types.
- Input is `{ notes, events, signal?, ended }`: the rules read nothing from `timing` or `result.counts`, so they are
  not required (a whole record still passes structurally).
- Note-to-event link: `playedIndex` indexes the graded played notes, i.e. the events without the leading count-in
  events the quantizer drops, so `event = events[playedIndex + events.length − notesWithPlayedIndex]`; a negative
  shift links nothing (documented in the module header).
- New `functions/test/spike-nuty-recognition-estimate.test.ts`: 36 tests (one synthetic case per rule and verdict,
  the accuracy formula and rounding, no notes, all missing quiet/loud, stopped attempt, records without the optional
  fields, inconsistent links, counts consistency, no-import check).
- Client compatibility (the client's `tsconfig.app.json` options plus `--erasableSyntaxOnly`, lib ES2022):
  `pnpm exec tsc --ignoreConfig --noEmit --target ES2022 --lib ES2022,DOM --module ESNext --moduleResolution bundler --strict --isolatedModules --verbatimModuleSyntax --noUnusedLocals --noUnusedParameters --noFallthroughCasesInSwitch --erasableSyntaxOnly --skipLibCheck functions/src/spike-nuty/recognition-estimate.ts`
  → exit 0.

## F3: record contract

- Optional, bounded fields, `v: 1` kept, absent fields stay absent: event `pitchSpreadCents` (0..2400), note
  `windowLevelDb` (−200..20 or null), attempt `signal` (`frames` int ≥ 0, `voicedFrames` int 0..frames,
  `medianClarity` 0..1 or null), attempt `estimate` (heuristicVersion 1..32 chars, estimatedAccuracy 0..1 or null,
  note/event verdict counts int 0..400, ≤ 32 reason keys matching `^[a-z][A-Za-z0-9]{0,31}$` with int 0..400,
  `notes`/`events` item lists exactly as long as the record's, ≤ 6 reason codes each, verdicts from `VERDICTS`,
  `signals` bounds). Any violation → 400 `invalid_attempt`.
- Body cap: a worst-case body at every cap (400 notes, 200 events, every optional field, 6 reasons per item,
  32 reason keys, long floats, 512-char user agent) measures 209208 bytes (204.3 KiB) of JSON, over 131072, so
  `MAX_ATTEMPT_BYTES` = 262144; the handler test asserts the sample is > 131072 and ≤ the cap and is accepted.
  The Firestore document limit is 1 MiB. Justified in README.
- `sampleFullAttempt()` in the fakes builds a body with every new field and the estimate the module computes; used by
  validation, handler (memory and fake Firestore) and emulator tests.
- README "Spike telemetry": single route, "Record contract" subsection (fields, optional signal/estimate fields,
  `HEURISTIC_VERSION`, owner-only estimate), the cap justification.

## Red with the fix reverted

F1 + F3: the four pre-fix sources (`git show HEAD:functions/src/spike-nuty/{handler,repository,types,validation}.ts`)
put back, new tests and module kept, then
`pnpm exec vitest run test/spike-nuty-handler.test.ts test/spike-nuty-validation.test.ts`:

```
     × answers 404 not_found for the removed feedback path and writes nothing
       AssertionError: expected 500 to be 404 // Object.is equality
     × accepts a worst-case record at the caps (every optional field) that is over 128 KiB
       AssertionError: expected 208602 to be less than or equal to 131072
     × round-trips a body with every optional field
     × rejects bad verdict … × rejects signal null   (all 25 new bound cases)
     × stores the optional signal and estimate fields as sent
     × answers 400 invalid_attempt for an estimate not aligned with the notes
     × writes the optional signal and estimate fields
 Test Files  2 failed (2)
      Tests  31 failed | 55 passed (86)
```

F2: `recognition-estimate.ts` moved away, `pnpm exec vitest run test/spike-nuty-recognition-estimate.test.ts`:

```
Error: Cannot find module '../src/spike-nuty/recognition-estimate.js'
 Test Files  1 failed (1)
      Tests  no tests
```

Sources restored afterwards (`git diff --stat` identical before and after).

## Green: full suite vs baseline (criteria 1.1, 2.1, 3.2)

`pnpm exec vitest run` in `functions/`:

```
 Test Files  10 passed (10)
      Tests  241 passed (241)
```

Baseline (review report): 190/190 in 9 files. Now 241/241 in 10 files: the new estimate file (36), new validation
and handler cases, minus the removed feedback tests; no failures.

## Typecheck, build, lint (criteria 1.2, 2.2, 2.3)

- `pnpm --dir functions typecheck` → exit 0
- `pnpm --dir functions build` → exit 0
- `pnpm lint` (root) → exit 0

## Emulator tests (criterion 3.1)

`pnpm --prefix functions test:emulators` → exit 1, "Could not start Firestore Emulator, port taken": another
project's emulator holds 8080 on this machine. Re-run on alternate ports with an untracked copy of `firebase.json`
(functions 15101, firestore 18181/ws 19151, hub 14410, logging 14510), deleted afterwards:

`node scripts/ensure-secret-local.mjs && FUNCTIONS_EMULATOR_HOST=127.0.0.1:15101 pnpm exec firebase --config ../firebase.emu-alt.json emulators:exec --only functions,firestore --project demo-grajek "vitest run -c vitest.emulator.config.ts"`
(after `pnpm build`):

```
 Test Files  3 passed (3)
      Tests  17 passed (17)
+ Script exited successfully (code 0)
```

17 = 16 before − 1 feedback test + 2 new (optional fields stored, feedback path 404).
