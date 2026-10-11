# One gentle daily reminder at the practice time — Plan Brief
Full plan: `context/changes/przypomnienie-o-porze/plan.md` · request text: `change.md` · roadmap slice S-08 in `context/foundation/roadmap.md`

## What & why
FR-004: a student with notifications on gets at most one encouraging push per day at their Pora ćwiczeń, only on a reminder day and only when nothing was logged that day; they can limit reminders to chosen weekdays and turn them off. It completes stream C (F-02 → S-07 → S-08).

## Starting point
F-02 gave anonymous Web Push registration (`api` function, Firestore `devices/{id}`, `device` IndexedDB store, Powiadomienia panel). S-07 gave the Pora (default slot + weekday overrides). S-02 gave practice records with a local `day`. Nothing schedules or sends reminders yet, and "plan days" exist nowhere in code.

## Desired end state
Pora 17:00 + no practice today → one notification around 17:00 with the app closed; a practice logged (and synced) earlier → none. Never two in a day. Panel offers "Codziennie" / "W wybrane dni" with weekday chips. Offline changes are sent when the app is next open online.

## Complexity
MEDIUM — new server endpoint, a scheduled function with an at-most-once claim and zone-aware time math, plus client sync with offline retry and a small UI control. Patterns exist for every part (handler, repository, sender, fakes, stores); the risky bits are DST math and the once-per-day guarantee, both unit-tested.

Skipped: rs-research (the code is small and was read directly; every reference is in the plan) and rs-frame (the request states an outcome with a clear scope, not a cause). Jev not asked: no Python on this machine (unavailable).

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Areas | One area A1 "Przypomnienie o porze" (sync + scheduler + setting) | Client and server share one new contract; neither is useful alone | Orchestrator |
| Increments | One increment, 4 phases | Area gives one branch; 4 phases fit rs-core §8 | Auto |
| Server contract | Additive `PUT /api/devices/{id}/reminder`, full-state `{timezone, times, practicedOn}`; 404 when no device | Idempotent, offline-retry friendly; no doc without a subscription | Consult |
| Time zone leaves the device | Yes, IANA zone with the times; place never | A local time is meaningless without its zone; requester asked for device time zone; ADR 0001 allows the reminder time | Consult |
| Scheduling | Server computes `nextReminderAt`; `onSchedule` every 5 min queries due devices (limit 200) | One indexed query per tick; 5 min is inside the "kilkanaście minut" tolerance (NFR Powiadomienia) | Consult |
| Once-per-day guarantee | Transactional claim (`lastReminderDay`, advance) before sending; send outside the transaction; no retry | FR-004 "najwyżej jedno" is a ceiling: at-most-once is the right failure mode | Consult |
| Stale slots | Skip and advance when > 30 min late | No burst of off-time reminders after an outage | Consult |
| Gone subscription | Delete the device doc | Same as the test endpoint (`handler.ts:109-112`) | Auto |
| Practiced flag | `practicedOn` = today's local date or null, overwritten, no history | ADR 0001: only "whether there was a record that day" | Auto |
| Plan days | Reminder setting `all` or `chosen` weekdays (chips), default all | "Plan days" undefined in code; S-07 left it to S-08 (`pora-cwiczen/plan.md:30`); S-03 goal runs in parallel | Auto |
| Turning off | Existing "Wyłącz" (deletes registration and all reminder fields) | Already easy and erases server data (`handler.ts:88-91`) | Auto |
| No Pora saved | No reminders (empty `times`), panel hints to set the Pora | FR-004 reminds "o swojej porze" | Auto |
| Client storage | New keys `reminderDays`, `reminderSync` in the existing `device` store | Out-of-line keys (`migrations.ts:45-48`): no IndexedDB migration, as the requester asked | Auto |
| Offline sync | Resend when current payload ≠ last acknowledged; on start, `online`, after saves, on panel mount | Full-state PUT makes "pending" a simple comparison | Auto |
| Background Sync API | Not used | Not available on iOS; next open online suffices | Auto |
| Sync triggers without touching `src/practice/` | Wrap injected stores in `main.tsx` / `App.tsx` | `App` and `PracticeTimeCard` accept stores (`App.tsx:20-26`, `PracticeTimeCard.tsx:36`); keeps S-09 files untouched | Auto |
| Time-zone math | `Intl` only, gap → +1 h, overlap → earlier; pinned Warsaw DST tests | No new dependency; prior review flagged unpinned DST tests | Auto |
| Reminder text | A few fixed encouraging Polish lines, chosen by day; tag `grajek-reminder` | NFR tone; server knows no name or place | Auto |
| Emulator tests | Tick tested by calling `runReminderTick` against the Firestore emulator; endpoint through the Functions emulator | Scheduled functions do not fire on the emulator | Auto |
| Emulator tests locally | Run in CI only (JDK 21); not runnable here (no Java) | Requester note | Issue |
| Deploy | None; Cloud Scheduler / Blaze are manual | Requester: no deploy, no cloud changes | Issue |

## Scope
In: endpoint + storage, schedule math, scheduled sender, client setting, sync with retry, panel control, wiring, tests.
Out: migration, deploy, separate mute switch, Background Sync, quiet hours/snooze, goal-aware plan days, any change to registration/test endpoints.

## Architecture / Approach
`functions/src/reminders/` (schedule, validation, tick, messages, due-device repository) + small edits to `devices/handler.ts`, `devices/repository.ts`, `devices/types.ts`, `index.ts`. Client: new `src/reminder/` module; one-line mount in `NotificationsPanel.tsx`; a few lines in `main.tsx` and `App.tsx`.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Daily reminder end to end | — | yes | DST math; once-per-day under overlapping ticks |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | Reminder endpoint, storage, zone math | DST edge cases |
| 2 | 1 | Scheduled sender with claim | Emulator tests only in CI |
| 3 | 1 | Client setting, payload, offline sync | Duplicate/missed sync triggers |
| 4 | 1 | Panel control and wiring | Merge conflicts in `App.tsx`/`main.tsx` with S-03/S-09 |

Prerequisites: F-02, S-02, S-07 present on this branch stack.

## Open risks & assumptions
- Emulator tests (2.3) run only in CI; locally they are unverifiable (no JDK).
- Real delivery (4.6) needs a deploy with Cloud Scheduler on the Blaze plan: manual, by the user.
- A practice logged offline and never followed by an online app open can still be followed by that day's reminder (accepted).
- RODO/parental-consent question (roadmap Unknowns) blocks publication, not the build.
- Small edits to `App.tsx` and `main.tsx` may conflict textually with S-03/S-09; no schema conflict.

## Success criteria (summary)
Functions typecheck/build/unit tests green; emulator tests green in CI; app typecheck, lint, unit, build and e2e green; manual delivery check on Android and iOS after deploy.
