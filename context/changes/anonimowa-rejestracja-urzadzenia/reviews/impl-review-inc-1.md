<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Anonymous device registration for notifications

**Plan**: context/changes/anonimowa-rejestracja-urzadzenia/plan.md   **Scope**: increment 1 (phases 1-4, full plan)   **Date**: 2026-10-11
**Round**: 2   **Verdict**: APPROVED   **Findings**: 9

Diff reviewed: `f20ecf5..HEAD` (F-01 base, not on main; no git remote).

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Success criteria run (round 1)
| Row | Command | Result |
|---|---|---|
| 1.1 | `pnpm --dir functions install --frozen-lockfile && pnpm --dir functions build` | PASS |
| 1.2 | `pnpm --dir functions typecheck` (includes `test-emulator/`) | PASS |
| 1.3 / 1.5 | `pnpm --dir functions exec vitest run --reporter=json` | PASS: 45/45 (handler 34, push-sender 6, firebase-config 5), 0 skipped |
| 1.4 / 2.2 / 3.3 / 4.3 | `pnpm lint`, `pnpm typecheck` | PASS |
| 2.1 / 3.1 / 4.3 | `pnpm exec vitest run --reporter=json` (root) | PASS: 69/69 across 7 files, 0 skipped |
| 2.3 / 3.3 / 4.3 | `pnpm build`; `dist/sw.js` contains `importScripts("push-sw.js")`; `dist/push-sw.js` exists | PASS |
| 3.2 | `CI=1 pnpm test:e2e` | PASS: 5/5 (notifications 2, installability 2, offline 1) |
| 4.1 | `pnpm --dir functions test:emulators` | SKIPPED: no JDK on this machine (`java: command not found`); no git remote, so the CI job has never run either. Partial proof re-run by the reviewer: `firebase emulators:exec --only functions --project demo-grajek` loaded `api`; PUT bad id → 400, GET → 405, unknown path → 404, non-allowlisted endpoint → 400 |
| 4.2 | `.github/workflows/ci.yml` job `functions` with `setup-java` Temurin 21 running `test:emulators` | PASS (read) |

Manual rows 3.4, 4.4-4.8 are `[ ]` and go to the `manual-pending` guard. Architecture gate: no `context/architecture/model.c4`, not run. Not bug mode.

Out-of-plan files (soft guard, all justified support files): `functions/tsconfig.build.json`, `functions/pnpm-workspace.yaml` (pnpm build-script policy), `functions/scripts/ensure-secret-local.mjs`, `functions/test/fakes.ts`, `src/push/panel-text.ts`, `src/push/push-sw.test.ts`, `playwright.config.ts` (dummy VAPID key for the e2e build instead of the CI env the plan suggested).

## Findings
### F1 — Full push-service error, including the device endpoint, is written to Cloud Logging
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: functions/src/index.ts:46 (with functions/src/devices/handler.ts:106,139)
- **Detail**: `onError: (error) => logger.error('devices api error', error)` logs the raw error. For a `WebPushError` (thrown by `push-sender.ts:39` on any non-404/410 status) Node's inspect prints its own properties: `endpoint` (the per-device push URL), the push service `headers` and `body`. The plan and ADR 0001 keep device data to the `devices/{id}` doc, which `DELETE` removes; a copy in logs outlives "turn off" and is a second store outside the planned whitelist. The log sender already logs only the host (`push-sender.ts:62`), which is the right pattern.
- **Fix**: In `onError`, log only `name`, `message` without the endpoint, `statusCode` and the endpoint host (never the full error object), and add a unit test that the logged value contains no endpoint path.
- **Decision**: FIXED (e0c32fc) — verified r2; one unambiguous fix; data-minimisation is a stated client constraint (ADR 0001). Evidence: `reviews/fix-r1.md`.

### F2 — Criterion 4.1 (emulator suite) checked without ever running
- **Severity**: WARNING
- **Impact**: MEDIUM
- **Dimension**: Success Criteria
- **Location**: plan.md `## Progress` 4.1; commit eecb043 message
- **Detail**: No JDK here and no remote, so `test:emulators` has run neither locally nor in CI. The criterion text and the brief's Key decisions row "Emulator test without Java" explicitly allow relying on the CI job, and Manual 4.8 covers a local run, so this is not blind signing. The emulator test file is typechecked and the functions-only emulator smoke passes; the Firestore half is unverified.
- **Fix**: Run `pnpm --dir functions test:emulators` once with JDK 21 (CI after push, or locally) before merge.
- **Decision**: ACCEPT — matches the recorded trade-off (brief Key decisions, "Emulator test without Java"); carried as `build-skipped` and `manual-pending` 4.8.

