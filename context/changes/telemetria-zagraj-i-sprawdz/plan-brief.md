# Telemetry and accuracy feedback for "Zagraj i sprawdź" — Plan Brief
Full plan: `context/changes/telemetria-zagraj-i-sprawdz/plan.md` · request text and Areas: `change.md`

Skipped: rs-research (Jev p=0.04; shape clear from the request and a direct read of `functions/src` and `src/spike-nuty`), rs-frame (Jev p=0.16; the request states an observation-free feature with explicit scope, nothing to reframe).

## What & why
The owner wants to measure note-recognition accuracy of the spike screen across
all real users and to separate a child's mistakes from recognition mistakes.
Each attempt is logged anonymously and the player can say whether the grading
was right, marking the misjudged notes.

## Starting point
`api` (one Cloud Function) only serves `/devices/...` and 404s everything else
(`functions/src/devices/handler.ts:146-150`). The spike screen grades in memory
and sends nothing; Stop and auto-stop share one path
(`src/spike-nuty/SpikeScreen.tsx:193-204`); events carry no clarity/level
(`src/spike-nuty/logic/segment.ts:38-59`). CI checks functions but deploys only
Hosting (`.github/workflows/ci.yml:68-155`).

## Desired end state
Records and feedback land in Firestore `spikeNutyAttempts` (TTL 180 days) via
validated, size-capped, rate-limited PUT routes; the spike screen shows the
notice, an opt-out switch and the "Czy ocena się zgadza?" question; the owner
fetches aggregates and JSON/CSV exports with a secret header.

## Complexity
HIGH — three increments across backend and client, a new public write contract
shared by two increments, a new secret on `api`, offline queueing and UI on a
screen with live audio state. Each part follows an existing pattern, which
keeps the risk moderate.

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Research step | skipped | Shape clear from request + code read | Jev (p=0.04) |
| Framing step | skipped | Scope explicit, no stated cause to test | Jev (p=0.16) |
| Areas | A1 ingest → inc 1; A2 client → inc 2 (on 1); A3 owner stats → inc 3 (on 1) | Orchestrator split; 2 and 3 file-disjoint (`src/` vs `functions/`+`README.md`) | Orchestrator |
| Routing in `api` | new `createApiHandler` dispatcher in front of the unchanged devices handler | devices handler 404s foreign paths (`handler.ts:146-150`) | Auto |
| Shared HTTP helpers | move `HttpRequest`/`HttpResponse`/`bodySize`/`isJson` to `functions/src/http.ts` in inc 1 | both handlers need them; inc 3 builds on it | Auto |
| Write routes | `PUT /api/spike-nuty/attempts/{uuid}` (idempotent create) and `PUT …/{uuid}/feedback` | client-generated id (request item 2) makes retries safe; PUT matches devices style | Auto |
| Feedback ownership | accepted only when `deviceId` equals the stored one, else 404 | stops overwriting other devices' records without adding auth | Auto |
| Record schema | v1 contract in plan Critical Implementation Details | fields listed by request item 1; no name/profile/audio fields exist | Issue |
| Size limits | 200 events, 400 notes, 64 KiB attempt, 8 KiB feedback, comment 500 | request item 4 ("max 200 zdarzeń"); 200 events ≈ 20-40 KiB | Auto |
| Rate limit | 60 writes/device/hour, Firestore counter doc in a transaction, 429 + Retry-After | `api` has up to 2 instances (`index.ts:60`): memory counters are per instance | Auto |
| TTL | `expireAt` = receipt + 180 days; TTL declared as `fieldOverrides` `ttl: true` in `firestore.indexes.json`, gcloud/console fallback in README | request item 4; firebase-tools 15 deploys TTL field overrides | Auto |
| Client queue store | localStorage, 20 items, FIFO | request allows it; IndexedDB would need a migration of shared `src/storage` for a throwaway spike | Auto |
| Retry rules | drop on 400/413/415, keep on network/5xx/429, feedback 404 retried up to 5 times; flush on enqueue, mount, `online` | permanent errors never succeed; feedback may precede its attempt only transiently | Auto |
| Opt-out | localStorage switch, default on; off clears the queue and hides feedback | request item 3 | Issue |
| Re-grading after send | record built once from the first grading shown; feedback carries `regraded` | `autoLatency` stays toggleable on the result view (`SpikeScreen.tsx:469-476`) | Auto |
| Event clarity/level | add `meanClarity`, `meanLevelDb` to `NoteEvent` | request item 1 asks for them; not kept today (`segment.ts:54-59`) | Auto |
| Note kind in record | expose kind + MIDI on `NoteRow` instead of parsing Polish copy | `NoteRow.status` is display text (`results.ts:56-69`) | Auto |
| Build id | `__APP_BUILD__` from `GITHUB_SHA` (short) or `dev` via Vite `define` | no version exists (`package.json` 0.0.0) | Auto |
| Device type | client sends UA (≤512) + `userAgentData` platform/mobile; server derives `ios/android/desktop/other` at read time | request asks for UA/model and latency per device type | Auto |
| Owner auth | header `X-Admin-Key` vs secret `SPIKE_NUTY_ADMIN_KEY` (Secret Manager via `defineSecret`), constant-time compare, 401/503 | request item 5; matches existing `VAPID_PRIVATE_KEY` pattern | Issue |
| Stats computation | at read time over a `receivedAt` range (default 30 days, max 366, ≤10 000 docs) | spike scale; keeps stored schema free of derived fields | Auto |
| Export | JSON or CSV (one row per attempt, nested arrays as JSON columns, formula cells escaped) | request item 5; CSV opens in a spreadsheet safely | Auto |
| Owner script | `functions/scripts/spike-nuty-stats.mjs` + curl in README | Node is already required; works on Windows too | Auto |
| CI deploy of functions | not added; deploy stays the owner's manual step, documented | CI holds only a Hosting deploy key (`ci.yml:110-155`, README `:164-174`); widening its cloud rights is a security boundary the request did not ask to change | Auto |
| Increment user-visibility | 1 `no` (no caller yet), 2 `yes` (UI), 3 `yes` (owner-facing API) | progress-format rule | Auto |

