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

1. Run `pnpm build` (static output in `dist/`).
2. Once per machine, log in: `npx firebase-tools login`.
3. Deploy: `npx firebase-tools deploy --only hosting`.

`firebase-tools` is not a project dependency; `npx` fetches it on demand.
`.firebaserc` selects the `grajek-app` project, and `firebase.json` serves `dist/`
with an SPA rewrite to `index.html` and the cache headers listed below. CI only
checks and builds; it does not deploy.

After the first online visit the service worker precaches the whole app; a new
version is fetched in the background and takes over on the next launch.

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
