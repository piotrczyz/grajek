# One gentle daily reminder at the practice time — Implementation Plan

## Overview
Delivers roadmap slice S-08 (FR-004, NFR Powiadomienia, ADR 0001): a device that turned notifications on gets at most one gentle Web Push per day at the student's Pora ćwiczeń, only on a reminder day and only when no practice was logged that day. The phone syncs the reminder times, its time zone and a "practiced today" date to the server (resending whenever the network returns); a scheduled Cloud Function sends the reminders. The student can limit reminders to chosen weekdays; turning them off is the existing "Wyłącz" in the Powiadomienia panel. No IndexedDB migration: the client state lives under new keys of the existing `device` store.

## Current State Analysis
- Server: one HTTPS function `api` (`functions/src/index.ts:51`), routes `PUT|DELETE /devices/{id}` and `POST /devices/{id}/test` via one regex (`functions/src/devices/handler.ts:41`), 4 KB body cap and JSON check (`handler.ts:34,62-70`). Firestore doc `devices/{id}` holds `subscription`, `createdAt`, `updatedAt`, `lastTestAt` (`functions/src/devices/types.ts:21-26`); its comment says "No other field is ever written" and must be updated.
- Re-registration keeps unknown fields: `upsert` does `tx.update(ref, { subscription, updatedAt })` on an existing doc (`functions/src/devices/repository.ts:30`); DELETE removes the whole doc (`handler.ts:88-91`), so turning notifications off already erases every reminder field.
- Sender abstraction with a recording log sender for the emulator (`functions/src/devices/push-sender.ts:56-69`, `shouldUseLogSender` at :72) and a redacting error logger (`push-sender.ts:99`). `gone` (404/410) handling pattern at `handler.ts:109-112`.
- Unit tests use an in-memory fake Firestore (`functions/test/fakes.ts:12`) that has no query support; emulator tests hit the real `api` through the Functions emulator and read Firestore via REST with the owner token (`functions/test-emulator/devices.emulator.test.ts:31-44`). `pnpm test:emulators` needs a JDK; CI's `functions` job installs JDK 21 (`.github/workflows/ci.yml`, functions job). This machine has no Java, so emulator tests cannot run locally.
- `firestore.indexes.json` is empty; a single-field range+orderBy query needs no composite index.
- Client: `src/push/api.ts` exposes `apiBase()` (`api.ts:13`); `src/push/device-id.ts` keeps `{ deviceId, registered, endpoint, updatedAt }` under key `registration` in the `device` store (`device-id.ts:8-16`), which has out-of-line keys (`src/storage/migrations.ts:45-48`), so more keys fit without a migration.
- Pora ćwiczeń: `{ default, overrides: Partial<Record<Weekday, Slot>> }`, ISO weekday 1=Mon..7=Sun, `slotFor` (`src/practice-time/practiceTime.ts:9,18-22,80-82`); store `load()` returns `null` when none is set (`practiceTimeStore.ts:16-17`). `PracticeTimeCard` accepts an injected `store` (`PracticeTimeCard.tsx:36,51`) but `App` renders it without props (`src/App.tsx:68`).
- Practices: `PracticeStore.add` / `listWeek` (`src/practice/practiceStore.ts:33-40`); `day` is the local `YYYY-MM-DD` (`practiceStore.ts:16`, `dayKey` in `src/practice/week.ts:13`). `App` accepts an injected `practiceStore` (`App.tsx:20-26`); `main.tsx` renders `<App />` without props (`src/main.tsx:23-26`).
- `NotificationsPanel` shows Test + Wyłącz when `registered === true` (`src/push/NotificationsPanel.tsx:113-131`); it is the only notifications UI.
- PRD: "plan days" is not a stored concept anywhere; S-07 deliberately left it to S-08 (`context/archive/2026-10-11-pora-cwiczen/plan.md:30`).

