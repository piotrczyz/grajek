<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Telemetry and accuracy feedback for "Zagraj i sprawdź" (increment 1, Backend ingest)

**Plan**: context/changes/telemetria-zagraj-i-sprawdz/plan.md   **Scope**: increment 1 (phases 1-3)   **Date**: 2026-11-15
**Round**: 1   **Verdict**: NEEDS_ATTENTION   **Findings**: 6

Diff: `git diff main...HEAD` (increment 1 has no dependency; base = `main`). 18 files, all named in phases 1-3 except the rs-implement bookkeeping in `change.md` / `plan.md`. No out-of-plan files.

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success criteria
| Row | Command | Result |
|---|---|---|
| 1.2, 2.3 | `pnpm --dir functions typecheck` | PASS (exit 0) |
| 2.2 | `pnpm --dir functions build` | PASS (exit 0) |
| 1.1, 2.1, 3.2 | `vitest run --reporter=json` (full functions unit suite, one run) | PASS: 189/189 tests, 9 files (spike-nuty-validation 42, spike-nuty-handler 28, api-router 11, firebase-config 7; existing handler.test.ts 34 untouched and green) |
| 3.1 | `firebase emulators:exec --only functions,firestore` + `vitest run -c vitest.emulator.config.ts` | PASS: 3 files, 16 tests. Run on alternate ports (functions 6101, firestore 6180, hub 6400) via a temporary copy of `firebase.json` with `FUNCTIONS_EMULATOR_HOST` set, because the default ports are held by another project's emulator on this machine; the temp config and `firestore-debug.log` were removed afterwards. |
| 3.3 (Manual) | TTL policies visible in the Firestore console after deploy | pending: needs the owner's deploy. Diff evidence: `firestore.indexes.json` `fieldOverrides` with `"ttl": true` for both collections, asserted by `functions/test/firebase-config.test.ts`. |

No `context/architecture/model.c4`: architecture gate not applicable. Not bug mode.

## Findings

### F1 — Attempt byte cap (64 KiB) is lower than the field caps allow
- **Severity**: WARNING
- **Impact**: MEDIUM
- **Dimension**: Safety & Quality
- **Location**: functions/src/spike-nuty/validation.ts:19-21, functions/src/spike-nuty/handler.ts:42
- **Detail**: The contract accepts up to 400 notes and 200 events, but one note serialises to about 173 B and one event to about 156 B with realistic number widths. 200 events alone are ~31 KB; 200 notes + 200 events are ~66 KB, 400 + 200 ~100 KB. The melodies have about 16 reference notes, so the note list grows past ~200 only through extra (unmatched) events, i.e. on exactly the noisy recordings where recognition failed. Those bodies are answered 413 and, per the client retry rules ("400/413/415 → drop"), are discarded for good. The plan's estimate (20-40 KiB, Performance Notes and brief "Size limits" row) counted events only. This is a flaw in the plan's limits, not in the implementation.
- **Fix**: Raise `MAX_ATTEMPT_BYTES` to 131072 (128 KiB; well under Firestore's 1 MiB document limit) and add a handler test where a valid body at the caps (400 notes + 200 events, realistic numbers, over 64 KiB) answers 204; update the 64 KiB mention in the 413 test name and in the README if present.
- **Decision**: FIX — one unambiguous change that loosens, not narrows, the contract; increment 2 does not depend on the byte value.

### F2 — Rate limit keyed on a client-chosen device id
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: functions/src/spike-nuty/handler.ts:32-37, :58, :77
- **Detail**: Rotating UUIDs bypasses the 60/hour limit; knowing another device's id lets a caller exhaust its budget. Inherent in an anonymous, auth-free endpoint (brief: "Feedback ownership" and "Rate limit" rows; ADR 0001 anonymous device registry); TTL bounds storage growth.
- **Fix**: none now; App Check or a global cap if abuse appears.
- **Decision**: ACCEPT — deliberate trade-off recorded in the brief (no auth for a hidden spike screen).

### F3 — Feedback answered 404 still consumes rate-limit budget
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: functions/src/spike-nuty/handler.ts:77-82
- **Detail**: `admit()` runs before `saveFeedback`, so an unknown-attempt / other-device feedback counts as a write. Contract text says "accepted writes"; the plan's handler goal says "rate limit before write", which this follows. No information leaks (same 404 for both cases).
- **Fix**: none.
- **Decision**: ACCEPT — follows the phase 2 handler goal; at worst a misbehaving client spends its own budget faster.

### F4 — Duplicate check ignores deviceId and has a count-only race
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: functions/src/spike-nuty/handler.ts:54-61
- **Detail**: `exists` → `admit` → `createIfAbsent`: two concurrent retries of one id may both be counted (the transaction still writes once, correct). A PUT to an existing id from another device answers 204 without storing; reachable only by guessing a UUID v4.
- **Fix**: none.
- **Decision**: ACCEPT — stored data is always correct; idempotency is what the contract asks for.

### F5 — Comment length checked before trimming
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: functions/src/spike-nuty/validation.ts (feedback `comment`, `str(b.comment, MAX_COMMENT).trim()`)
- **Detail**: 500 characters plus surrounding whitespace is rejected. The contract ("≤500, optional, trimmed") is ambiguous; increment 2 can trim before sending.
- **Fix**: none here; increment 2 trims client-side.
- **Decision**: ACCEPT — within the contract's reading.

### F6 — Validation is stricter than the contract text on some ints
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: functions/src/spike-nuty/validation.ts
- **Detail**: `nr`/`refIndex`/`playedIndex` 0..100000, `expectedMidi`/`playedMidi` 0..127, `clientTs`/`durationMs`/`frames`/`suspect*`/`samples` ≥ 0, where the contract says only "int"/"number". All are natural domains of the values. Increment 2's record builder must stay inside them (a negative relative `startMs` is still allowed).
- **Fix**: none; increment 2 to note these bounds when building the record.
- **Decision**: ACCEPT — sensible bounds; reject-on-violation is the contract's behaviour.

## Notes
- Devices refactor: `functions/src/http.ts` helpers are byte-identical to the former private helpers in `functions/src/devices/handler.ts`; types re-exported; `functions/test/handler.test.ts` unchanged and green.
- Router regex `^(?:/api)?/spike-nuty(?:/|$)` is anchored; `/spike-nutyx` still goes to devices.
- TTL fields are Firestore `Timestamp`s (`Timestamp.fromDate(...)`), as TTL requires.
- Cosmetic, not a finding: `functions/test/spike-nuty-fakes.ts:61` `DEVICE_ID ='…'` spacing; `firestore.rules` header comment names only `devices/{id}`.
