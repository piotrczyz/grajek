# Telemetry and accuracy feedback for "Zagraj i sprawdź" — Implementation Plan

## Overview
Every finished attempt on the hidden spike screen (`?spike=nuty`) sends one
anonymous record (settings, scores, note-by-note grading, raw detected events,
latency figures) to new endpoints of the existing `api` Cloud Function, which
stores it in Firestore `spikeNutyAttempts` with a 180-day TTL. The result screen
asks "Czy ocena się zgadza?" so the player can mark notes the app misjudged;
that answer updates the same record. A secret-protected owner endpoint returns
aggregates and a JSON/CSV export, so the owner can tell a child's mistakes from
recognition mistakes across all devices.

## Current State Analysis
- `api` is one `onRequest` function whose handler is the devices handler only
  (`functions/src/index.ts:54-69`); that handler answers 404 for any path not
  matching `/devices/...` (`functions/src/devices/handler.ts:47`, `:146-150`).
  New routes therefore need a dispatcher in front of it.
- Handler pattern to copy: injected `repo`/`now`/`onError`, `bodySize` from
  `rawBody`, JSON content-type check, `{error: code}` answers, `Cache-Control:
  no-store` (`functions/src/devices/handler.ts:25-79`, `:144-172`); device id is
  a lower-case UUID v4 (`functions/src/devices/validation.ts:4`, `:25-27`).
- Only the Admin SDK writes Firestore; rules deny all clients
  (`firestore.rules:5-10`) and a test pins that (`functions/test/firebase-config.test.ts:51-65`).
  `firestore.indexes.json` has empty `fieldOverrides`.
- Secrets: `defineSecret('VAPID_PRIVATE_KEY')` bound to `api`
  (`functions/src/index.ts:30`, `:59`); emulator runs get
  `functions/.secret.local` copied from `.secret.local.example` only when the
  file is missing (`functions/scripts/ensure-secret-local.mjs:8-11`).
- Emulator tests call the real function at
  `http://127.0.0.1:5001/demo-grajek/europe-central2/api` and read Firestore
  over REST with `Bearer owner` (`functions/test-emulator/devices.emulator.test.ts:9-48`).
- Client: anonymous id `getOrCreateDeviceId()` (`src/push/device-id.ts:39-50`),
  same-origin base `apiBase()` (`src/push/api.ts:12-15`). No localStorage use
  anywhere in `src/`; IndexedDB goes through `src/storage` with migrations.
- Spike screen: `stop(recordedBpm)` is called by both the auto-stop timer and
  the Stop button (`src/spike-nuty/SpikeScreen.tsx:193-204`, `:256`, `:427`), so
  "normal end vs Stop" is not recorded today. Grading is a `useMemo` over the
  recording and the live options (`SpikeScreen.tsx:156-161`); `autoLatency` stays
  toggleable on the result view (`:469-476`), so a result can be re-graded after
  it is shown. Output latency comes from `tracker.latencyMs` (`:245`).
- `NoteEvent` has `midi, startMs, durationMs, meanCents, frames, suspectOctave,
  suspectTwelfth` but no clarity or level (`src/spike-nuty/logic/segment.ts:38-52`);
  the voiced frame drops clarity (`segment.ts:54-59`).
- `kindOf` (good/late/early/rhythm/wrongPitch/missing/extra) is private and
  `NoteRow.status` holds Polish copy text (`src/spike-nuty/results.ts:30-40`, `:56-69`).
- No build id exists: `package.json` version is `0.0.0`, `vite.config.ts` has no
  `define`.
- CI checks functions (build, typecheck, unit, emulator tests;
  `.github/workflows/ci.yml:68-108`) but never deploys them; only Hosting is
  deployed (preview per PR, live on main, `ci.yml:110-155`). Preview channels
  use the same `/api/**` rewrite to the live `api` function (`firebase.json:7-10`),
  so a preview reaches the backend only after the owner deploys functions
  (README "Go live", `README.md:164-174`).

## Desired End State
- After every attempt that reaches the result view, one record is queued and
  sent without blocking the UI; offline attempts are sent later. Nothing is sent
  when the local opt-out is off-switched.
