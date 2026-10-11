# Offline-capable installable app skeleton — Implementation Plan

## Overview
Delivers roadmap foundation F-01: the first code in the Grajek repository. A
React + TypeScript + Vite single-page PWA that a pupil can add to the home
screen on Android and iOS and open without internet, showing a Polish,
child-friendly welcome screen "Grajek". It also lays down the minimal on-device
storage contract (IndexedDB, no product data) and a host-agnostic static build
(`dist/`), so S-01 and later slices build features rather than plumbing.

## Current State Analysis
- Greenfield: the repository holds only `context/` documents; no `package.json`,
  lockfile, source or test setup (`git ls-files` at 6b5ccb7; roadmap
  `## Baseline` lists frontend/data/deploy as absent).
- The stack is declared, not built: `context/foundation/tech-stack.md`
  (React SPA, Vite static output in `dist/`, `vite-plugin-pwa`, Tailwind,
  IndexedDB behind a small storage contract, Vitest, Playwright, pnpm,
  commands `pnpm build|test|test:e2e|lint|typecheck`).
- The only Open Stack Question (deploy target, tech-stack.md
  `## Open Stack Questions` 1) is explicitly not needed for building; this
  change keeps the build host-agnostic and does not depend on it.
- Product constraints that shape the skeleton: PRD NFR Offline, Urządzenia
  (Android + iOS, installable, portrait, mobile-first), Czytelność dla dzieci
  7–13 (large touch targets, little text, Polish, encouraging tone),
  Prywatność (no analytics, no third-party trackers) — `context/prd/prd.md:103-106`.
- ADR 0001 (`context/discovery/decisions/0001-serwer-powiadomien-z-minimalnymi-danymi.md`)
  commits the product to push notifications later; these need a service worker
  we can extend, which shapes the service-worker strategy below.
- Local tooling: Node 24.19, pnpm 12.9.1.

## Desired End State
- `pnpm install --frozen-lockfile && pnpm build` produces a static `dist/`
  (HTML, JS, CSS, icons, `manifest.webmanifest`, service worker) that any HTTPS
  static host can serve.
- Opening the built app shows a single welcome screen: the name "Grajek", a
  short encouraging Polish line, a friendly music illustration; large type,
  high contrast, portrait-first, `<html lang="pl">`.
- Android/Chromium reports the app as installable (manifest with name, icons
  192/512 + maskable, `display: standalone`, `start_url`, `scope`,
  `lang: pl`); iOS Safari gets an `apple-touch-icon` (180×180) and the
  `apple-mobile-web-app-*` meta tags so "Add to Home Screen" yields a named,
  iconed, standalone app.
- After the first online visit, the app reloads and renders with the network
  offline (precached app shell, navigation fallback to `index.html`).
- `src/storage/` exposes a small, platform-neutral storage contract with an
  IndexedDB implementation (versioned database, upgrade hook for later slices,
  only a `meta` store) and an in-memory implementation, unit-tested.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` all pass.

### Key discoveries
- No code to conform to; conventions come from `context/foundation/tech-stack.md`
  (`## Commands`, `## Decisions`).
- Glossary (`context/discovery/glossary.md`) fixes the Polish domain words for
  later slices (Uczeń, Profil, Ćwiczenie); the skeleton uses none of them in
  data, only "Grajek" in copy.
- iOS installs PWAs only via Safari "Add to Home Screen" and reads
  `apple-touch-icon` / `apple-mobile-web-app-*` rather than manifest icons on
  older versions — hence both sets (roadmap F-01 Risk).

## What we're NOT doing
- No product feature: no Profil, instrument, Ćwiczenie, calendar, navigation,
  settings (S-01 onward).
- No product data in storage: only the contract, the `meta` store and its
  schema version.
- No deploy target, domain, hosting config files for a specific provider, or
  CI workflow (deploy target is an open client question; the repo has no
  remote yet).
- No push notifications, notification permission prompt or anonymous device
  registration (F-02 / S-08); the service worker is merely kept extensible.
- No iOS launch (splash) images, no in-app "install" prompt/button, no update
  prompt UI, no dark mode, no i18n framework (Polish only, hard-coded copy).