## Desired End State
- With notifications on, Pora 17:00 and no practice logged today, one notification arrives around 17:00 (within one scheduler tick, 5 min) with an encouraging text and no personal data; with a practice logged before 17:00 (and synced), none arrives.
- Never more than one reminder per device per local day, even if the time is changed after a reminder was sent.
- In the Powiadomienia panel the student chooses "Codziennie" or "W wybrane dni" with seven weekday chips; on unchosen days nothing is sent.
- Offline changes (a practice logged in airplane mode, a new Pora, a settings change) reach the server automatically the next time the app is open with network.
- The server stores only: subscription, time zone, per-weekday reminder times, today's practiced date, scheduling fields. Never the place, the name, or practice details.

### Key discoveries
- Reminder fields survive re-registration and vanish on DELETE without touching either path (`repository.ts:30`, `handler.ts:88-91`).
- The `device` store already exists with out-of-line keys (`migrations.ts:45-48`): no schema change needed.
- `App` and `PracticeTimeCard` both accept injected stores (`App.tsx:20-26`, `PracticeTimeCard.tsx:36`), so sync hooks can wrap stores instead of editing `src/practice/` (S-09 territory).

## What we're NOT doing
- No IndexedDB migration, no edit of `src/storage/` or `src/practice/`.
- No deploy, no Cloud Scheduler / Blaze setup, no cloud config change (manual steps for the user, noted in the PR).
- No separate "reminders off but registration kept" switch: turning reminders off is the existing "Wyłącz" (deletes the registration).
- No Background Sync API (not on iOS); a change made offline is sent the next time the app is open online.
- No quiet hours, snooze, multiple reminders, or reminder text personalised with place or name (ADR 0001).
- No weekly-goal-aware "plan days" (S-03 runs in parallel); plan days = weekdays chosen in the reminder setting.
- No change to the test notification, the registration endpoints or their responses.

## Implementation Approach
Server-computed schedule (Consult, option A). The client sends a full-state, idempotent `PUT /api/devices/{id}/reminder` with `{ timezone, times, practicedOn }`. The server validates it, stores it on the existing device doc and computes `nextReminderAt` (UTC instant of the next local reminder time in that zone). A scheduled function every 5 minutes queries `nextReminderAt <= now` (bounded batch), and for each device claims the day in a transaction (sets `lastReminderDay`, advances `nextReminderAt`) and decides send vs skip; it sends only after a successful claim, outside the transaction, so delivery is at most once per day even under retries or overlapping ticks. Alternatives rejected: client-side UTC conversion without a time zone (breaks across DST until the app is reopened, no real privacy gain), and scanning every device each tick (O(N) reads, still needs the same claim).

The client keeps the reminder setting and the last payload the server acknowledged in the `device` store and resends whenever the current payload differs from the acknowledged one: on app start, on the `online` event, after a practice save, after a Pora save, after a settings change and when the panel shows a registered device (covers "just enabled"). Sync hooks wrap the injected stores in `main.tsx` / `App.tsx` instead of editing the practice modules. All client reminder code lives in a new `src/reminder/` module.

Time-zone math uses `Intl.DateTimeFormat` only (no new dependency), with pinned DST tests for Europe/Warsaw.

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Daily reminder: server schedule, client sync and setting | 1-4 | — | yes | in-progress | — |

## Critical Implementation Details

### Contract: `PUT /api/devices/{id}/reminder`
- Request (`Content-Type: application/json`, ≤ 4096 bytes): `{ "timezone": "<IANA zone>", "times": { "<1..7>": "HH:MM", ... }, "practicedOn": "YYYY-MM-DD" | null }`.
  - `timezone`: string ≤ 64 chars accepted by `Intl.DateTimeFormat(undefined, { timeZone })`; otherwise 400 `invalid_reminder`.
  - `times`: object, keys only `"1"`..`"7"` (ISO weekday, 1 = Monday), values `^([01]\d|2[0-3]):[0-5]\d$`; any other key or value → 400. Empty object = no reminders.
  - `practicedOn`: `null` or a valid `YYYY-MM-DD`. The client sends today's local date only when a practice exists today.
  - Unknown top-level fields are dropped, never stored.
