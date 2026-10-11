# Grajek

Grajek is a mobile-first progressive web app (PWA) for music-school students
aged 7-13: a practice log that installs to the phone's home screen (Android and
iOS) and works without internet. All data stays on the device.

This repository currently holds the app skeleton: a Polish welcome screen, the
on-device storage contract (`src/storage/`) and the offline-capable static build.

## Prerequisites

- Node.js 22.12 or newer (`.nvmrc` pins 24)
- pnpm (the version is pinned in `package.json` `packageManager`; `corepack enable` picks it up)

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Dev server | `pnpm dev` |
| Build (static output in `dist/`) | `pnpm build` |
| Preview the production build | `pnpm preview` |
| Unit tests (Vitest) | `pnpm test` |
| E2E tests (Playwright, mobile Chromium) | `pnpm test:e2e` |
| Lint / typecheck | `pnpm lint && pnpm typecheck` |
| Regenerate icons from `public/icon.svg` | `pnpm generate-pwa-assets` |

The first `pnpm test:e2e` on a machine needs the browser:
`pnpm exec playwright install chromium`. E2E runs against `pnpm build && pnpm preview`
on port 4173, because the service worker exists only in the production build.

## Publishing

The app is a static site; there is no server. It is published on **Firebase
Hosting**, project `grajek-app`, at https://grajek-app.web.app.

Publishing happens only in GitHub Actions (`.github/workflows/ci.yml`); there is
no local deploy. Both deploys run only after all checks (lint, typecheck, unit
tests, build, e2e) pass, and they publish the exact `dist/` those checks built:

- **Pull requests** from a branch of this repository get a Firebase preview
  channel. The link is posted as a comment on the PR and updated on later
  pushes; a preview channel expires after 7 days. PRs from forks run the checks
  but get no preview.
- **Every push to `main`** (a merge) deploys the live site.

`.firebaserc` selects the `grajek-app` project, and `firebase.json` serves `dist/`
with an SPA rewrite to `index.html` and the cache headers listed below.

After the first online visit the service worker precaches the whole app; a new
version is fetched in the background and takes over on the next launch.

### One-time setup

The deploy jobs need the repository secret `FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP`
(the JSON key of a service account that may deploy to Hosting). Create it in one
of two ways:

**(a) With the Firebase CLI.** Run `npx firebase-tools init hosting:github` in
this repository, pick project `grajek-app` and enter the repository
`piotrczyz/grajek`. It creates the service account and stores its key as the
secret `FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP`. Answer "no" when it asks to set up
a build script or to deploy on merge/PR, or delete the generated
`.github/workflows/firebase-hosting-*.yml` files before committing: `ci.yml`
already deploys, and those workflows would deploy a second time without the
checks.

**(b) By hand.**

1. In the Google Cloud console, open project `grajek-app`, go to **IAM & Admin >
   Service Accounts** and create a service account with the role
   **Firebase Hosting Admin**.
2. On that account, open **Keys > Add key > Create new key**, choose JSON and
   download it as `key.json`.
3. Store it as the secret:
   `gh secret set FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP -R piotrczyz/grajek < key.json`
   (or paste it under **Settings > Secrets and variables > Actions** on GitHub).
4. Delete the local `key.json`.

### Other static hosts

The build is host-agnostic, so `dist/` also works on any other static host:

1. Upload the contents of `dist/`. It works at the domain root or under any
   sub-path (for example `https://example.org/grajek/`): asset URLs, `start_url`
   and `scope` are relative.
2. Serve it over **HTTPS**. Service workers, offline use and installation only
   work on HTTPS (or `localhost`).
3. Set cache headers (the same rules `firebase.json` applies):
   - **No caching** (`Cache-Control: no-cache`) for `index.html`, `sw.js`,
     `registerSW.js` (if present), `workbox-*.js` and `manifest.webmanifest`, so
     students receive updates.
   - **Long caching** (`Cache-Control: public, max-age=31536000, immutable`) for
     `assets/`, whose file names carry a content hash.
4. Serve `manifest.webmanifest` as `application/manifest+json` (most hosts do).

## Project layout

- `src/App.tsx` - welcome screen
- `src/storage/` - IndexedDB contract: `openDb()`, ordered `migrations`,
  `requestPersistentStorage()`. Change the schema only by appending a migration.
- `public/` - icon source (`icon.svg`) and generated PNG icons
- `e2e/` - Playwright tests (offline reload, installability)