- No analytics, web fonts from a CDN or any third-party request (NFR Prywatność).
- No native packaging (Capacitor/React Native); only kept possible.

## Implementation Approach
Hand-scaffold a Vite React-TS project (not an interactive `create-vite` run)
so every file is intentional: strict TypeScript, Tailwind v4 via its Vite
plugin, ESLint flat config, Vitest (jsdom) for unit/component tests and
Playwright (Chromium, mobile viewport) against `vite preview` of the
production build for PWA behaviour — the service worker only exists in the
production build, so E2E must not run against the dev server.

Service worker: `vite-plugin-pwa` in `injectManifest` mode with a small
`src/sw.ts` (Workbox precache of the build + navigation fallback to
`index.html`, `autoUpdate` registration). Chosen over `generateSW` because
ADR 0001 requires push handling in the same worker later; with
`injectManifest` F-02/S-08 add a `push` listener to our own file instead of
migrating the strategy. Auto-update without a prompt suits 7–13 year olds
(no technical dialog); a new version takes over on the next launch.

Icons: one source SVG (`public/icon.svg`) and PNGs generated by
`@vite-pwa/assets-generator` (minimal-2023 preset: 64/192/512, maskable 512,
apple-touch 180), committed to `public/` so the build needs no generation step;
a `generate-pwa-assets` script regenerates them.

Storage: a platform-neutral `KeyValueStore`-style contract (async
get/set/remove for JSON-serialisable values within named stores) plus
`openAppStorage()` returning the IndexedDB implementation (via `idb`, ~1 kB
promise wrapper) and `createMemoryStorage()` for tests and as a fallback when
IndexedDB is unavailable. Later slices add stores through numbered upgrade
steps; a native app later can implement the same contract over SQLite or
Preferences, which is why components never touch IndexedDB directly. A
best-effort `requestPersistence()` (`navigator.storage.persist()`) is part of
the contract because browser eviction is the main data-loss risk (roadmap
Open Question 2); the welcome screen does not call it yet.

Publication: `pnpm build` → `dist/`; base path defaults to `/` and is
overridable at build time (`BASE_PATH`), with manifest `start_url`/`scope`
derived from it, so a sub-path host stays possible without code changes.
README documents serving requirements (HTTPS, SPA fallback to `index.html`,
no long-term caching of `sw.js`/`index.html`).

Alternatives rejected: `generateSW` (would need migration for push);
raw IndexedDB API (more error-prone boilerplate for no gain); localStorage
(synchronous, small quota, string-only, evicted the same way); Playwright
WebKit project (service-worker/offline emulation in Playwright WebKit is not
reliable on Windows; iOS is covered by a Manual criterion).

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Installable offline PWA skeleton with welcome screen and storage contract | 1-3 | — | yes | pending | — |

## Critical Implementation Details

### Testing the offline reload
- Run E2E against `pnpm build && pnpm preview --port 4173 --strictPort`
  (Playwright `webServer`), never `pnpm dev`.
- Wait until the service worker controls the page
  (`navigator.serviceWorker.ready` and then `navigator.serviceWorker.controller`
  non-null, reloading once if needed) before `context.setOffline(true)`;
  otherwise the reload hits the network and the test is flaky.
- Installability: in Chromium use a CDP session and
  `Page.getInstallabilityErrors`; an empty list is the pass condition.
- Playwright browsers are not installed by `pnpm install`: run
  `pnpm exec playwright install chromium` once per machine (document in README).

### UX spec for the welcome screen
- Copy (Polish, exact): heading `Grajek`; line `Cześć! Tu zapiszesz swoje granie.`;
  smaller line `Działa też bez internetu.` Nothing else interactive.
- Body text ≥ 20 px, heading ≥ 48 px, contrast ≥ 4.5:1, content fits a
  360×640 portrait viewport without scrolling, respects safe areas
  (`viewport-fit=cover` + padding with `env(safe-area-inset-*)`).
- System font stack only; illustration is inline SVG (no network request).

## Phase 1: Toolchain and welcome screen
### Overview
A buildable, linted, typed React app rendering the Polish welcome screen,
with Vitest set up and a component test.