- The result screen shows "Czy ocena się zgadza?" with Tak / Nie; Nie reveals a
  "aplikacja się pomyliła" toggle per row and an optional comment; the answer
  updates the stored record.
- The spike screen shows the Polish notice and a locally remembered toggle.
- `PUT /api/spike-nuty/attempts/{id}` and `PUT /api/spike-nuty/attempts/{id}/feedback`
  validate, cap size, rate-limit per device and write `spikeNutyAttempts/{id}`
  with `expireAt` = receipt + 180 days; TTL policy is declared in
  `firestore.indexes.json` and documented.
- `GET /api/spike-nuty/stats` and `GET /api/spike-nuty/export` answer only with
  the right `X-Admin-Key`; a script and README show how to fetch them; the
  manual secret step is spelled out.

### Key discoveries
- Dispatcher is required: `functions/src/devices/handler.ts:146-150` 404s other paths.
- Re-grading after display: `src/spike-nuty/SpikeScreen.tsx:156-161`, `:469-476`.
- Clarity/level not kept per event: `src/spike-nuty/logic/segment.ts:54-59`.
- Functions are not deployed by CI: `.github/workflows/ci.yml:68-73`, `:110-155`.

## What we're NOT doing
- No audio, no profile name, no profile data, no IP storage; user agent only as
  sent by the client, truncated.
- No Firebase JS SDK in the app and no client Firestore access; rules unchanged.
- No CI deploy of functions (stays a manual owner step, see Key decisions).
- No owner dashboard UI; JSON/CSV over HTTP only.
- No changes outside the spike screen in the app; no IndexedDB migration.
- No consent dialog (request: anonymous technical data, notice + opt-out).

## Implementation Approach
Follow the existing devices pattern: a pure `validation.ts` that keeps only
whitelisted fields, a repository interface with a Firestore implementation and
an in-memory fake, and a handler factory with injected `now`. A small
`createApiHandler` dispatcher routes `/spike-nuty/...` to the new handlers and
everything else to the devices handler unchanged. Rate limiting is a Firestore
counter document per device (fixed one-hour window, updated in a transaction),
because `api` runs up to two instances (`index.ts:60`) and in-memory counters
would be per instance and lost on cold start. Attempt ids are client-generated
UUIDs, so the PUT is idempotent: a retry of an already stored attempt answers
204 without overwriting. Feedback is a separate PUT on the same document,
accepted only when its `deviceId` equals the stored one (otherwise 404, nothing
leaked).

On the client, a self-contained `src/spike-nuty/telemetry/` module builds the
record from the screen state, keeps a bounded FIFO queue in `localStorage`
(chosen over IndexedDB to avoid a migration of the shared `src/storage` schema
for a throwaway spike), and flushes it on enqueue, on screen mount and on the
`online` event. Owner stats are computed in the function at read time over a
date-bounded query, which is cheap at spike scale and keeps the stored schema
free of derived fields.

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Backend ingest (A1) | 1-3 | — | no | in-progress | — |
| 2 | Client telemetry and feedback (A2) | 4-6 | 1 | yes | pending | — |
| 3 | Owner stats and export (A3) | 7-9 | 1 | yes | pending | — |

Increments 2 and 3 are each stacked on increment 1 and are file-disjoint from
each other (2 touches only `src/`, `vite.config.ts`; 3 touches only
`functions/` and `README.md`), so they can run in parallel.

## Critical Implementation Details

### Record contract (v1) — shared by increments 1 and 2
`PUT /api/spike-nuty/attempts/{attemptId}` (attemptId: lower-case UUID v4),
`Content-Type: application/json`, body at most 64 KiB:
- `v`: 1; `deviceId`: UUID v4; `clientTs`: epoch ms (number).
- `app`: `{ build: string ≤64 }`.
- `device`: `{ userAgent: string ≤512, standalone: boolean, platform?: string ≤64, mobile?: boolean }`.
- `settings`: `{ melodyId: string ≤64, instrument: 'clarinet-bb' | 'c', bpm: int 20..300,
  prepSec: int 0..60, ignoreOctave, visualOnly, autoLatency: boolean }`.