- Responses: 204 stored; 400 `invalid_reminder` / `invalid_device_id`; 404 `unknown_device` (no doc is created without a subscription); 405 with `Allow: PUT`; 413; 415; 500.
- Stored on `devices/{id}` (overwrite, never append): `reminder: { timezone, times }`, `practicedOn` (string or null), `nextReminderAt` (Timestamp, or field removed when `times` is empty), `reminderUpdatedAt`. `lastReminderDay` is written only by the scheduler.

### Scheduler invariants
- `onSchedule` every 5 minutes, region `europe-central2`, time zone `Etc/UTC`, `maxInstances: 1`, `retryCount: 0`, secret `VAPID_PRIVATE_KEY`, same sender selection as `api`.
- Per tick: query `nextReminderAt <= now` ordered by `nextReminderAt`, limit 200.
- Per device, in a transaction: re-read the doc; let `slot = nextReminderAt`, `day` = local date of `slot` in the device zone. Always set `nextReminderAt` = next reminder strictly after `max(now, slot)` (or remove when none). Send only when `practicedOn !== day`, `lastReminderDay !== day`, and `now - slot <= 30 min`; in that case also set `lastReminderDay = day`. The send happens after the transaction commits.
- Send result `gone` → delete the doc. A send error → log via `toLoggableError` (never the endpoint, zone or times) and continue with the next device; that day's reminder is not retried.
- Payload `{ title: 'Grajek', body: <one of a few fixed encouraging Polish lines, picked deterministically by day>, tag: 'grajek-reminder' }`; no "missed", no streak, no pressure wording.

### Local-time math
- `nextReminderAt(times, timezone, after)`: walk local dates from the local date of `after` for 8 days; for each date whose ISO weekday has a time, convert the local wall time in that zone to a UTC instant; return the first instant strictly after `after`, else `null`.
- A wall time that does not exist (spring-forward gap) maps to the instant one hour later (02:30 → 03:30 on the Warsaw change day); an ambiguous wall time (autumn) maps to the earlier instant.

## Phase 1: Server — reminder contract and schedule math
### Overview
Accept and store the reminder state and compute the next reminder instant; no sending yet.

### Required changes
#### 1. Local-time math
- **File**: `functions/src/reminders/schedule.ts` (new)
- **Goal**: zone-aware, dependency-free helpers the endpoint and the scheduler share.
- **Contract**: `localDay(at: Date, timezone: string): string` (`YYYY-MM-DD`), `isoWeekday(day: string): 1..7`, `nextReminderAt(times: ReminderTimes, timezone: string, after: Date): Date | null` with the gap/overlap rules above; `isValidTimeZone(tz: string): boolean`.

#### 2. Types and validation
- **File**: `functions/src/devices/types.ts`, `functions/src/reminders/validation.ts` (new)
- **Goal**: describe the new stored fields; strict parsing that drops everything else.
- **Contract**: `ReminderTimes = Partial<Record<'1'|…|'7', string>>`, `ReminderState { timezone; times; practicedOn: string | null }`; `DeviceRecord` gains optional `reminder`, `practicedOn`, `nextReminderAt`, `lastReminderDay`; the type comment lists exactly the allowed fields. `parseReminder(body: unknown): ReminderState | null`.

#### 3. Repository
- **File**: `functions/src/devices/repository.ts`
- **Goal**: store the reminder state on an existing doc only.
- **Contract**: `saveReminder(id, state: ReminderState, nextAt: Date | null, now: Date): Promise<boolean>` — transaction; `false` when the doc does not exist; removes `nextReminderAt` when `nextAt` is null. `upsert`, `get`, `delete`, `markTested` unchanged in behaviour.