### Required changes
#### 1. Project manifest and tooling
- **File**: `package.json`, `pnpm-lock.yaml`, `.gitignore`, `.nvmrc`
- **Goal**: Declare the project and its commands exactly as tech-stack.md
  `## Commands` lists them.
- **Contract**: scripts `dev`, `build` (`tsc -b && vite build`), `preview`,
  `test` (`vitest run`), `test:e2e` (`playwright test`), `lint` (`eslint .`),
  `typecheck` (`tsc -b --noEmit` or equivalent), `generate-pwa-assets`
  (added in Phase 2); `"type": "module"`; `engines.node >=20`;
  `packageManager` pinned to the local pnpm; `.gitignore` covers
  `node_modules`, `dist`, `dev-dist`, `coverage`, `test-results`,
  `playwright-report`.

#### 2. TypeScript, Vite, ESLint, Vitest config
- **File**: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`,
  `vite.config.ts`, `eslint.config.js`, `src/vite-env.d.ts`, `src/test/setup.ts`
- **Goal**: Strict TS for app and config code; Vite with the React and
  Tailwind plugins; ESLint flat config (typescript-eslint, react-hooks,
  react-refresh); Vitest configured inside `vite.config.ts` (jsdom,
  `@testing-library/jest-dom` setup, `e2e/` excluded).
- **Contract**: `strict: true`; Vitest `environment: 'jsdom'`,
  `include: ['src/**/*.test.{ts,tsx}']`.

#### 3. HTML entry and app shell
- **File**: `index.html`, `src/main.tsx`, `src/index.css`
- **Goal**: Polish document (`<html lang="pl">`, `<title>Grajek</title>`,
  `viewport` with `viewport-fit=cover`, `theme-color`), Tailwind import and
  base styles (system font stack, background colour, safe-area padding).

#### 4. Welcome screen
- **File**: `src/App.tsx`, `src/components/WelcomeScreen.tsx`,
  `src/components/WelcomeScreen.test.tsx`
- **Goal**: The single screen per the UX spec above, with an inline SVG
  music illustration marked decorative (`aria-hidden`).
- **Contract**: heading role `heading` with name `Grajek`; copy exactly as in
  the UX spec.

### Success criteria
#### Automated
- `pnpm install --frozen-lockfile` succeeds on a clean checkout
- `pnpm typecheck` and `pnpm lint` pass with no errors
- `pnpm test` passes, including a test that the welcome screen renders the heading "Grajek" and the Polish greeting
- `pnpm build` produces `dist/index.html` containing `lang="pl"`
#### Manual
- On a 360×640 portrait viewport the welcome screen fits without scrolling and reads as large and friendly for a 7-year-old

## Phase 2: PWA, offline and static publication
### Overview
Make the build installable on Android and iOS and fully usable offline, prove
it with Playwright against the production preview, and document publication.

### Required changes
#### 1. Icons
- **File**: `public/icon.svg`, `public/pwa-64x64.png`, `public/pwa-192x192.png`,
  `public/pwa-512x512.png`, `public/maskable-icon-512x512.png`,
  `public/apple-touch-icon-180x180.png`, `public/favicon.ico`,
  `pwa-assets.config.ts`
- **Goal**: A simple, friendly music-note icon on a solid background (safe
  zone respected for maskable), generated from the SVG by
  `@vite-pwa/assets-generator` (`minimal2023Preset`) and committed.

#### 2. Manifest, iOS tags and service worker registration
- **File**: `vite.config.ts`, `index.html`, `src/sw.ts`, `src/main.tsx`,
  `tsconfig.app.json` (WebWorker lib for `sw.ts` if needed)
- **Goal**: `vite-plugin-pwa` in `injectManifest` mode with
  `registerType: 'autoUpdate'` and `injectRegister: 'auto'` (or
  `virtual:pwa-register` called from `main.tsx`); `src/sw.ts` precaches the
  injected manifest, cleans outdated caches, claims clients and serves
  `index.html` for navigation requests; `index.html` gets
  `<link rel="apple-touch-icon" href="apple-touch-icon-180x180.png">`,
  `<link rel="icon">`, `apple-mobile-web-app-capable`,
  `mobile-web-app-capable`, `apple-mobile-web-app-title` = `Grajek`,
  `apple-mobile-web-app-status-bar-style`.
- **Contract**: manifest `name: "Grajek"`, `short_name: "Grajek"`,
  `lang: "pl"`, `description` in Polish, `display: "standalone"`,
  `orientation: "portrait"`, `start_url` and `scope` = the base path,
  `theme_color`/`background_color` matching the CSS, icons 64/192/512 + a
  512 `purpose: "maskable"`; precache globs include `html, js, css, svg, png,
  ico, webmanifest`; `base` = `process.env.BASE_PATH ?? '/'`.

#### 3. E2E suite against the production preview
- **File**: `playwright.config.ts`, `e2e/pwa.spec.ts`, `tsconfig.node.json`
  (include e2e/config if needed)
- **Goal**: One Chromium project with a mobile device profile (e.g. Pixel 7);
  `webServer` runs `pnpm build && pnpm preview --port 4173 --strictPort`.
  Tests: manifest is linked and has the contract fields and reachable icons;
  iOS link/meta tags are present and `apple-touch-icon` returns 200;
  Chromium reports no installability errors; the service worker takes
  control; with the context offline a reload still shows "Grajek" and the
  Polish greeting.

#### 4. Publication docs
- **File**: `README.md`
- **Goal**: English README (project one-liner, prerequisites incl.
  `pnpm exec playwright install chromium`, the commands, and a
  "Publishing" section: `pnpm build` → upload `dist/` to any HTTPS static
  host, SPA fallback to `index.html`, `sw.js` and `index.html` served with
  `Cache-Control: no-cache`, `BASE_PATH` for sub-path hosting; deploy target
  still open per tech-stack.md).

### Success criteria
#### Automated
- `pnpm build` emits `dist/manifest.webmanifest`, `dist/sw.js` and all icons referenced by the manifest
- `pnpm test:e2e` passes: manifest fields and icons, iOS meta tags and apple-touch-icon, no Chromium installability errors
- `pnpm test:e2e` passes: after the service worker takes control, an offline reload still shows the welcome screen
- `pnpm lint` and `pnpm typecheck` pass including `src/sw.ts`, `playwright.config.ts` and `e2e/`
#### Manual
- On an Android phone (Chrome) the app can be installed to the home screen and opens offline as a standalone "Grajek" app with its icon
- On an iPhone (Safari, "Add to Home Screen") the app appears as "Grajek" with its icon, opens standalone and shows the welcome screen in airplane mode

## Phase 3: On-device storage contract
### Overview
The minimal, platform-neutral storage contract later slices use for Profil
and Ćwiczenie data, with IndexedDB and in-memory implementations and unit
tests. No product data, no UI wiring.

### Required changes
#### 1. Contract
- **File**: `src/storage/types.ts`, `src/storage/index.ts`
- **Goal**: Define the interface components and later slices depend on,
  independent of IndexedDB so a native implementation can replace it.
- **Contract**: `AppStorage` with `get<T>(store, key): Promise<T | undefined>`,
  `set<T>(store, key, value): Promise<void>`, `remove(store, key): Promise<void>`,
  `keys(store): Promise<string[]>`, `close(): void`; store names typed as a
  union (`'meta'` only for now); values must be structured-cloneable plain data;
  `openAppStorage(): Promise<AppStorage>` (IndexedDB, falls back to memory when
  `indexedDB` is unavailable), `createMemoryStorage(): AppStorage`,
  `requestPersistence(): Promise<boolean>` (best-effort, `false` when
  unsupported).

#### 2. IndexedDB implementation
- **File**: `src/storage/indexeddb.ts`, `package.json` (add `idb`)
- **Goal**: Database `grajek`, `DB_VERSION = 1`; an ordered list of upgrade
  steps keyed by version (step 1 creates the `meta` store and writes
  `schemaVersion`), so later slices append steps without touching earlier
  ones.
- **Contract**: exported `DB_NAME`, `DB_VERSION`; upgrade steps run in order
  from `oldVersion + 1` to `DB_VERSION`.

#### 3. Memory implementation and tests
- **File**: `src/storage/memory.ts`, `src/storage/storage.test.ts`,
  `package.json` (add dev dependency `fake-indexeddb`)
- **Goal**: Same behaviour as IndexedDB for the contract; a shared test suite
  runs against both implementations (IndexedDB via `fake-indexeddb/auto`).
- **Contract**: tests cover set/get round trip of an object, missing key →
  `undefined`, remove, keys, persistence across close and reopen (IndexedDB),
  `meta.schemaVersion === DB_VERSION` after open, fallback to memory when
  `indexedDB` is undefined, and `requestPersistence()` resolving `false`
  without `navigator.storage`.

### Success criteria
#### Automated
- `pnpm test` passes the storage contract suite against both the IndexedDB (fake-indexeddb) and the memory implementation
- `pnpm typecheck`, `pnpm lint` and `pnpm build` pass with the storage module included
- `pnpm test:e2e` still passes (storage adds no regressions to installability or offline reload)

## Testing Strategy
- Unit/component (Vitest, jsdom): welcome screen copy and heading; storage
  contract suite run against both implementations with `fake-indexeddb`.
- E2E (Playwright, Chromium mobile profile, production preview): manifest,
  icons, iOS tags, CDP installability, service-worker control, offline reload.
- Manual: real Android and iPhone install + airplane-mode launch (Playwright
  cannot emulate the iOS home-screen install).

## Performance Notes
- Keep the initial bundle small (React + one screen + Tailwind output); no
  web fonts or images other than the inline SVG and icons, so the first offline
  launch is effectively instant (PRD NFR Szybkość).

## References
- Roadmap slice F-01: `context/foundation/roadmap.md` (`### F-01`)
- Stack: `context/foundation/tech-stack.md`
- PRD NFRs: `context/prd/prd.md:102-107`
- ADR 0001 (push later → extensible service worker):
  `context/discovery/decisions/0001-serwer-powiadomien-z-minimalnymi-danymi.md`
