# Move the app to grajek.web.app — Implementation Plan

## Overview
Serve the app from the new Firebase Hosting site `grajek` (https://grajek.web.app)
in the unchanged Firebase project `grajek-app`. The old default site `grajek-app`
(https://grajek-app.web.app) becomes a pure 301 redirect to the same path on the
new address, plus one self-destroying `sw.js` that removes the service worker an
earlier visit installed on the old origin and sends the open window to the new
address. CI deploys previews and live to `grajek`; the live deploy also publishes
the redirect site. Every reference to the old URL (not to the project id) moves.

## Current State Analysis
- `firebase.json:2-56` has a single `hosting` object (no `site`/`target`), so deploys go to the project's default site `grajek-app`. It holds the `/api/**` rewrite to function `api` in `europe-central2` (`:5-8`), the SPA fallback (`:9`) and the cache headers (`:11-55`).
- `.firebaserc:3` default project `grajek-app`; no `targets`. The project id stays (requester).
- `functions/src/index.ts:61` sets `cors: false`; the API is same-origin through the Hosting rewrite. There is no allowed-origins list anywhere in `functions/src` (grep `cors|origin|allowed`), so the backend needs no change: the request's "CORS/allowed origins" item has nothing to update.
- `vite.config.ts:12,23-28` builds with relative `base`, `id`, `start_url` and `scope` (`./`); the manifest carries no absolute URL, so it needs no change.
- `src/pwa/updates.ts` registers `sw.js` relative to the page; `firebase.json:24-25` serves `/sw.js` with `no-cache`, so an installed client re-fetches `sw.js` on each update check (`updates.ts:104`). A browser rejects a redirected service-worker script, so a catch-all 301 on the old site would leave the old worker serving its precache forever.
- Old-URL references outside `context/archive/`: `README.md:39`, `context/foundation/tech-stack.md:31`, `src/push/push-sw.test.ts:5`. Project-id references that must stay: `.firebaserc:3`, `ci.yml:135,156` (`projectId`), `README.md:51,66,76,157,160` (project, `functions/.env.grajek-app`), secret name `FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP`, `tech-stack.md:66-67`. `src/App.test.tsx:11` (`grajek-app-test-`) is an unrelated test string.
- `.github/workflows/ci.yml:117-156`: `deploy-preview` and `deploy-live` run `FirebaseExtended/action-hosting-deploy@v0` with `projectId: grajek-app` and no `target`. The action's `target` input selects one Hosting site/target; left blank it deploys every hosting config.
- `functions/package.json:15` `test:emulators` runs `firebase emulators:exec --only functions,firestore --project demo-grajek`; it reads `firebase.json`, so the new hosting array must stay valid for firebase-tools 15 under a project with no `.firebaserc` targets.
- Push subscriptions are bound to the old origin; after the move a device must turn reminders on again (PR note, no code).

## Desired End State
- `firebase.json` `hosting` is an array of two configs: `site: "grajek"` with today's `public`, `ignore`, rewrites (including `/api/**` to `api`, `europe-central2`) and headers unchanged; `site: "grajek-app"` with its own small public dir that redirects every path except `/sw.js` (301, path kept) to `https://grajek.web.app/<path>` and serves `/sw.js` with `Cache-Control: no-cache`.
- The legacy `sw.js`: on install skips waiting; on activate deletes every Cache Storage entry, unregisters itself, and navigates each open window client to the same path on `https://grajek.web.app`.
- CI: `deploy-preview` passes `target: grajek` (preview channels only on the app site); `deploy-live` deploys with `channelId: live` to both sites.
- README, `tech-stack.md` and the push worker test name `https://grajek.web.app`; the project id stays `grajek-app` everywhere it is the project id.

### Key discoveries
- Firebase Hosting evaluates redirects before static files, so the redirect rule itself must not match `/sw.js`; Hosting regexes are RE2 (no lookahead), so the exclusion is either a glob that skips `/sw.js` or an RE2 alternation, not `(?!...)`.
- The `site` field needs no `firebase target:apply` and no `.firebaserc` targets, which keeps the emulator runs under `demo-grajek` free of target resolution.

## What we're NOT doing
- No change to the Firebase project id, `.firebaserc`, function code, region, Firestore rules, secrets or the service-account secret name.
- No deploy from this machine, no Firebase console changes (the `grajek` site already exists).
- No server-side migration of push subscriptions; affected devices re-enable reminders.
- No custom domain, no change to the app's manifest or build base.
- No `/api/**` rewrite on the legacy site (old clients are redirected or cleaned up; the API lives on the app site).

## Implementation Approach
Use the per-config `site` field in `firebase.json` rather than deploy targets:
the request allows either, `site` needs no `.firebaserc` change or
`target:apply`, and the action's `target` input and `--only hosting:<id>`
accept a site id. The legacy site gets a dedicated public directory
(`hosting/legacy/`) containing only `sw.js`; its config has one redirect rule
covering every path except `/sw.js` (glob with exclusion or RE2 capture,
whichever firebase-tools 15 / superstatic accepts while keeping the path), and
a `no-cache` header for `/sw.js`. A self-destroying worker is preferred over a
plain full redirect because a redirected worker script is rejected by the
browser, which would strand old installs on their precache; it is preferred over
an HTML/JS redirect page because the request asks for real 301s for links.

Live deploy keeps one action step without `target` (deploys both hosting
configs in one run) instead of two steps; preview adds `target: grajek` so PR
channels are not created on the redirect site.

Both configs are checked by a Vitest test that parses `firebase.json`, and the
legacy worker by a Vitest test that runs its source against a fake
`ServiceWorkerGlobalScope`, in the style of `src/push/push-sw.test.ts`.

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Move hosting to grajek.web.app with legacy redirect (A1 hosting-address) | 1-2 | — | yes | in-progress | — |

## Critical Implementation Details
- **App site config.** Move the current `hosting` object unchanged into the array with `"site": "grajek"` added; the `/api/**` rewrite stays before the `**` fallback. Order the array app first.
- **Redirect rule.** One rule, `type: 301`, destination `https://grajek.web.app/` plus the captured path (empty path goes to `https://grajek.web.app/`). It must not match `/sw.js`. A regex must be RE2-compatible (no lookaround, no backreferences). Firebase keeps the query string on redirects; no extra handling.
- **Legacy `sw.js`.** Plain JS, no imports (it replaces a Workbox worker that imported `push-sw.js`). `install`: `self.skipWaiting()`. `activate`: `event.waitUntil(...)` deleting all `caches.keys()`, then `self.registration.unregister()`, then `self.clients.matchAll({ type: 'window' })` and `client.navigate('https://grajek.web.app' + pathname + search + hash)` for each. A failure in one step must not skip the others (e.g. `Promise.allSettled`). No `fetch` handler, so the network (and its 301) answers every request once the worker is gone.
- **Legacy public dir ignore list** mirrors the app's (`firebase.json`, `**/.*`, `**/node_modules/**`).
- **CI.** `deploy-preview`: add `target: grajek`. `deploy-live`: keep `channelId: live`, no `target` (both sites), with a comment saying why. `projectId: grajek-app` and the secret stay. The service account's Hosting Admin role is project-wide, so it covers both sites.
- **Docs.** README `## Publishing`: app at https://grajek.web.app (site `grajek` in project `grajek-app`); the old address redirects with the path kept and its `sw.js` cleans up old installs; preview channels are on site `grajek`; home-screen installs and push reminders from the old address must be set up again. Keep every project-id mention. README "Go live" step 6 (`--only functions,firestore,hosting`) deploys both sites: say so in one clause. `tech-stack.md:31`: `https://grajek.web.app` (site `grajek`; legacy site `grajek-app` redirects); bump `updated`.

## Phase 1: Hosting sites and legacy cleanup worker
### Overview
`firebase.json` serves the app on site `grajek` and turns site `grajek-app` into a 301 redirect with a self-destroying `sw.js`.

### Required changes
#### 1. Hosting config
- **File**: `firebase.json`
- **Goal**: publish the app to site `grajek`, the redirect to site `grajek-app`.
- **Contract**: `hosting` is an array per *Critical Implementation Details*; `functions`, `firestore`, `emulators` unchanged.

#### 2. Legacy worker
- **File**: `hosting/legacy/sw.js` (new)
- **Goal**: remove the old-origin service worker and caches and move open windows to the new address.
- **Contract**: behaviour per *Legacy `sw.js`* above.

#### 3. Tests
- **File**: `src/hosting/firebase-config.test.ts` (new)
- **Goal**: lock the hosting contract.
- **Contract**: parses `firebase.json`; asserts two configs with sites `grajek` and `grajek-app`; the `grajek` config's `public`, rewrites (incl. `/api/**` to `api` / `europe-central2` before `**`) and headers equal today's values; the `grajek-app` config has `public: "hosting/legacy"`, a 301 rule to `https://grajek.web.app` that, evaluated as the glob/regex it is on sample paths `/`, `/index.html`, `/a/b`, `/assets/x.js`, `/sw.js`, redirects every sample except `/sw.js` to the same path, uses no lookaround if it is a regex, and a `no-cache` header for `/sw.js`.
- **File**: `src/hosting/legacy-sw.test.ts` (new)
- **Goal**: prove the cleanup worker.
- **Contract**: loads `hosting/legacy/sw.js?raw` into a fake scope (`caches`, `registration.unregister`, `clients.matchAll` with windows on `https://grajek-app.web.app/some/path?q=1`); asserts install calls `skipWaiting`, activate deletes every cache key, unregisters, and navigates each window to `https://grajek.web.app/some/path?q=1`; a rejected cache delete still leads to unregister and navigate.

### Success criteria
#### Automated
- `pnpm test` passes, including `src/hosting/firebase-config.test.ts` and `src/hosting/legacy-sw.test.ts`
- `node -e "JSON.parse(require('fs').readFileSync('firebase.json','utf8'))"` succeeds and `.firebaserc` is unchanged (`git diff --quiet origin/main -- .firebaserc`)
- `pnpm lint && pnpm typecheck && pnpm build` pass
- `CI=1 pnpm test:e2e` passes
- `pnpm --dir functions test` passes; `pnpm --dir functions test:emulators` passes where a JDK 21 is available (else CI's `functions` job is the proof)
#### Manual
- After the first live deploy, `curl -sI https://grajek-app.web.app/some/path` returns `301` with `location: https://grajek.web.app/some/path`, and `curl -sI https://grajek-app.web.app/sw.js` returns `200`
- After the first live deploy, `https://grajek.web.app/api/...` reaches the function
- A browser that had the app installed from https://grajek-app.web.app lands on https://grajek.web.app after its next update check, and the old origin shows no registered service worker

## Phase 2: CI deploy targets and references
### Overview
CI previews go to site `grajek`, live deploys both sites; docs and tests name the new address.

### Required changes
#### 1. CI workflow
- **File**: `.github/workflows/ci.yml`
- **Goal**: deploy previews to `grajek`, live to both sites.
- **Contract**: per *Critical Implementation Details*, CI; nothing else in the workflow changes.

#### 2. README
- **File**: `README.md`
- **Goal**: document the new address and its consequences.
- **Contract**: per *Critical Implementation Details*, Docs.

#### 3. Tech stack record
- **File**: `context/foundation/tech-stack.md`
- **Goal**: keep the stack record true.
- **Contract**: line 31 per *Docs*; `updated` bumped.

#### 4. Push worker test
- **File**: `src/push/push-sw.test.ts`
- **Goal**: use the real origin in the fake scope.
- **Contract**: `SCOPE = 'https://grajek.web.app/'`; assertions follow.

### Success criteria
#### Automated
- `git grep -n "grajek-app.web.app" -- . ':!context/archive' ':!context/changes'` lists only legacy-site references (`firebase.json`, `hosting/`, `src/hosting/`) and README lines that describe the redirect
- `npx --yes js-yaml .github/workflows/ci.yml` parses; `deploy-preview` has `target: grajek`; `deploy-live` has `channelId: live` and no `target`; both keep `projectId: grajek-app`
- `.firebaserc`, `functions/` and the secret name are unchanged (`git diff --quiet origin/main -- .firebaserc functions`; `grep -c FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP .github/workflows/ci.yml` prints 2)
- `pnpm lint && pnpm typecheck && pnpm test` pass
#### Manual
- On this change's PR, the preview comment links a `grajek--` channel URL on `web.app` that serves the app

## Testing Strategy
Configuration is proven by Vitest tests that parse `firebase.json` and execute the
legacy worker against a fake scope (the pattern `src/push/push-sw.test.ts` already
uses); the app and backend suites must stay green, and the emulator suite proves
firebase-tools still accepts the multi-site config. Real redirects, the new
origin's `/api` and the old-install cleanup can only be seen after the first live
deploy from CI (Manual criteria); nothing is deployed from this machine.

## References
- `change.md` (request and constraints)
- `firebase.json:1-71`, `.firebaserc:1-5`, `.github/workflows/ci.yml:117-156`, `functions/src/index.ts:61`, `functions/package.json:15`
- `vite.config.ts:12-60`, `src/pwa/updates.ts:9,104`, `src/push/push-sw.test.ts:5`, `public/push-sw.js`
- `README.md:36-110,150-170`, `context/foundation/tech-stack.md:31`
- Archived `context/archive/2026-10-11-ci-deploy-firebase/` (deploy jobs, secret, permissions)
- Firebase Hosting docs: multisite `site` field, redirect priority over static content, RE2 regex redirects; FirebaseExtended/action-hosting-deploy `target` input

## Progress

### Phase 1: Hosting sites and legacy cleanup worker
#### Automated
- [x] 1.1 `pnpm test` passes, including `src/hosting/firebase-config.test.ts` and `src/hosting/legacy-sw.test.ts` — 8c5ea8d
- [x] 1.2 `node -e "JSON.parse(require('fs').readFileSync('firebase.json','utf8'))"` succeeds and `.firebaserc` is unchanged (`git diff --quiet origin/main -- .firebaserc`) — 8c5ea8d
- [x] 1.3 `pnpm lint && pnpm typecheck && pnpm build` pass — 8c5ea8d
- [x] 1.4 `CI=1 pnpm test:e2e` passes — 8c5ea8d
- [x] 1.5 `pnpm --dir functions test` passes; `pnpm --dir functions test:emulators` passes where a JDK 21 is available (else CI's `functions` job is the proof) — 8c5ea8d
#### Manual
- [ ] 1.6 After the first live deploy, `curl -sI https://grajek-app.web.app/some/path` returns `301` with `location: https://grajek.web.app/some/path`, and `curl -sI https://grajek-app.web.app/sw.js` returns `200`
- [ ] 1.7 After the first live deploy, `https://grajek.web.app/api/...` reaches the function
- [ ] 1.8 A browser that had the app installed from https://grajek-app.web.app lands on https://grajek.web.app after its next update check, and the old origin shows no registered service worker

### Phase 2: CI deploy targets and references
#### Automated
- [x] 2.1 `git grep -n "grajek-app.web.app" -- . ':!context/archive' ':!context/changes'` lists only legacy-site references (`firebase.json`, `hosting/`, `src/hosting/`) and README lines that describe the redirect
- [x] 2.2 `npx --yes js-yaml .github/workflows/ci.yml` parses; `deploy-preview` has `target: grajek`; `deploy-live` has `channelId: live` and no `target`; both keep `projectId: grajek-app`
- [x] 2.3 `.firebaserc`, `functions/` and the secret name are unchanged (`git diff --quiet origin/main -- .firebaserc functions`; `grep -c FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP .github/workflows/ci.yml` prints 2)
- [x] 2.4 `pnpm lint && pnpm typecheck && pnpm test` pass
#### Manual
- [ ] 2.5 On this change's PR, the preview comment links a `grajek--` channel URL on `web.app` that serves the app