#### 4. Route
- **File**: `functions/src/devices/handler.ts`
- **Goal**: add `PUT /devices/{id}/reminder` with the same guards as registration (body size, JSON, id validation) and the responses in the contract.
- **Contract**: route regex gains a `/reminder` branch; `Allow: PUT` on other methods; existing routes answer exactly as before.

#### 5. Tests
- **File**: `functions/test/schedule.test.ts` (new), `functions/test/reminder-handler.test.ts` (new), `functions/test/fakes.ts`
- **Goal**: cover the math (weekday selection, today-later vs tomorrow, empty times, Warsaw 2026-03-29 gap and 2026-10-25 overlap with pinned instants, a non-Warsaw zone such as `America/New_York`) and the endpoint (204 + stored fields only, unknown fields dropped, 400 for bad zone / key / time / date, 404 unknown device, 405/413/415, re-registration keeps reminder fields). Extend the fake repository as needed.

### Success criteria
#### Automated
- `pnpm --dir functions typecheck` passes
- `pnpm --dir functions build` passes
- `pnpm --dir functions test` passes, including the new schedule and reminder-endpoint tests
#### Manual
- None

## Phase 2: Server — scheduled reminder sender
### Overview
Send the due reminders every 5 minutes, at most once per device per day.

### Required changes
#### 1. Reminder tick
- **File**: `functions/src/reminders/tick.ts` (new), `functions/src/reminders/messages.ts` (new)
- **Goal**: one testable function that runs one scheduler pass per the invariants above; the fixed encouraging messages.
- **Contract**: `runReminderTick(deps: { repo: ReminderRepository; sender: PushSender; now: () => Date; onError?: (e: unknown) => void; batchSize?: number; staleMs?: number }): Promise<{ sent: number; skipped: number; removed: number }>`; `reminderPayload(day: string): PushPayload` (tag `grajek-reminder`).

#### 2. Repository for due devices
- **File**: `functions/src/reminders/repository.ts` (new)
- **Goal**: Firestore query of due devices and the transactional claim, kept out of the HTTP repository.
- **Contract**: `dueDeviceIds(now, limit): Promise<string[]>`; `claim(id, now, staleMs): Promise<{ send: false } | { send: true; subscription; day }>` (transaction, computes the next instant with `nextReminderAt`); `delete(id)`.

#### 3. Function export
- **File**: `functions/src/index.ts`
- **Goal**: export `reminders = onSchedule({...})` per the invariants, sharing the sender and secret with `api`; header comment updated.
- **Contract**: exported names `api` (unchanged) and `reminders`.

#### 4. Tests
- **File**: `functions/test/tick.test.ts` (new), `functions/test-emulator/reminders.emulator.test.ts` (new)
- **Goal**: unit tests with an in-memory reminder repository (send when due; skip when practiced today; skip when already reminded today, including after a time change; skip and advance when stale; `gone` deletes; a send error does not stop the batch and is not retried; batch limit). Emulator tests: through the real `api`, register a device and PUT a reminder, check the stored fields over REST; then call `runReminderTick` from the test process against the Firestore emulator with a recording sender and a fixed `now` to prove one send, no second send in the same day, and no send when `practicedOn` is today.

### Success criteria
#### Automated
- `pnpm --dir functions typecheck` passes
- `pnpm --dir functions test` passes, including the tick tests
- `pnpm --dir functions test:emulators` passes in the CI `functions` job (needs JDK 21; cannot run on this machine, which has no Java)
#### Manual
- None

## Phase 3: Client — reminder setting and offline-safe sync
### Overview
Keep the reminder setting on the phone, build the payload and send it whenever it changed.

