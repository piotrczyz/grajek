# Offline-capable installable app skeleton — Implementation Plan

## Overview
Roadmap foundation F-01: the first code in the Grajek repo. A Uczeń can add the
app to the home screen of an Android or iOS phone and open it without internet,
landing on a Polish, child-readable welcome screen "Grajek". The change also lays
the minimal on-device storage contract (IndexedDB open + versioned migrations +
persistence request, no product data) and the host-agnostic static build that
later slices (S-01 onward) build on.

## Current State Analysis
- Greenfield: the repo holds only `context/` documents; no manifest, lockfile or
  source (`git ls-files` at `6b5ccb7`; `context/foundation/tech-stack.md`
  "Evidence: greenfield").
- Stack is declared, not installed: React + TypeScript (strict) + Vite +
  `vite-plugin-pwa`, Tailwind, IndexedDB, Vitest, Playwright, pnpm
  (`context/foundation/tech-stack.md` Frontend / Data & Storage / Testing).
- Commands the plan must make real: `pnpm install --frozen-lockfile`,
  `pnpm build`, `pnpm test`, `pnpm test:e2e`, `pnpm lint && pnpm typecheck`
  (`tech-stack.md` `## Commands`).
- Deploy target is an Open Stack Question owned by the client
  (`tech-stack.md` `## Open Stack Questions` #1; roadmap Open Roadmap Question #4).
  This change does not depend on it: output stays a static `dist/`.
- Product constraints that reach the skeleton: no third-party trackers or
  requests (PRD NFR Prywatność), works offline (NFR Offline), Android + iOS,
  installable, portrait, mobile-first (NFR Urządzenia), large touch targets,
  little text, Polish, encouraging tone (NFR Czytelność dla dzieci 7–13).

## Desired End State
- `pnpm build` produces `dist/` with `index.html`, hashed assets, a web app
  manifest, icons and a service worker that precaches the whole app shell.
- Served over HTTPS (or `localhost`) from any static host, under any path, the
  app is installable on Android (Chrome install criteria met: manifest with
  name, icons 192/512 incl. maskable, `display: standalone`, `start_url`, SW)
  and can be added to the iOS home screen with its own icon and title
  (`apple-touch-icon`, iOS web-app meta tags).
- After the first online visit, reloading with the network off still shows the
  welcome screen: heading "Grajek", one short encouraging Polish sentence, an
  app mark; `<html lang="pl">`; large type and high contrast.
- `src/storage/` exposes `openDb()`, the migration list and
  `requestPersistentStorage()`, unit-tested under Vitest with `fake-indexeddb`.
- Lint, typecheck, unit and e2e suites pass; README documents how to build and
  publish the static output.

### Key discoveries
- No code exists to reuse or conflict with (greenfield, `tech-stack.md` header).
- The "native later" path named in `context/discovery/discovery-notes.md`
  `## Forward: tech-stack` is Capacitor / React Native; Capacitor runs the same
  web code (IndexedDB included), so no backend-swappable storage layer is needed
  now (Consult, see brief).
- iOS evicts storage of non-installed sites; PRD Open Question #2 is about data
  loss, so asking for persistent storage belongs in the foundation
  (`context/prd/prd.md` Open Questions #2).

## What we're NOT doing
- No product feature: no Profil, Ćwiczenie, Cel tygodniowy, navigation or
  routing (S-01..S-09).
- No product object stores or entity types in IndexedDB; no generic key-value
  or collection abstraction; no export/import (PRD Open Question #2, client's
  call).
- No in-app install prompt or install instructions screen.
- No push notifications, no server, no F-02 work.
- No deploy target, domain or hosting configuration; no deploy job in CI.
- No analytics, external fonts, CDNs or any third-party request.
- No final brand artwork: the icon is a simple placeholder mark generated from
  one SVG source; replacing it later only swaps the source file.
- No WebKit run in Playwright (see Testing Strategy); iOS is checked manually.

## Implementation Approach
A single-package Vite + React + TypeScript SPA at the repo root, managed with
pnpm. `vite-plugin-pwa` (generateSW, Workbox) produces the manifest and a
service worker that precaches every build asset and serves `index.html` as the
navigation fallback; `registerType: 'autoUpdate'` because the shell holds no
user state that an update could disrupt. Vite `base: './'` with manifest
`start_url` / `scope` relative (`.`/`./`) keeps the build host- and
path-agnostic, so the open deploy-target question never blocks it. Icons are
generated once from `public/` SVG source with `@vite-pwa/assets-generator`
(minimal 2023 preset: 64/192/512, maskable 512, apple-touch 180) and committed,
so builds need no image tooling. iOS support comes from explicit `<head>` tags
(apple-touch-icon, `apple-mobile-web-app-title`, `mobile-web-app-capable` /
`apple-mobile-web-app-capable`, status-bar style, `viewport-fit=cover`) because
Safari ignores most of the manifest. Tailwind v4 via its Vite plugin with the
system font stack (no font download, offline and privacy-safe).

Storage: `openDb()` wraps the `idb` library over one database `grajek`; its
version equals the length of an ordered migration list, and the upgrade
callback runs every migration from `oldVersion` up. Migration 1 is an
intentional no-op ("initial"), so later slices add stores by appending a
migration. `requestPersistentStorage()` calls `navigator.storage.persist()`
best-effort, returns a boolean, never throws, and is invoked once at app start.
Alternatives rejected: a KV `AppStorage` interface or collection registry (would
be bypassed by week/month queries in S-02/S-04 and guesses entity shapes),
raw IndexedDB without `idb` (more hand-written promise code for no gain).

Testing: Vitest (jsdom) for the welcome screen and storage; Playwright against
`vite preview` of the production build (the SW exists only there) on a mobile
Chromium profile for installability and offline reload.

Alternatives for the layout: a pnpm workspace (`apps/web`) was rejected as
premature; F-02 can add a `server/` package later without moving the app.

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Offline app skeleton (area A1 offline-app-skeleton) | 1-4 | — | yes | in-progress | — |

## Critical Implementation Details

### Timing & lifecycle
- Offline e2e must wait until the service worker controls the page
  (`navigator.serviceWorker.ready` and `navigator.serviceWorker.controller`
  non-null, reload once if needed) before switching the context offline;
  otherwise the test is flaky.
- `sw.js`, `registerSW.js`, `manifest.webmanifest` and `index.html` must not be
  served with long-lived cache headers; README states this for whichever host
  is chosen.

### UX spec (welcome screen)
- One screen, portrait, centred: the app mark, heading "Grajek" (very large),
  one sentence "Cześć! Tu zapiszesz swoje ćwiczenia na instrumencie."
  (gender-neutral, encouraging), no buttons, no links, nothing scrollable.
- Base font size at least 18 px, heading at least 40 px, text/background
  contrast at least WCAG AA; respects safe-area insets.
- `theme_color` / `background_color` match the screen's background so the
  Android splash and iOS status bar blend in.

## Phase 1: Project scaffold and welcome screen
### Overview
A buildable, linted, tested React + TS + Vite + Tailwind app showing the
welcome screen (not yet a PWA).

### Required changes
#### 1. Package and tooling
- **File**: `package.json`, `pnpm-lock.yaml`, `.npmrc` (only if needed), `.gitignore`, `.nvmrc`
- **Goal**: declare the toolchain and the scripts named in `tech-stack.md`.
- **Contract**: scripts `dev`, `build` (typecheck-free `vite build`), `preview`,
  `test` (`vitest run`), `test:e2e` (Playwright, added in Phase 3),
  `lint` (ESLint), `typecheck` (`tsc -b` / `tsc --noEmit`); `engines.node >= 20`;
  `packageManager` set to the local pnpm; `.gitignore` covers `node_modules`,
  `dist`, `dev-dist`, `test-results`, `playwright-report`, `coverage`.

#### 2. TypeScript, Vite, lint config
- **File**: `tsconfig.json` (+ `tsconfig.node.json` if split), `vite.config.ts`, `eslint.config.js`
- **Goal**: strict TS, React plugin, Tailwind Vite plugin, `base: './'`;
  ESLint flat config with typescript-eslint and react-hooks rules.
- **Contract**: `strict: true`; Vitest config (jsdom environment, setup file)
  lives in `vite.config.ts` or `vitest.config.ts`.

#### 3. Entry and welcome screen
- **File**: `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`
- **Goal**: render the welcome screen per the UX spec; `<html lang="pl">`,
  Polish `<title>Grajek</title>`, mobile viewport with `viewport-fit=cover`.
- **Contract**: `App` renders a heading with accessible name "Grajek" and the
  greeting sentence; Tailwind imported in `src/index.css`; system font stack.

#### 4. Unit test setup and welcome test
- **File**: `src/test/setup.ts`, `src/App.test.tsx`
- **Goal**: Testing Library + jest-dom matchers; prove the screen content.
- **Contract**: test asserts the heading "Grajek" and the Polish greeting.

### Success criteria
#### Automated
- `pnpm install --frozen-lockfile` succeeds on a clean checkout
- `pnpm lint` and `pnpm typecheck` pass
- `pnpm test` passes, including the welcome screen test
- `pnpm build` produces `dist/index.html` containing `lang="pl"`
#### Manual
- Welcome screen in a 390x844 mobile viewport is centred, readable for a child and has no scrolling

## Phase 2: On-device storage contract
### Overview
The minimal IndexedDB contract later slices build on, with no product data.

### Required changes
#### 1. Storage module
- **File**: `src/storage/db.ts`, `src/storage/migrations.ts`, `src/storage/persist.ts`, `src/storage/index.ts`
- **Goal**: one place that opens the `grajek` database and evolves its schema
  through ordered migrations; best-effort persistent storage request.
- **Contract**:
  - `DB_NAME = 'grajek'`.
  - `type Migration = (db, tx) => void`; `migrations: readonly Migration[]`
    where index 0 is migration to version 1 (no-op "initial").
  - `openDb(options?: { name?: string; migrations?: readonly Migration[] }): Promise<IDBPDatabase>`
    opens at version `migrations.length` and runs migrations
    `oldVersion .. newVersion-1` in order inside the upgrade transaction.
    Overrides exist for tests only.
  - `requestPersistentStorage(): Promise<boolean>` returns `true` only when the
    browser grants persistence; `false` when the API is missing, denied or
    throws.
  - Module docblock states the rule for later slices: append a migration, never
    edit or reorder an existing one.

#### 2. App start hook-up
- **File**: `src/main.tsx`
- **Goal**: call `requestPersistentStorage()` once at start, fire-and-forget;
  do not open the DB yet (nothing to store).
- **Contract**: failure never blocks rendering.

#### 3. Tests
- **File**: `src/storage/db.test.ts`, `src/storage/persist.test.ts`
- **Goal**: prove the contract with `fake-indexeddb` (dev dependency).
- **Contract**: tests cover opening a fresh DB at version 1; an injected
  two-migration list run on a fresh DB creates both effects in order; re-opening
  a version-1 DB with a longer list runs only the new migration; the shipped
  `migrations` list has length 1 and creates no object store;
  `requestPersistentStorage` returns `true`/`false`/`false` for granted, denied
  and missing `navigator.storage`.

### Success criteria
#### Automated
- `pnpm test` passes including the storage contract tests under fake-indexeddb
- `pnpm lint` and `pnpm typecheck` pass
#### Manual
- None

## Phase 3: Installable offline PWA
### Overview
Manifest, icons, iOS tags and a precaching service worker; proven by Playwright.

### Required changes
#### 1. Icons
- **File**: `public/icon.svg` (source), `public/favicon.ico` or `public/favicon.svg`, `public/pwa-64x64.png`, `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/maskable-icon-512x512.png`, `public/apple-touch-icon-180x180.png`, `pwa-assets.config.ts`
- **Goal**: a simple placeholder mark (music note on the theme colour) and
  every size Android and iOS need; generated with `@vite-pwa/assets-generator`
  (dev dependency, script `generate-pwa-assets`) and committed.
- **Contract**: PNGs exist at the listed sizes; maskable icon keeps the mark in
  the safe zone.

#### 2. PWA plugin and manifest
- **File**: `vite.config.ts`
- **Goal**: `vite-plugin-pwa` with generateSW, `registerType: 'autoUpdate'`,
  precache of all `js,css,html,svg,png,ico,webmanifest`, navigate fallback to
  `index.html`, no runtime caching of external origins.
- **Contract**: manifest `name: "Grajek"`, `short_name: "Grajek"`, `lang: "pl"`,
  Polish `description`, `display: "standalone"`, `orientation: "portrait"`,
  relative `start_url` and `scope`, `theme_color` and `background_color`,
  icons 192, 512 and 512 maskable.

#### 3. SW registration and iOS head tags
- **File**: `src/main.tsx` (registration via `virtual:pwa-register`), `index.html`, `src/vite-env.d.ts`
- **Goal**: register the SW in production; iOS home-screen support.
- **Contract**: `index.html` has `link rel="apple-touch-icon"` (180), `link rel="icon"`,
  `meta name="theme-color"`, `apple-mobile-web-app-capable` and
  `mobile-web-app-capable` = `yes`, `apple-mobile-web-app-title` = `Grajek`,
  `apple-mobile-web-app-status-bar-style`; manifest link injected by the plugin.

#### 4. Playwright e2e
- **File**: `playwright.config.ts`, `e2e/offline.spec.ts`, `e2e/installability.spec.ts`, `package.json` (script `test:e2e`, dev dependency)
- **Goal**: prove offline reload and install metadata on the production build.
- **Contract**: `webServer` runs `pnpm build && pnpm preview` on a fixed port;
  one project on a mobile Chromium device profile (e.g. Pixel 7).
  `offline.spec`: first visit, wait for SW control, `context.setOffline(true)`,
  reload, heading "Grajek" visible. `installability.spec`: manifest link
  resolves; manifest has the contract fields and every listed icon URL returns
  200 with an image content type; `apple-touch-icon` link resolves; `html[lang=pl]`.

### Success criteria
#### Automated
- `pnpm build` emits `dist/sw.js` and `dist/manifest.webmanifest`
- `pnpm test:e2e` passes: offline reload shows the welcome screen
- `pnpm test:e2e` passes: manifest, icons and iOS head tags are served correctly
- `pnpm lint`, `pnpm typecheck` and `pnpm test` still pass
#### Manual
- On an Android phone (Chrome, HTTPS host) the app installs to the home screen and opens offline in standalone mode
- On an iPhone (Safari, HTTPS host) "Add to Home Screen" shows the Grajek icon and title, and the app opens offline
- Chrome DevTools Lighthouse / Application panel reports the app as installable with no manifest errors

## Phase 4: Static publication and CI
### Overview
Make the publication method explicit and keep it checked on every push.

### Required changes
#### 1. README
- **File**: `README.md`
- **Goal**: English developer README (rs-core §5 for
  repo prose) covering prerequisites (Node 20+, pnpm), the commands from
  `tech-stack.md`, and how to publish: upload `dist/` to any static HTTPS host
  under any path; no-cache headers for `index.html`, `sw.js`, `registerSW.js`,
  `manifest.webmanifest`; long-cache for hashed `assets/`; HTTPS required; the
  deploy target is still the client's open decision.
- **Contract**: commands in README match `package.json` scripts.

#### 2. CI workflow
- **File**: `.github/workflows/ci.yml`
- **Goal**: GitHub Actions (tech-stack default) running install (frozen
  lockfile), lint, typecheck, unit tests, build and Playwright (chromium) on
  push and pull request; no deploy job.
- **Contract**: Node 20+, pnpm via `pnpm/action-setup`, uploads the Playwright
  report on failure.

### Success criteria
#### Automated
- `.github/workflows/ci.yml` is valid YAML and runs the same scripts as `package.json`
- Full local run passes: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`
#### Manual
- README publication steps are enough for someone to serve `dist/` from a static host under a sub-path

## Testing Strategy
- **Unit (Vitest, jsdom):** welcome screen content; storage contract with
  `fake-indexeddb` (fresh open, ordered migrations, incremental upgrade,
  shipped list creates no store, persistence request outcomes).
- **E2E (Playwright, mobile Chromium, production build via `vite preview`):**
  offline reload after SW activation; manifest fields, icons and iOS head tags.
  WebKit is not run: Playwright's WebKit does not reproduce iOS home-screen
  behaviour and its SW support on Windows runners is unreliable, so iOS stays a
  Manual criterion on a real device.
- **Manual:** real-device install and offline open on Android and iOS once a
  HTTPS host exists (deploy target is the client's open decision).

## Performance Notes
- The shell is tiny; keep it free of extra runtime dependencies (React,
  react-dom, idb, the PWA register helper only) so first paint is immediate
  (PRD NFR Szybkość).

## Migration Notes
- None: the database starts at version 1 with no stores; there is no existing
  data to migrate.

## References
- Roadmap slice F-01: `context/foundation/roadmap.md` (Foundations, F-01)
- Stack: `context/foundation/tech-stack.md`
- PRD NFRs: `context/prd/prd.md` (Non-Functional Requirements, Open Questions)
- Forward tech-stack note: `context/discovery/discovery-notes.md`
- ADRs: `context/discovery/decisions/0001-serwer-powiadomien-z-minimalnymi-danymi.md`, `0002-grywalizacja-bez-waluty-i-rankingow.md`
- Brief: `context/changes/szkielet-aplikacji-offline/plan-brief.md`

## Progress

### Phase 1: Project scaffold and welcome screen
#### Automated
- [x] 1.1 `pnpm install --frozen-lockfile` succeeds on a clean checkout
- [x] 1.2 `pnpm lint` and `pnpm typecheck` pass
- [x] 1.3 `pnpm test` passes, including the welcome screen test
- [x] 1.4 `pnpm build` produces `dist/index.html` containing `lang="pl"`
#### Manual
- [ ] 1.5 Welcome screen in a 390x844 mobile viewport is centred, readable for a child and has no scrolling

### Phase 2: On-device storage contract
#### Automated
- [ ] 2.1 `pnpm test` passes including the storage contract tests under fake-indexeddb
- [ ] 2.2 `pnpm lint` and `pnpm typecheck` pass
#### Manual

### Phase 3: Installable offline PWA
#### Automated
- [ ] 3.1 `pnpm build` emits `dist/sw.js` and `dist/manifest.webmanifest`
- [ ] 3.2 `pnpm test:e2e` passes: offline reload shows the welcome screen
- [ ] 3.3 `pnpm test:e2e` passes: manifest, icons and iOS head tags are served correctly
- [ ] 3.4 `pnpm lint`, `pnpm typecheck` and `pnpm test` still pass
#### Manual
- [ ] 3.5 On an Android phone (Chrome, HTTPS host) the app installs to the home screen and opens offline in standalone mode
- [ ] 3.6 On an iPhone (Safari, HTTPS host) "Add to Home Screen" shows the Grajek icon and title, and the app opens offline
- [ ] 3.7 Chrome DevTools Lighthouse / Application panel reports the app as installable with no manifest errors

### Phase 4: Static publication and CI
#### Automated
- [ ] 4.1 `.github/workflows/ci.yml` is valid YAML and runs the same scripts as `package.json`
- [ ] 4.2 Full local run passes: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`
#### Manual
- [ ] 4.3 README publication steps are enough for someone to serve `dist/` from a static host under a sub-path
