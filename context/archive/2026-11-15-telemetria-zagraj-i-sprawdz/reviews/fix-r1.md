# Fix round 1: telemetria-zagraj-i-sprawdz, increment 1

Report: `reviews/impl-review-inc-1.md` (round 1). FIX findings: F1. F2-F6 are ACCEPT and were left untouched.

## F1: attempt byte cap raised to 128 KiB

- `functions/src/spike-nuty/validation.ts`: `MAX_ATTEMPT_BYTES` 65536 → 131072.
- `functions/test/spike-nuty-handler.test.ts`: new test "accepts a valid record at the caps (400 notes, 200 events) that is over 64 KiB" (asserts the JSON body is > 65536 bytes, answers 204, stores 400 notes); the 413 test is renamed to "over 128 KiB" (it already pads by `MAX_ATTEMPT_BYTES`).
- `README.md`: "at most 64 KiB" → "at most 128 KiB" for the attempt endpoint.
- Not changed: `plan.md` still says 64 KiB in its Contract text (lines 123, 195); rs-implement may edit only `## Progress` of an implementing plan. The code, the test and the README are the current truth.

## Red with the fix reverted

`MAX_ATTEMPT_BYTES` set back to 65536, then
`pnpm --dir functions exec vitest run test/spike-nuty-handler.test.ts`:

```
 × accepts a valid record at the caps (400 notes, 200 events) that is over 64 KiB 6ms
 FAIL  test/spike-nuty-handler.test.ts > PUT /spike-nuty/attempts/{id} > accepts a valid record at the caps (400 notes, 200 events) that is over 64 KiB
AssertionError: expected 413 to be 204 // Object.is equality
      Tests  1 failed | 28 passed (29)
```

## Green with the fix

`pnpm --dir functions exec vitest run test/spike-nuty-handler.test.ts`:

```
 Test Files  1 passed (1)
      Tests  29 passed (29)
```

## Full suite vs baseline (criteria 1.1, 2.1, 3.2)

`pnpm --dir functions test`:

```
 Test Files  9 passed (9)
      Tests  190 passed (190)
```

Baseline (review r1): 189/189 in 9 files. Now 190/190: the one new test, no new failures.

## Typecheck and build (criteria 1.2, 2.2, 2.3)

- `pnpm --dir functions typecheck` → exit 0
- `pnpm --dir functions build` → exit 0

## Not re-run

- 3.1 (`test:emulators`): the fix touches no repository or Firestore code, only the handler's size constant; the emulator tests do not exercise the byte cap.