### Required changes
#### 1. Setting and payload
- **File**: `src/reminder/reminder.ts` (new)
- **Goal**: pure model of the setting and the payload.
- **Contract**: `ReminderDays = { mode: 'all' } | { mode: 'chosen'; weekdays: Weekday[] }` (default `all`); `buildReminderPayload(practiceTime: PracticeTime | null, days: ReminderDays, practicedToday: boolean, now: Date, timezone: string): ReminderPayload` — `times` has one entry per reminder weekday using `slotFor` for that weekday (place is never included), empty when no Pora is saved; `practicedOn` = local `YYYY-MM-DD` of `now` when `practicedToday`, else `null`; `samePayload(a, b)`.

#### 2. Storage under the `device` store
- **File**: `src/reminder/reminderStore.ts` (new)
- **Goal**: persist the setting (key `reminderDays`) and the last acknowledged payload (key `reminderSync`) in the existing `device` store; no migration.
- **Contract**: `loadReminderDays()`, `saveReminderDays(days)`, `loadAckedPayload()`, `saveAckedPayload(payload)`.

#### 3. API and sync
- **File**: `src/reminder/api.ts` (new), `src/reminder/sync.ts` (new), `src/reminder/index.ts` (new)
- **Goal**: `putReminder(deviceId, payload)` on `apiBase()`; `syncReminder()` reads registration, Pora, today's practices (`listWeek` filtered to today), setting and the device zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), and sends only when registered and the payload differs from the acknowledged one; on 204 saves it as acknowledged; on any failure leaves it pending; a 404 means the server lost the device and is left to the panel's existing flow. Concurrent calls coalesce into one request. `startReminderSync()` runs one sync and re-runs on `window` `online`. `withReminderSync(store)` helpers wrap `PracticeStore.add` and `PracticeTimeStore.save` to trigger `syncReminder()` after success without changing their results or errors.
- **Contract**: `syncReminder(): Promise<'sent' | 'unchanged' | 'not-registered' | 'pending'>`; never throws.

#### 4. Tests
- **File**: `src/reminder/reminder.test.ts`, `src/reminder/reminderStore.test.ts`, `src/reminder/sync.test.ts` (new)
- **Goal**: payload per weekday with overrides, chosen days, no Pora, practiced today; storage round-trip in fake IndexedDB; sync sends once, skips when unchanged, retries after a failure on `online`, does nothing when not registered, the wrappers trigger a sync and keep store errors.

### Success criteria
#### Automated
- `pnpm typecheck` passes
- `pnpm lint` passes
- `pnpm test` passes, including the new reminder tests
#### Manual
- None

## Phase 4: Client — panel setting and app wiring
### Overview
Let the student limit reminders to chosen days, and connect the sync triggers.

### Required changes
#### 1. Reminder days control
- **File**: `src/reminder/ReminderDays.tsx` (new), `src/reminder/copy.ts` (new)
- **Goal**: under the Powiadomienia panel's registered state, a choice "Codziennie" / "W wybrane dni"; for chosen days seven large toggle chips (Pn..Nd, full names as accessible labels, initially all on when switching). Saving triggers `syncReminder()`. When no Pora is saved, one short line points to setting it. Encouraging, few words, large touch targets (NFR Czytelność).
- **Contract**: `<ReminderDays />` with optional injected loaders for tests; calls `syncReminder()` on mount (covers a just-enabled device).

#### 2. Panel
- **File**: `src/push/NotificationsPanel.tsx`
- **Goal**: render `<ReminderDays />` when `registered === true`; nothing else changes.

#### 3. Wiring
- **File**: `src/main.tsx`, `src/App.tsx`
- **Goal**: `main.tsx` calls `startReminderSync()` fire-and-forget and passes `practiceStore={withReminderSync(createIndexedDbPracticeStore())}` to `App`; `App.tsx` passes a wrapped practice-time store to `PracticeTimeCard`. Keep both edits to a few lines (S-03 and S-09 also touch these files).

#### 4. Tests
- **File**: `src/reminder/ReminderDays.test.tsx` (new), `src/push/NotificationsPanel.test.tsx`, `src/App.test.tsx`
- **Goal**: the control saves the setting and triggers a sync; the panel shows it only when registered; existing App and panel tests stay green.