- `result`: `{ scorePercent: int 0..100, pitchPercent: int 0..100, counts: { total,
  good, late, early, rhythm, wrongPitch, missing, extra: int 0..500 } }`.
- `notes`: ≤400 items `{ nr: int, refIndex: int|null, playedIndex: int|null,
  expectedMidi: int|null, playedMidi: int|null, centsDiff: number|null,
  offsetMs: number|null, status: 'good'|'late'|'early'|'rhythm'|'wrongPitch'|'missing'|'extra',
  octaveOff: boolean, twelfthOff: boolean }` (`octaveOff` = |played−expected| is
  12 or 24; `twelfthOff` = it is 19).
- `events`: ≤200 items `{ midi: int, startMs, durationMs, meanCents,
  meanClarity: 0..1, meanLevelDb, frames: int, suspectOctave: int, suspectTwelfth: int }`
  (raw detected events, sounding pitch, before the latency shift).
- `timing`: `{ outputLatencyMs: number|null, medianOffsetMs: number|null,
  meanOffsetMs: number|null, correctionMs: number, samples: int }`.
- `ended`: `'complete' | 'stopped'`.
Unknown fields are dropped; numbers must be finite; any violation → 400
`invalid_attempt`. Stored document = the parsed record plus `receivedAt`
(server time) and `expireAt` (receivedAt + 180 days).

`PUT /api/spike-nuty/attempts/{attemptId}/feedback`, body at most 8 KiB:
`{ v: 1, deviceId, agrees: boolean, misjudged: Array<{ refIndex: int|null,
playedIndex: int|null }> (≤400, must be empty when agrees), comment: string ≤500
(optional, trimmed), regraded: boolean }`. Stored as `feedback` map plus
`feedbackAt`; a later answer replaces the earlier one. Unknown attempt or a
different `deviceId` → 404 `unknown_attempt`; invalid → 400 `invalid_feedback`.

Common answers: 413 `body_too_large`, 415 `unsupported_media_type`, 405 with
`Allow`, 429 `rate_limited` with `Retry-After` (seconds), 500 `internal`.
Rate limit: 60 accepted writes (attempts + feedback) per device in a fixed
one-hour window, stored in `spikeNutyRateLimits/{deviceId}` (`windowStart`,
`count`, `expireAt` = window end + 1 day).

### Client send and retry rules
- Queue key `grajek.spikeNuty.queue.v1`, at most 20 items (oldest dropped);
  opt-out key `grajek.spikeNuty.telemetry` (`'off'` disables; default on).
- Flush sends in FIFO order, one at a time: 2xx (and 204 on a duplicate) →
  remove; network error, 5xx or 429 → stop the flush, keep the item; 400/413/415
  → drop (can never succeed); 404 on feedback → keep and count tries, drop after
  5. Only one flush runs at a time.
- Opt-out switched off → clear the queue and send nothing, hide the feedback
  question.
- The record is built once, when the result view first shows a recording, from
  the grading shown then. Feedback sets `regraded: true` when `autoLatency`
  differs from the value in the sent record.

### Owner endpoints (increment 3)
- `GET /api/spike-nuty/stats?from=YYYY-MM-DD&to=YYYY-MM-DD` and
  `GET /api/spike-nuty/export?from=…&to=…&format=json|csv`; default range the
  last 30 days, range at most 366 days, filtered on `receivedAt`; at most
  10 000 documents read (`truncated: true` when hit).
- Header `X-Admin-Key` compared in constant time with the secret
  `SPIKE_NUTY_ADMIN_KEY`; missing or wrong → 401 `unauthorized`; an empty secret
  value → 503 `not_configured`. Device class for latency medians is derived from
  the stored user agent: `ios`, `android`, `desktop`, `other`.

## Phase 1: Attempt and feedback validation (A1)
### Overview
Pure parsing of both bodies per the record contract.

