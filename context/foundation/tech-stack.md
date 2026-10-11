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
- Server database (only for the anonymous notification server, F-02 / ADR 0001): PostgreSQL (house default), pinned when F-02 is planned
- Note (not a decision): with the app on Firebase Hosting, F-02 planning should consider the Firebase ecosystem (FCM for push, Cloud Functions / Firestore) instead of PostgreSQL

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