- Product shape: `context/discovery/discovery-notes.md` `## Forward: tech-stack`

## Progress

### Phase 1: Toolchain and welcome screen
#### Automated
- [ ] 1.1 `pnpm install --frozen-lockfile` succeeds on a clean checkout
- [ ] 1.2 `pnpm typecheck` and `pnpm lint` pass with no errors
- [ ] 1.3 `pnpm test` passes, including a test that the welcome screen renders the heading "Grajek" and the Polish greeting
- [ ] 1.4 `pnpm build` produces `dist/index.html` containing `lang="pl"`
#### Manual
- [ ] 1.5 On a 360×640 portrait viewport the welcome screen fits without scrolling and reads as large and friendly for a 7-year-old

### Phase 2: PWA, offline and static publication
#### Automated
- [ ] 2.1 `pnpm build` emits `dist/manifest.webmanifest`, `dist/sw.js` and all icons referenced by the manifest
- [ ] 2.2 `pnpm test:e2e` passes: manifest fields and icons, iOS meta tags and apple-touch-icon, no Chromium installability errors
- [ ] 2.3 `pnpm test:e2e` passes: after the service worker takes control, an offline reload still shows the welcome screen
- [ ] 2.4 `pnpm lint` and `pnpm typecheck` pass including `src/sw.ts`, `playwright.config.ts` and `e2e/`
#### Manual
- [ ] 2.5 On an Android phone (Chrome) the app can be installed to the home screen and opens offline as a standalone "Grajek" app with its icon
- [ ] 2.6 On an iPhone (Safari, "Add to Home Screen") the app appears as "Grajek" with its icon, opens standalone and shows the welcome screen in airplane mode

### Phase 3: On-device storage contract
#### Automated
- [ ] 3.1 `pnpm test` passes the storage contract suite against both the IndexedDB (fake-indexeddb) and the memory implementation
- [ ] 3.2 `pnpm typecheck`, `pnpm lint` and `pnpm build` pass with the storage module included
- [ ] 3.3 `pnpm test:e2e` still passes (storage adds no regressions to installability or offline reload)