### Required changes
#### 1. Types
- **File**: `functions/src/spike-nuty/types.ts`
- **Goal**: Types for the attempt record, feedback, stored document and repository results.
- **Contract**: `AttemptRecord`, `AttemptFeedback`, `StoredAttempt` as in Critical Implementation Details.

#### 2. Validation
- **File**: `functions/src/spike-nuty/validation.ts`
- **Goal**: `parseAttempt(body)` and `parseFeedback(body)` return a whitelisted copy or `null`; reuse `parseDeviceId` from `functions/src/devices/validation.ts` for `deviceId` and attempt ids.
- **Contract**: limits exported as constants (`MAX_EVENTS = 200`, `MAX_NOTES = 400`, `MAX_ATTEMPT_BYTES = 65536`, `MAX_FEEDBACK_BYTES = 8192`, `MAX_COMMENT = 500`).

#### 3. Tests
- **File**: `functions/test/spike-nuty-validation.test.ts`
- **Goal**: valid record round-trips; unknown fields dropped; each limit (201 events, long UA, comment 501, bad enum, NaN, non-UUID) rejected; feedback with `agrees: true` and non-empty `misjudged` rejected.

### Success criteria
#### Automated
- `pnpm --dir functions test` passes including spike-nuty-validation tests
- `pnpm --dir functions typecheck` passes
#### Manual
- None

## Phase 2: Repository, rate limit, handler and routing (A1)
### Overview
Storage, per-device rate limit and the two PUT routes, wired into `api`.

### Required changes
#### 1. Repository
- **File**: `functions/src/spike-nuty/repository.ts`
- **Goal**: Firestore implementation over `spikeNutyAttempts` and `spikeNutyRateLimits`: `createIfAbsent(id, record, now)` → `'created' | 'exists'`; `saveFeedback(id, deviceId, feedback, now)` → `boolean` (false for unknown id or other device); `hitRateLimit(deviceId, now, limit, windowMs)` → `{ allowed, retryAfterSec }` in a transaction. Writes `receivedAt` and `expireAt` (+180 days).
- **Contract**: `SpikeNutyRepository` interface; `ATTEMPTS_COLLECTION = 'spikeNutyAttempts'`, `TTL_DAYS = 180`.

#### 2. Handler
- **File**: `functions/src/spike-nuty/handler.ts`
- **Goal**: `createSpikeNutyHandler({ repo, now, onError, rateLimit? })` handling the two PUT routes with the answers listed in Critical Implementation Details; size check before parse, rate limit before write; a duplicate attempt answers 204 and does not count against the limit twice.
- **Contract**: routes `^(?:/api)?/spike-nuty/attempts/{uuid}(/feedback)?/?$`.

#### 3. Dispatcher and wiring
- **File**: `functions/src/api-router.ts`, `functions/src/index.ts`
- **Goal**: `createApiHandler({ devices, spikeNuty })` sends paths under `/spike-nuty/` (with or without `/api`) to the spike handler, all else to the devices handler unchanged; `index.ts` builds both and passes the router to `onRequest`. Move the shared `HttpRequest`/`HttpResponse` types and the `bodySize`/`isJson`/`header` helpers to `functions/src/http.ts` and import them from both handlers.
- **Contract**: devices routes and answers unchanged (existing `functions/test/handler.test.ts` passes untouched).

#### 4. Fakes and tests
- **File**: `functions/test/spike-nuty-fakes.ts`, `functions/test/spike-nuty-handler.test.ts`, `functions/test/api-router.test.ts`
- **Goal**: in-memory repository; tests for 204 create, idempotent retry, 413/415/400/405, feedback 204 / 404 for unknown id and for other device, 429 after the limit with `Retry-After`, window reset; router sends each prefix to the right handler.

### Success criteria
#### Automated
- `pnpm --dir functions test` passes including spike-nuty-handler and api-router tests
- `pnpm --dir functions build` passes
- `pnpm --dir functions typecheck` passes
#### Manual
- None

## Phase 3: Emulator test, TTL policy and docs (A1)
### Overview
End-to-end proof on the emulators and the TTL declaration.

