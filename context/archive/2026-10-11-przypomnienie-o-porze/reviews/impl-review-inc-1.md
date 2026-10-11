<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: One gentle daily reminder at the practice time

**Plan**: context/changes/przypomnienie-o-porze/plan.md   **Scope**: increment 1 (phases 1-4, full plan)   **Date**: 2026-10-11
**Round**: 1   **Verdict**: APPROVED   **Findings**: 7

Diff base: `feat/karta-postepu/1...HEAD` (stacked branch). Code: 29 files, ~2000 lines. Two read-only evidence passes (plan drift; safety/patterns), plus direct reading of `schedule.ts`, `reminders/repository.ts`, `tick.ts`, `sync.ts`, `reminder.ts`.

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Success criteria
| Row | Command | Result |
|---|---|---|
| 1.1 / 2.1 | `pnpm --dir functions typecheck` | PASS (exit 0) |
| 1.2 | `pnpm --dir functions build` | PASS (exit 0) |
| 1.3 / 2.2 | `pnpm --dir functions test` | PASS: 6 files, 106 tests |
| 2.3 | `pnpm --dir functions test:emulators` | SKIPPED: no JDK on this machine. It runs only in the CI `functions` job, so it is manual-pending. It is not a build, typecheck or lint check, so it does not cap the verdict |
| 3.1 / 4.1 | `pnpm typecheck` | PASS (exit 0) |
| 3.2 / 4.2 | `pnpm lint` | PASS (exit 0) |
| 3.3 / 4.3 | `pnpm test` (one run, JSON reporter) | PASS: 82 suites, 261/261 tests |
| 4.4 | `pnpm build` | PASS (exit 0) |
| 4.5 | `pnpm test:e2e` (temporary unstaged config on port 4391, removed after) | PASS: 11/11 |
| 4.6 | Manual: real delivery on Android/iOS after deploy | pending: needs a deployed backend and Cloud Scheduler |
| 4.7 | Manual: tone of the reminder text and panel copy | pending. Diff evidence: `functions/src/reminders/messages.ts`, `src/reminder/copy.ts` |

Architecture gate: not applicable, because there is no `context/architecture/model.c4`. Not bug mode.

Status note: `change.md` stays `implementing`. Row 2.3 is unchecked, and it can only be checked after CI, so the `implemented -> impl_reviewed` transition does not apply. rs-archive will record this as an archive-warning.

## Findings

### F1: The time zone leaves the device, beyond ADR 0001's literal list
- **Severity**: OBSERVATION
- **Impact**: MEDIUM
- **Dimension**: Safety & Quality
- **Location**: src/reminder/sync.ts:51, src/reminder/api.ts, functions/src/reminders/validation.ts:7, functions/src/devices/types.ts (stored `reminder.timezone`)
- **Detail**: ADR 0001 says the server knows only the anonymous device id, the reminder time, and whether there was a record that day. The client also sends the IANA zone (e.g. `Europe/Warsaw`), and the server stores it. `practicedOn` and `lastReminderDay` are dates, not a bare flag.
  Assessment: this fits the ADR's intent.
  - A wall-clock reminder time means nothing without its zone, because of DST.
  - The zone is coarse: country or region level, shared by millions of people.
  - The zone carries no name, place or practice detail. It is overwritten, not kept as history, and "Wyłącz" erases it (DELETE removes the doc).
  - `practicedOn` is a single overwritten date, equivalent to "was there a record that day".
  - No log line carries the zone, the times or the full endpoint (`toLoggableError`; the tick logs counts only).
  
  It still extends the ADR's literal list, and the RODO review for under-16 data is still open. So the client should confirm it, and the ADR should gain one sentence that names the zone.
- **Fix**: none in code. The client confirms, and ADR 0001 gains "and the device's time zone" at archive or the next docs pass.
- **Decision**: ACCEPT. It matches the plan-brief Key decision "Time zone leaves the device" (Source: Consult). Raised as `decision-to-verify` so the client sees it on the PR.

