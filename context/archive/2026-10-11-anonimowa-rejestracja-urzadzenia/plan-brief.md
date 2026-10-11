# Anonymous device registration for notifications — Plan Brief
Full plan: `context/changes/anonimowa-rejestracja-urzadzenia/plan.md` · request: `change.md` · roadmap slice F-02 (`context/foundation/roadmap.md`) · ADR 0001

## What & why
A phone running Grajek can register anonymously for push notifications and
receive a test notification on request. Only a random device id and its Web
Push subscription leave the device. This is the foundation for daily reminders
(S-08, FR-004), and it gives the user a way to verify delivery on Android and
iOS.

## Starting point
F-01 delivered a client-only PWA with no server:
- the service worker is `generateSW` (`vite.config.ts:16-56`);
- IndexedDB uses an append-only migration list with an empty v1
  (`src/storage/migrations.ts:19-22`);
- Hosting has only a catch-all rewrite (`firebase.json:5`).

Nothing about notifications exists yet. The planning machine has no Java, so
the Firestore emulator cannot run there.

## Desired end state
- A `functions/` package exposes `PUT`/`DELETE /api/devices/{id}` and
  `POST /api/devices/{id}/test` (one Polish test notification, 60 s cooldown,
  stale subscriptions deleted) behind a same-origin Hosting rewrite.
- Firestore `devices/{id}` holds only `subscription`, `createdAt`,
  `updatedAt` and `lastTestAt`. Client access is denied by the rules.
- The PWA has a small "Powiadomienia" panel (enable / test / disable, plus an
  iOS install hint) and a SW push handler.
- Everything is unit-tested. An emulator suite runs in CI with JDK 21. Deploy
  and billing are manual.

## Complexity
MEDIUM. It adds a new server package, a new IndexedDB migration, SW changes
and a public HTTP contract, across about 25 files. The approach is
conventional and the data shape is tiny. It is not HIGH because there is no
auth, no scheduling and no real deploy.

Skipped:
- rs-research: the codebase is a small F-01 skeleton, read directly
  (storage, SW config, Hosting, CI).
- rs-frame: a roadmap feature slice with a clear outcome and no stated cause
  to challenge.

Jev was unavailable (no Python on this machine), so I decided both myself.

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Area split | Single area A1 = whole slice | Orchestrator's split | Orchestrator |
| Server stack | Firebase Cloud Functions (2nd gen, Node 22) + Firestore; tech-stack.md updated in place | Requester prefers Firebase; Hosting already on `grajek-app` | Issue |
| Push transport | Standard Web Push (VAPID, `web-push`), no FCM SDK | FCM adds a second Google installation id (ADR 0001) and needs real credentials even on the emulator. VAPID is testable offline. Same iOS support | Consult |
| Write path / security boundary | One HTTPS `onRequest` function `api` behind the `/api/**` rewrite; Admin SDK only; rules deny all | Boundary is server code, unit-testable without Java; no client SDK; no CORS | Consult |
| Device identity | Client `crypto.randomUUID()` as an unguessable capability; no Firebase Auth | Anonymous Auth adds another identifier; ADR 0001 allows only an anonymous id | Consult |
| Client persistence | Append IndexedDB migration v2 `device` store | F-01 storage contract (`migrations.ts:3-8`); the SW can read IndexedDB but not localStorage | Consult |
| Placeholder `reminderTime` / per-day flag | Not added | Firestore is schemaless; S-07/S-08 own the semantics | Consult |
| Endpoint allowlist | Only known push-service hosts accepted | Prevents the function from POSTing to arbitrary URLs (SSRF) | Auto |
| Test-send abuse limits | Fixed server-side payload, 60 s per-device cooldown, 4 KB body cap | Not usable as a relay; minimal extra state (`lastTestAt`) | Auto |
| Region | `europe-central2` (Warsaw) for functions and Firestore | Polish users; EU data residency helps the RODO question | Auto |
| Package layout | `functions/` standalone with its own pnpm lockfile (no workspace) | Root install and CI unchanged; folder deploys on its own | Auto |
| Emulator safety | All emulator scripts use `--project demo-grajek` | `demo-` projects cannot reach real cloud resources (requester: no cloud changes) | Auto |
| Emulator test without Java | Unit tests with fakes are the primary proof; the emulator suite runs in a CI job with Temurin 21, plus a Manual local run | No JDK on this machine | Auto |
| UI placement | Self-contained `NotificationsPanel`, one-line mount in `App.tsx` | Keeps the conflict with parallel S-01 small | Auto |
| Increments | One increment, 4 phases | Client and endpoint are not useful apart; fits rs-core §8 | Auto |
| User-visible | yes | New UI panel and a public HTTP API | Auto |
| Billing, deploy, real-device check, RODO | Manual criteria 4.4-4.8 | Requester: no deploy or cloud changes; consent is the user's call | Issue |