### Required changes
#### 1. Emulator test
- **File**: `functions/test-emulator/spike-nuty.emulator.test.ts`
- **Goal**: against the real function: create stores only whitelisted fields plus `receivedAt`/`expireAt` (≈180 days later); retry keeps the first document; feedback updates it; 201 events → 400; 61st write from one device in the hour → 429.

#### 2. TTL policy
- **File**: `firestore.indexes.json`, `functions/test/firebase-config.test.ts`
- **Goal**: `fieldOverrides` entries with `"ttl": true` for `spikeNutyAttempts.expireAt` and `spikeNutyRateLimits.expireAt` (deployed with `firebase deploy --only firestore:indexes`); config test asserts both entries.

#### 3. README
- **File**: `README.md`
- **Goal**: a "Spike telemetry" section: what is stored and what is not, the 180-day TTL, how the TTL policy deploys from the repo, and the console/`gcloud firestore fields ttls update expireAt --collection-group=spikeNutyAttempts --enable-ttl` fallback; note that the new routes go live only after the owner runs `firebase deploy --only functions,firestore` (CI does not deploy functions) and that PR previews call the live `api`.

### Success criteria
#### Automated
- `pnpm --dir functions test:emulators` passes including spike-nuty.emulator tests
- `pnpm --dir functions test` passes including the TTL fieldOverrides assertion
#### Manual
- After deploy, the Firestore console lists TTL policies on `expireAt` for both collections

## Phase 4: Record building (A2)
### Overview
Pure construction of the v1 record from the screen state.

### Required changes
#### 1. Event clarity and level
- **File**: `src/spike-nuty/logic/segment.ts`, `src/spike-nuty/logic/segment.test.ts`
- **Goal**: keep clarity on voiced frames and add `meanClarity` and `meanLevelDb` (rounded) to `NoteEvent`; existing segmentation results unchanged.
- **Contract**: two new numeric fields on `NoteEvent`.

#### 2. Note kind
- **File**: `src/spike-nuty/results.ts`, `src/spike-nuty/results.test.ts`
- **Goal**: expose the grading kind on `NoteRow` (`kind`) plus expected/played MIDI numbers, so the record does not parse Polish copy.

#### 3. Build id
- **File**: `vite.config.ts`, `src/vite-env.d.ts`
- **Goal**: `__APP_BUILD__` defined at build time as the short `GITHUB_SHA` or `'dev'`.

#### 4. Record builder
- **File**: `src/spike-nuty/telemetry/record.ts`, `src/spike-nuty/telemetry/record.test.ts`
- **Goal**: `buildAttemptRecord({ deviceId, now, settings, recording, graded, latencyMs, ended, env })` → v1 body per contract; `env` injects user agent, `userAgentData` (platform, mobile) and standalone detection (`display-mode: standalone` or `navigator.standalone`). Raw events are the recording's sounding events, capped at 200; notes capped at 400; `octaveOff`/`twelfthOff` derived from MIDI difference.
- **Contract**: output is accepted by the A1 contract (field names and limits identical); no name or profile field exists in the type.

### Success criteria
#### Automated
- `pnpm test` passes including telemetry/record, results and segment tests
- `pnpm typecheck` passes
#### Manual
- None

## Phase 5: Offline queue, transport and opt-out (A2)
### Overview
Bounded localStorage queue with retry, and the local switch.

### Required changes
#### 1. Transport
- **File**: `src/spike-nuty/telemetry/api.ts`
- **Goal**: `putAttempt(id, body)` and `putFeedback(id, body)` via `fetch` to `apiBase()` from `src/push/api.ts`; return the HTTP status, throw only on network error.

#### 2. Queue
- **File**: `src/spike-nuty/telemetry/queue.ts`, `src/spike-nuty/telemetry/queue.test.ts`
- **Goal**: `enqueue(item)`, `flush(send)` and `startAutoFlush()` (on `online`) per the send and retry rules; corrupt storage is reset; storage errors are swallowed (never break the screen).
- **Contract**: item `{ kind: 'attempt' | 'feedback', attemptId, body, tries }`.