### Success criteria
#### Automated
- `pnpm typecheck` passes
- `pnpm lint` passes
- `pnpm test` passes
- `pnpm build` passes
- `pnpm test:e2e` passes
#### Manual
- On an installed PWA (Android and iOS 16.4+) against a deployed backend: with Pora set a few minutes ahead and no practice today, one reminder arrives near that time; after logging a practice, no reminder arrives that day
- The reminder text and the panel copy read as encouraging to a 7–13 year old

## Testing Strategy
- Functions unit tests (Vitest, in-memory fakes): schedule math with pinned DST instants, endpoint validation and storage, tick decisions.
- Functions emulator tests (Functions + Firestore, `demo-grajek`): endpoint end to end and the tick against real Firestore queries and transactions. Run in CI only (JDK 21); locally they are skipped because this machine has no Java.
- App unit/component tests (Vitest + fake IndexedDB + Testing Library): payload, storage, sync retry, the days control.
- Real delivery on phones is Manual (needs a deployed backend with Cloud Scheduler).

## Performance Notes
- One indexed range query per tick, batch ≤ 200; one transaction per due device. Device count is small; 5-minute cadence keeps delivery inside the "kilkanaście minut" tolerance.

## Migration Notes
- No IndexedDB migration (new keys in the existing `device` store). Firestore changes are additive fields on `devices/{id}`; rollback = redeploy the previous functions (old code ignores the new fields) and remove the `reminders` function.

## References
- Roadmap slice S-08: `context/foundation/roadmap.md`
- PRD FR-004, NFR Prywatność, NFR Powiadomienia: `context/prd/prd.md:74-76,106-108,118`
- ADR 0001: `context/discovery/decisions/0001-serwer-powiadomien-z-minimalnymi-danymi.md`
- F-02 plan: `context/archive/2026-10-11-anonimowa-rejestracja-urzadzenia/plan.md`
- S-07 plan: `context/archive/2026-10-11-pora-cwiczen/plan.md`
- Key files: `functions/src/devices/handler.ts`, `functions/src/devices/repository.ts`, `functions/src/index.ts`, `src/push/push.ts`, `src/practice-time/practiceTime.ts`, `src/practice/practiceStore.ts`

## Progress

### Phase 1: Server — reminder contract and schedule math
#### Automated
- [x] 1.1 `pnpm --dir functions typecheck` passes — cf33426
- [x] 1.2 `pnpm --dir functions build` passes — cf33426
- [x] 1.3 `pnpm --dir functions test` passes, including the new schedule and reminder-endpoint tests — cf33426
#### Manual

### Phase 2: Server — scheduled reminder sender
#### Automated
- [x] 2.1 `pnpm --dir functions typecheck` passes
- [x] 2.2 `pnpm --dir functions test` passes, including the tick tests
- [ ] 2.3 `pnpm --dir functions test:emulators` passes in the CI `functions` job (needs JDK 21; cannot run on this machine, which has no Java)
#### Manual

### Phase 3: Client — reminder setting and offline-safe sync
#### Automated
- [ ] 3.1 `pnpm typecheck` passes
- [ ] 3.2 `pnpm lint` passes
- [ ] 3.3 `pnpm test` passes, including the new reminder tests
#### Manual

### Phase 4: Client — panel setting and app wiring
#### Automated
- [ ] 4.1 `pnpm typecheck` passes
- [ ] 4.2 `pnpm lint` passes
- [ ] 4.3 `pnpm test` passes
- [ ] 4.4 `pnpm build` passes
- [ ] 4.5 `pnpm test:e2e` passes
#### Manual
- [ ] 4.6 On an installed PWA (Android and iOS 16.4+) against a deployed backend: with Pora set a few minutes ahead and no practice today, one reminder arrives near that time; after logging a practice, no reminder arrives that day
- [ ] 4.7 The reminder text and the panel copy read as encouraging to a 7–13 year old