### F3 — Test cooldown is read-then-write; failed sends start no cooldown
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: functions/src/devices/handler.ts:94-113
- **Detail**: Concurrent POSTs on one device all pass the `lastTestAt` check; a 502 never sets `lastTestAt`. The payload is fixed and devices are free to mint, so atomicity adds no real abuse protection; `maxInstances: 2` bounds load. Plan says "written on a successful send", which the code does.
- **Fix**: If abuse appears, claim the cooldown in a transaction before sending.
- **Decision**: ACCEPT — matches the plan and the brief's "Test-send abuse limits" row.

### F4 — `markTested` after a concurrent delete returns 500 although the push went out
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: functions/src/devices/repository.ts:59-61, handler.ts:113
- **Detail**: `update()` throws NOT_FOUND if the doc vanished between `get` and `markTested`. Rare race; the client shows "something went wrong" once.
- **Fix**: Tolerate NOT_FOUND in `markTested`.
- **Decision**: ACCEPT — narrow race, no data harm.

### F5 — No request timeout on `webpush.sendNotification`
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: functions/src/devices/push-sender.ts:26-33
- **Detail**: A hanging push service holds a request until the function timeout. Hosts are restricted to four large push services, so the risk is small.
- **Fix**: Pass `timeout` (e.g. 10 s) in the send options.
- **Decision**: ACCEPT — low risk with the host allowlist; worth folding into S-08.

### F6 — Raw endpoint string stored instead of the normalised URL
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: functions/src/devices/validation.ts:53
- **Detail**: Validation uses WHATWG `URL`; web-push 3.6 re-parses with legacy `url.parse` (`web-push-lib.js:274,348`). The reviewer tried backslash, userinfo, `%5C@`, fragment/query, port and ideographic-dot variants: the two parsers agreed on the host in every case, and userinfo/port variants are rejected. No bypass found.
- **Fix**: Optionally return `url.href` so the stored value is the validated form.
- **Decision**: ACCEPT — no exploitable differential found.

### F7 — Registration is unauthenticated and records never expire
- **Severity**: OBSERVATION
- **Impact**: MEDIUM
- **Dimension**: Safety & Quality
- **Location**: functions/src/devices/handler.ts:73-86, index.ts:49-57
- **Detail**: Anyone can create device docs with allowlisted endpoints; no TTL or App Check. This is the anonymous design (brief "Device identity" and "Write path" rows, plan NOT-doing list).
- **Fix**: Add a Firestore TTL policy on `updatedAt` with S-08.
- **Decision**: ACCEPT — deliberate design; follow-up for S-08.

### F8 — 413 and 415 status codes beyond the planned set
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: functions/src/devices/handler.ts:74-79
- **Detail**: The plan says oversized and non-JSON bodies are "rejected"; the code uses the standard 413/415, covered by unit tests. The client maps any non-2xx to an error.
- **Fix**: None.
- **Decision**: ACCEPT — stricter and more precise than planned.

### F9 — Existing subscription reused without checking the VAPID key; no `pushsubscriptionchange`
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/push/push.ts:91-96, public/push-sw.js
- **Detail**: After a VAPID key rotation an old subscription would be re-PUT and sends would fail. `pushsubscriptionchange` is on the plan's NOT-doing list.
- **Fix**: Compare `subscription.options.applicationServerKey` when S-08 handles re-registration.
- **Decision**: ACCEPT — out of this increment's scope per plan.

## Round 2
Re-review of fix commit e0c32fc (evidence: `reviews/fix-r1.md`, baseline 45 → 48, red-first recorded).
- F1: `onError` now logs `toLoggableError(error)` (`functions/src/index.ts:47`), which keeps only `name`, URL-redacted `message`, `statusCode` and `endpointHost` (`functions/src/devices/push-sender.ts:73-113`). Three new tests assert that no endpoint path survives. Verified.
- Re-run (phase 1 criteria + build): `pnpm --dir functions build` 0, `typecheck` 0, `test` 48/48; root `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build` 0.
- Regression sweep: the fix touched only `functions/src/devices/push-sender.ts`, `functions/src/index.ts`, `functions/test/push-sender.test.ts` (increment-owned); no ACCEPT finding touched.
- Verdict APPROVED: the one remaining warning (F2) is a recorded trade-off; build, typecheck and lint all ran and passed. 4.1 stays SKIPPED: a green CI `functions` job (or a local JDK 21 run, Manual 4.8) is required before merge.