#### 3. Opt-out setting
- **File**: `src/spike-nuty/telemetry/settings.ts`, `src/spike-nuty/telemetry/settings.test.ts`
- **Goal**: `isTelemetryEnabled()` / `setTelemetryEnabled(on)`; turning off clears the queue.

### Success criteria
#### Automated
- `pnpm test` passes including telemetry/queue and telemetry/settings tests (FIFO order, cap 20, drop on 400, keep on 5xx/429/network error, feedback 404 dropped after 5 tries, single concurrent flush)
- `pnpm lint` passes
#### Manual
- None

## Phase 6: Screen wiring, feedback UI and notice (A2)
### Overview
Send on finish, ask for feedback, show the notice and the switch.

### Required changes
#### 1. Screen
- **File**: `src/spike-nuty/SpikeScreen.tsx`
- **Goal**: `stop` records whether the timer (`complete`) or the Stop button (`stopped`) ended the attempt; when a recording is graded for the first time, generate the attempt id, build and enqueue the record (when enabled) without awaiting; flush on mount. Result view gets a feedback section "Czy ocena się zgadza?" with Tak / Nie; Nie shows a toggle "aplikacja się pomyliła" on each row of the note list and an optional comment (≤500) with a send button; each answer is enqueued as feedback. A notice and a switch "Wysyłaj anonimowe dane" sit on the screen (both views). The feedback section is hidden when sending is off.

#### 2. Copy
- **File**: `src/spike-nuty/copy.ts`, `src/spike-nuty/copy.test.ts`
- **Goal**: Polish texts: notice "Wysyłamy anonimowe dane o dokładności rozpoznawania (bez nagrania), żeby ulepszyć aplikację.", question, Tak/Nie, toggle label, comment label, send and thank-you texts, switch label.

#### 3. Tests and docs
- **File**: `src/spike-nuty/SpikeScreen.test.tsx`, `src/spike-nuty/README.md`
- **Goal**: screen tests with a mocked queue: one record enqueued per finished attempt with `ended`; none when the switch is off; Tak enqueues `agrees: true`; Nie + two row toggles + comment enqueue the matching `misjudged` list; the notice is visible. README describes what is sent and how to switch it off.

### Success criteria
#### Automated
- `pnpm test` passes including the SpikeScreen telemetry tests
- `pnpm lint && pnpm typecheck` pass
- `pnpm build` passes
- `pnpm test:e2e` passes (no backend in e2e; sending fails silently)
#### Manual
- On a phone (preview with `?spike=nuty`, after functions are deployed), a finished attempt appears in `spikeNutyAttempts` and a Nie with marked notes updates it
- Airplane mode: an attempt played offline is stored after the connection returns

## Phase 7: Aggregates and CSV (A3)
### Overview
Pure computation of the owner statistics and the CSV form.

### Required changes
#### 1. Aggregates
- **File**: `functions/src/spike-nuty/stats.ts`, `functions/test/spike-nuty-stats.test.ts`
- **Goal**: `computeStats(docs)` → `{ attempts, devices, ended: {complete, stopped}, scoreHistogram (0-9, 10-19, …, 90-100), feedback: { answered, agrees, agreesPercent }, topMisjudged: [{ expectedMidi, name, count }] (top 10, from feedback `misjudged` mapped to the attempt's notes), latencyByDeviceClass: { [class]: { attempts, medianOutputLatencyMs, medianOffsetMs } }, octaveErrorRate, twelfthErrorRate (flagged notes / notes with a played pitch), truncated }`; `deviceClass(userAgent)`.

#### 2. CSV
- **File**: `functions/src/spike-nuty/export.ts`, `functions/test/spike-nuty-export.test.ts`
- **Goal**: `toCsv(docs)`: one row per attempt with scalar columns (id, receivedAt, deviceId, build, deviceClass, standalone, settings, scores, counts, timing, ended, feedback agrees/comment) and `notes`, `events`, `misjudged` as JSON-string columns; RFC 4180 quoting; formula-leading cells (`= + - @`) prefixed with `'`.