## Scope
In: the three areas above, tests (unit + emulator), README sections.
Out: audio, names/profile data, client Firestore access, consent dialog, owner UI, CI function deploy, IndexedDB migration.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Ingest routes, rate limit, TTL, router | — | no | breaking the devices routes (guarded by existing tests) |
| 2 | Record, offline queue, feedback UI, notice, opt-out | 1 | yes | UI state on a live-audio screen; must never block or throw |
| 3 | Stats + export with admin key, script, docs | 1 | yes | deploy fails until the owner sets the new secret |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | validation | limits too tight for real records |
| 2 | 1 | repository, rate limit, handler, router | transaction contention (low at 60/h) |
| 3 | 1 | emulator test, TTL, README | TTL field override support in CLI |
| 4 | 2 | record builder, event clarity/level, build id | changing `NoteEvent` breaks segment tests |
| 5 | 2 | queue, transport, opt-out | localStorage quota/private mode |
| 6 | 2 | screen wiring, feedback UI, copy | e2e without backend |
| 7 | 3 | aggregates, CSV | misjudged mapping to notes |
| 8 | 3 | admin handler, secret wiring | emulator secret for existing `.secret.local` |
| 9 | 3 | emulator test, script, README | — |

Prerequisites (owner, manual): set `SPIKE_NUTY_ADMIN_KEY` with `firebase functions:secrets:set` before deploying functions after increment 3; deploy `functions,firestore` so routes and TTL go live; previews call the live `api`.

## Open risks & assumptions
- decision-to-verify: functions are still deployed manually; the request asked to check CI/deploy covers functions — CI checks them, but does not deploy them, and previews hit the live function only after the owner deploys.
- Per-device rate limit is advisory: a client can mint new device ids; `maxInstances: 2` bounds total load.
- User agent is stored as sent (pseudonymous technical data, explicitly requested); no IP is stored.
- If `ttl: true` in `firestore.indexes.json` is rejected by the installed CLI, phase 3 keeps the README gcloud/console step as the only path (plan already documents it).

## Success criteria (summary)
Functions unit + emulator suites, app unit, lint, typecheck, build and e2e all pass; a finished attempt and its feedback reach Firestore; the owner gets stats and exports with the key.
