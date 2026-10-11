---
project: Grajek
context_type: greenfield
created: 2026-10-11
updated: 2026-10-11
source: picked-from-palette
---

# Grajek — Tech Stack

Evidence: greenfield — the repo holds only `context/` documents (git history of
docs, no lockfile, no manifest). Product shape from
`context/discovery/discovery-notes.md` `## Forward: tech-stack`: mobile-first
PWA, data primarily on the device, a possible native app later.

## Languages & Runtimes
- TypeScript (strict), Node >=22.12 for tooling (`.nvmrc` pins 24; required by the Vite 8 / Vitest toolchain), pnpm

## Frontend
- Framework: React (SPA, client-only; no SSR)
- Build: Vite (static output in `dist/`) + `vite-plugin-pwa` (Workbox service worker, web app manifest) — build tooling, not a palette framework
- Styling: Tailwind CSS

## Data & Storage
- On-device: IndexedDB behind a small storage contract in the app (deviation from palette: the product is local-first, PRD Access Control / NFR Offline; no server database in the app)
- Server (only the anonymous notification registry, F-02 / ADR 0001): Firebase Cloud Functions (2nd gen, Node 22, region `europe-central2`) + Cloud Firestore (collection `devices`, client access denied by rules; only the function writes). Separate package in `functions/` with its own pnpm lockfile. Replaces the earlier PostgreSQL default.
- Push: standard Web Push with VAPID (`web-push` in the function, `pushManager.subscribe` in the PWA); no FCM client SDK and no Firebase JS SDK in the app

## Infrastructure & Deploy
- Packaging: static build (`dist/`), served by any static host over HTTPS (PWA requirement)
- Deploy target: Firebase Hosting, project `grajek-app` (https://grajek-app.web.app), config in `firebase.json` / `.firebaserc`

## Testing
- E2E: Playwright (offline reload, manifest/installability checks)
- Unit (JS/TS): Vitest

## CI/CD
- GitHub Actions (default; no remote configured yet)

## Issue Tracker
- GitHub Issues (default)

## Commands

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm build`
- Test: `pnpm test`
- E2E: `pnpm test:e2e`
- Lint / typecheck: `pnpm lint && pnpm typecheck`
- Functions (`functions/`): `pnpm --dir functions install --frozen-lockfile`, `pnpm --dir functions build`, `pnpm --dir functions test` (unit), `pnpm --dir functions test:emulators` (Functions + Firestore emulators, needs JDK 21)

## Tooling
- Package manager (JS): pnpm

## Open Stack Questions
None.

## Decisions

| Decision | Source | Reason |
|---|---|---|
| React over Vue/Astro | Auto | Interactive app-like SPA (Astro is content/MPA-first); React keeps the native path open (React Native / Capacitor reuse of skills and components), per the "native later" note in discovery-notes `## Forward: tech-stack`. |
| Vite + vite-plugin-pwa | Auto | Static build and offline service worker are the F-01 outcome; Next adds SSR the product does not need. |
| IndexedDB for on-device data | Auto | Local-first product (PRD NFR Offline, Prywatność); IndexedDB is available in Android and iOS browsers and installed PWAs. |
| No Docker/Terraform for the app | Auto | A static PWA needs no container; revisit with the F-02 notification server. |
| Deploy target = Firebase Hosting | Client (Issue) | Chosen by the client for F-01 publication (project `grajek-app`). |
| Firebase Functions + Firestore for the F-02 server (not PostgreSQL) | Client (request) + Auto | App already on Firebase Hosting (`grajek-app`); a tiny anonymous registry needs no relational DB; same-origin `/api/**` Hosting rewrite. Cloud Functions need the Blaze plan: linking billing and deploying are manual steps for the user. |
| Web Push (VAPID) instead of FCM | Consult | No second Google-issued device identifier (ADR 0001, NFR Prywatność), no client SDK, sends testable on the local emulator without cloud credentials; iOS support is the same (16.4+, installed PWA only). |
| Emulator Suite only for local tests | Client (request) | `--project demo-grajek` keeps every emulator run offline; the Firestore emulator needs JDK 21 (CI installs it). |