### Success criteria
#### Automated
- `pnpm --dir functions test` passes including spike-nuty-stats and spike-nuty-export tests
#### Manual
- None

## Phase 8: Admin endpoints and secret (A3)
### Overview
Secret-protected read routes in `api`.

### Required changes
#### 1. Admin handler
- **File**: `functions/src/spike-nuty/admin-handler.ts`, `functions/src/spike-nuty/repository.ts`
- **Goal**: `createSpikeNutyAdminHandler({ repo, adminKey: () => string, now, onError })` for `GET /spike-nuty/stats` and `GET /spike-nuty/export` per Owner endpoints; repository gains `listAttempts(from, to, limit)` ordered by `receivedAt`; invalid dates or range → 400 `invalid_range`; CSV answered as `text/csv; charset=utf-8` with `Content-Disposition: attachment`.

#### 2. Wiring and secret
- **File**: `functions/src/api-router.ts`, `functions/src/index.ts`, `functions/.secret.local.example`, `functions/scripts/ensure-secret-local.mjs`
- **Goal**: router sends `/spike-nuty/stats` and `/spike-nuty/export` to the admin handler; `defineSecret('SPIKE_NUTY_ADMIN_KEY')` added to `api`'s `secrets`; the example gets a dummy key; the ensure script appends keys missing from an existing `.secret.local` without touching present ones.

#### 3. Tests
- **File**: `functions/test/spike-nuty-admin-handler.test.ts`, `functions/test/spike-nuty-fakes.ts`, `functions/test/api-router.test.ts`
- **Goal**: 401 without or with a wrong key, 503 with an empty secret, 200 stats shape, CSV content type, 400 for a bad range, 405 for non-GET; router routes admin paths.

### Success criteria
#### Automated
- `pnpm --dir functions test` passes including spike-nuty-admin-handler tests
- `pnpm --dir functions build && pnpm --dir functions typecheck` pass
#### Manual
- None

## Phase 9: Emulator test, script and owner docs (A3)
### Overview
Proof on the emulators and the owner's how-to.

### Required changes
#### 1. Emulator test
- **File**: `functions/test-emulator/spike-nuty-stats.emulator.test.ts`
- **Goal**: seed attempts and feedback through the public PUT routes, then stats with the dummy key from `.secret.local.example` return the expected counts; export JSON and CSV respect the date filter; wrong key → 401.

#### 2. Script
- **File**: `functions/scripts/spike-nuty-stats.mjs`
- **Goal**: `node functions/scripts/spike-nuty-stats.mjs stats|export [--from] [--to] [--format json|csv] [--base URL]` reading the key from env `SPIKE_NUTY_ADMIN_KEY`, writing to stdout; never prints the key.

#### 3. README
- **File**: `README.md`
- **Goal**: "Owner statistics" section with curl examples for both routes and the script; a clearly marked manual step: `npx firebase-tools functions:secrets:set SPIKE_NUTY_ADMIN_KEY` (random value, e.g. `openssl rand -hex 32`) **before** the next `firebase deploy --only functions`, otherwise the deploy fails because `api` now requires that secret; how to rotate it.

### Success criteria
#### Automated
- `pnpm --dir functions test:emulators` passes including spike-nuty-stats.emulator tests
- `node functions/scripts/spike-nuty-stats.mjs --help` exits 0
#### Manual
- After the owner sets the secret and deploys, `curl -H "X-Admin-Key: …" https://grajek.web.app/api/spike-nuty/stats` returns the aggregates

## Testing Strategy
- Functions unit (Vitest): validation, handler with in-memory fakes, router, rate limit window, aggregates, CSV, admin auth.
- Functions emulator (`pnpm --dir functions test:emulators`, CI job `functions`): ingest and stats end to end against Firestore.
- Client unit (Vitest + Testing Library): record builder, queue with a fake `fetch`/`localStorage`, settings, screen wiring.
- Existing suites, lint, typecheck, build and e2e stay green; e2e has no backend, so sending must fail silently.

## Performance Notes
Record ≈ 20-40 KiB at the 200-event cap; queue capped at 20 items keeps
localStorage under 1 MiB. Stats read at most 10 000 documents per call.