## Scope
- **In:**
  - anonymous registration, unregister and test-send endpoints;
  - the Firestore registry;
  - the PWA panel and SW push handler;
  - migration v2;
  - emulator tests, the CI job and the README go-live checklist.
- **Out:**
  - reminder time, daily sending and per-day flags (S-07/S-08);
  - FCM, Auth and App Check;
  - deploy and billing;
  - re-registration from `pushsubscriptionchange`;
  - legal text;
  - anything from F-01's change folder or from S-01.

## Architecture / Approach
- PWA → `fetch /api/devices/...` (same origin via the Hosting rewrite; Vite
  dev proxy to the functions emulator) → function `api`:
  - validation;
  - `DeviceRepository` (Firestore);
  - `PushSender` (`web-push`, VAPID secret).
- The browser's push service delivers the notification to the SW's
  `push-sw.js`, which is imported into the generated Workbox SW.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Anonymous push registration + test notification | — (F-01 branch base) | yes | Real delivery only verifiable after a manual deploy |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | `functions/` registry with unit tests, firebase.json/rules, lint wiring | `firebase-tools`/Functions versions on Node 22 |
| 2 | 1 | Migration v2, `src/push/` module, SW push handler, dev proxy | Merge re-index against S-01's migration |
| 3 | 1 | `NotificationsPanel`, App mount, e2e smoke | `App.tsx` conflict with S-01 |
| 4 | 1 | Emulator suite, CI `functions` job, README, `.env.example` | No JDK locally; emulator proven only in CI |

Prerequisites: F-01 merged first. To go live, the user also needs to generate
a VAPID key pair.

## Open risks & assumptions
- The iOS limitation: Web Push works only on iOS 16.4+ in a PWA added to the
  home screen. The panel shows an install hint otherwise.
- RODO / parental consent for anonymous device data is unanswered (owner: the
  user). It blocks publication, not the build (Manual 4.7).
- Blaze billing is not linked. Deploy, secrets and real-device checks are
  manual (4.4-4.6).
- The Firestore emulator needs JDK 21, which this machine does not have.
  Criterion 4.1 is proven by the CI job, and 4.8 is a manual local run.
- Parallel S-01: both changes append a migration and touch `App.tsx`. Whoever
  merges second re-indexes and resolves.
- Choosing Web Push over FCM departs from the FCM hint in the old tech-stack
  note. It is recorded as decision-to-verify for the user.
- Pushing pnpm-managed `functions/` through Cloud Build at deploy time is
  assumed to work (pnpm-lock is supported by the Node buildpack). It is
  verified at the manual deploy.

## Success criteria (summary)
- Functions: build, typecheck and unit tests (status codes, cooldown, cleanup,
  field whitelist, allowlist).
- Root: lint, typecheck, unit (migration v2, push module, panel), build (SW
  imports `push-sw.js`) and e2e smoke.
- CI emulator suite green.
- Manual: billing and deploy, real-device delivery on Android and iOS, RODO
  answer.
