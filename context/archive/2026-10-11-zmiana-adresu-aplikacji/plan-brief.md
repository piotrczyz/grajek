# Move the app to grajek.web.app — Plan Brief
Full plan: `context/changes/zmiana-adresu-aplikacji/plan.md` · request text: `change.md`

## What & why
The client wants the app at https://grajek.web.app (new Hosting site `grajek`,
already created in project `grajek-app`) instead of https://grajek-app.web.app,
with old links still working through a 301 redirect.

## Starting point
One `hosting` config in `firebase.json` (default site), `/api/**` rewritten to the
`api` function, cache headers for the PWA files. CI deploys previews and live with
no site selection. The old URL appears only in README, `tech-stack.md` and one
test; the manifest is relative and the function has no origin list (`cors: false`).

## Desired end state
App on site `grajek` with identical rewrites and headers; site `grajek-app` 301s
every path to the same path on the new address, except a self-destroying `sw.js`
that clears old installs and moves their windows over. CI previews on `grajek`,
live deploys both sites. Project id `grajek-app` untouched.

## Complexity
LOW: config, one tiny worker, two tests, CI and docs; no app logic, no backend
change. Not TRIVIAL: more than three files outside `context/`, and the
service-worker handover is the one subtle part.
Skipped: rs-research (whole surface read: `firebase.json`, `.firebaserc`, `ci.yml`,
`vite.config.ts`, function CORS, every old-URL reference) and rs-frame (the request
states an outcome, not a cause); Jev not asked (`jev-decide.py` unavailable, no python).

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Area split | A1 hosting-address, one increment | Orchestrator split; all files form one deployable change | Orchestrator |
| Research / framing | Skip both | Surface fully read; outcome-shaped request | Auto |
| Site selection | `site` field per hosting config, no `.firebaserc` targets | No `target:apply`, `.firebaserc` unchanged, emulator runs under `demo-grajek` need no targets; action `target` accepts a site id | Auto |
| Old-site behaviour | 301 for every path except `/sw.js`, path kept | Request asks 301 with path; redirects beat static files on Hosting, and a redirected worker script is rejected, so `/sw.js` must be excluded | Issue + Auto |
| Old service worker | Self-destroying `sw.js` (skip waiting, clear caches, unregister, navigate windows to new origin) | Old installs otherwise keep serving their precache forever; near-zero users so no migration of data | Auto |
| Legacy public dir | `hosting/legacy/` with only `sw.js` | Keeps redirect site separate from `dist/` | Auto |
| `/api/**` on old site | Not rewritten (redirected like everything else) | Old clients are cleaned up; API lives on the app site | Auto |
| CI preview | `target: grajek` | Request; avoids preview channels on the redirect site | Issue |
| CI live | One step, `channelId: live`, no `target` (both sites) | Request: live also publishes the redirect; one step keeps both sites in one run | Auto |
| CORS / allowed origins | No change | `functions/src/index.ts:61` `cors: false`, no origin list in `functions/src` | Auto |
| Manifest | No change | `vite.config.ts:23-28` relative `id`/`start_url`/`scope` | Auto |
| Project-id references | Kept (`.firebaserc`, `projectId`, secret name, `functions/.env.grajek-app`) | Requester constraint | Issue |
| Push subscriptions | No migration; PR notes devices must re-enable reminders | Origin-bound; requester asked for a PR note | Issue |
| Verification | Vitest tests for `firebase.json` and the legacy worker; live behaviour Manual | No deploy from this machine | Issue + Auto |
| User-visible | `yes` | The app's address changes | Auto |

## Scope
In: `firebase.json`, `hosting/legacy/sw.js`, `src/hosting/*.test.ts`, `ci.yml`, README, `tech-stack.md`, `src/push/push-sw.test.ts`.
Out: project id, `.firebaserc`, functions code, Firestore, secrets, custom domain, subscription migration.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | App on grajek.web.app, redirect + cleanup on old site, CI targets, docs | — | yes | Redirect pattern must exclude `/sw.js` in Hosting's glob/RE2 syntax |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | Multi-site `firebase.json`, legacy `sw.js`, tests | Pattern semantics differ between test and Hosting |
| 2 | 1 | CI targets, README, tech-stack, push test | Renaming a project-id reference by mistake |

## Open risks & assumptions
- Redirect/glob semantics can only be confirmed on the first live deploy (Manual 1.6).
- The deploy service account (Hosting Admin, project-wide) is assumed to cover the new site.
- Installed home-screen apps and push subscriptions from the old origin must be set up again by the user (PR note).