## Migration Notes
No migration: two new collections, created on first write, removed by TTL.
Rollback = redeploy the previous `api`; stored documents expire by themselves.

## References
- `change.md` (request text and Areas)
- `functions/src/index.ts`, `functions/src/devices/handler.ts`, `functions/src/devices/validation.ts`
- `src/spike-nuty/SpikeScreen.tsx`, `src/spike-nuty/results.ts`, `src/spike-nuty/logic/segment.ts`, `src/spike-nuty/logic/timing.ts`
- `src/push/device-id.ts`, `src/push/api.ts`
- `.github/workflows/ci.yml`, `firebase.json`, `README.md:126-183`
- `context/archive/2026-11-15-spike-zagraj-i-sprawdz/`, ADR 0001 (anonymous device registry)

## Progress

### Phase 1: Attempt and feedback validation (A1)
#### Automated
- [x] 1.1 `pnpm --dir functions test` passes including spike-nuty-validation tests — b31c23b
- [x] 1.2 `pnpm --dir functions typecheck` passes — b31c23b
#### Manual

### Phase 2: Repository, rate limit, handler and routing (A1)
#### Automated
- [x] 2.1 `pnpm --dir functions test` passes including spike-nuty-handler and api-router tests
- [x] 2.2 `pnpm --dir functions build` passes
- [x] 2.3 `pnpm --dir functions typecheck` passes
#### Manual

### Phase 3: Emulator test, TTL policy and docs (A1)
#### Automated
- [ ] 3.1 `pnpm --dir functions test:emulators` passes including spike-nuty.emulator tests
- [ ] 3.2 `pnpm --dir functions test` passes including the TTL fieldOverrides assertion
#### Manual
- [ ] 3.3 After deploy, the Firestore console lists TTL policies on `expireAt` for both collections

### Phase 4: Record building (A2)
#### Automated
- [ ] 4.1 `pnpm test` passes including telemetry/record, results and segment tests
- [ ] 4.2 `pnpm typecheck` passes
#### Manual

### Phase 5: Offline queue, transport and opt-out (A2)
#### Automated
- [ ] 5.1 `pnpm test` passes including telemetry/queue and telemetry/settings tests (FIFO order, cap 20, drop on 400, keep on 5xx/429/network error, feedback 404 dropped after 5 tries, single concurrent flush)
- [ ] 5.2 `pnpm lint` passes
#### Manual

### Phase 6: Screen wiring, feedback UI and notice (A2)
#### Automated
- [ ] 6.1 `pnpm test` passes including the SpikeScreen telemetry tests
- [ ] 6.2 `pnpm lint && pnpm typecheck` pass
- [ ] 6.3 `pnpm build` passes
- [ ] 6.4 `pnpm test:e2e` passes (no backend in e2e; sending fails silently)
#### Manual
- [ ] 6.5 On a phone (preview with `?spike=nuty`, after functions are deployed), a finished attempt appears in `spikeNutyAttempts` and a Nie with marked notes updates it
- [ ] 6.6 Airplane mode: an attempt played offline is stored after the connection returns

### Phase 7: Aggregates and CSV (A3)
#### Automated
- [ ] 7.1 `pnpm --dir functions test` passes including spike-nuty-stats and spike-nuty-export tests
#### Manual

### Phase 8: Admin endpoints and secret (A3)
#### Automated
- [ ] 8.1 `pnpm --dir functions test` passes including spike-nuty-admin-handler tests
- [ ] 8.2 `pnpm --dir functions build && pnpm --dir functions typecheck` pass
#### Manual

### Phase 9: Emulator test, script and owner docs (A3)
#### Automated
- [ ] 9.1 `pnpm --dir functions test:emulators` passes including spike-nuty-stats.emulator tests
- [ ] 9.2 `node functions/scripts/spike-nuty-stats.mjs --help` exits 0
#### Manual
- [ ] 9.3 After the owner sets the secret and deploys, `curl -H "X-Admin-Key: …" https://grajek.web.app/api/spike-nuty/stats` returns the aggregates