### F2: A gone subscription deletes the doc unconditionally
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: functions/src/reminders/tick.ts:43-45
- **Detail**: If the device re-registers between the send and the delete, the fresh registration is deleted. The window is milliseconds long. The test endpoint already uses the same pattern (the `handler.ts` gone branch), and the plan chose it ("Gone subscription: delete the device doc", Auto).
- **Fix**: later, delete conditionally on the sent endpoint, in both paths.
- **Decision**: ACCEPT. Deliberate; matches the brief row "Gone subscription".

### F3: The scheduler uses the default function timeout
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: functions/src/index.ts:67-75
- **Detail**: `timeoutSeconds` is not set. With slow push services, 200 sequential claim+send pairs could exceed the default. Each device is claimed and sent one at a time, so a timeout loses at most the one reminder in flight. The rest stay due, and the next tick picks them up within the 30-minute stale window. The device count is small (plan Performance Notes).
- **Fix**: set `timeoutSeconds` (e.g. 240) if the device count grows.
- **Decision**: ACCEPT. The impact is bounded at the current scale.

### F4: A 404 from the reminder endpoint stays pending
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: src/reminder/sync.ts:84-87
- **Detail**: When the server has lost the device, sync keeps returning `pending` until the panel re-registers. This is the plan's contract: "a 404 means the server lost the device and is left to the panel's existing flow".
- **Fix**: none.
- **Decision**: ACCEPT. Planned behaviour.

### F5: The acknowledged-payload record carries the registration identity
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: src/reminder/reminderStore.ts:18-23, src/reminder/sync.ts:76-82
- **Detail**: The plan says `saveAckedPayload(payload)`. The implementation stores `{ deviceId, registeredAt, payload }`, so an ack from an earlier registration forces a resend. This is benign and stricter than planned. The ack is read with an unvalidated cast. A malformed value would only keep sync pending (the error is caught), and only this module writes the value.
- **Fix**: none.
- **Decision**: ACCEPT. An improvement within the module's contract.

### F6: Weekday chips are narrower than 44 px on small phones
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Pattern Consistency
- **Location**: src/reminder/ReminderDays.tsx:101 (`grid-cols-7 gap-1`), :23 (`min-h-14`)
- **Detail**: Seven columns on a ~360 px screen make each chip about 40 px wide (56 px tall). Covered by the preview check.
- **Fix**: if testers find the chips hard to hit, wrap them into two rows.
- **Decision**: ACCEPT. The height is usable; verify on the preview.

### F7: `src/App.test.tsx` is planned but not in the diff
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: plan.md Phase 4 §4
- **Detail**: The plan only requires the existing App tests to stay green, and they do (261/261).
- **Fix**: none.
- **Decision**: DISMISS. No change was required.

## Verified behaviour (no finding)
- DST math (`schedule.ts:80-90`): in the Warsaw gap, 02:30 maps to 01:30Z (03:30 CEST). In the overlap, 02:30 maps to the earlier instant, 00:30Z. Both are pinned in `schedule.test.ts`. Formatters are cached per zone, and the zone is at most 64 chars.
- At-most-once delivery:
  - The claim runs in a Firestore transaction. It advances `nextReminderAt` and sets `lastReminderDay` before the send (`reminders/repository.ts:88-115`).
  - Changing the time after a send cannot produce a second reminder that day.
  - A slot more than 30 minutes stale is skipped and advanced.
  - The single-field range+orderBy query needs no composite index.
- Endpoint guards mirror registration (size, JSON, id), and the endpoint returns 404 when there is no doc. Strict parsing drops unknown fields and rejects 2026-02-30. Existing routes are unchanged.
- Client: no place leaves the device (`reminder.ts:49`). Coalescing never loses a change made mid-request. The wrappers keep results and errors. Nothing under `src/storage/` or `src/practice/` was edited.
