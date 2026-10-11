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
- TypeScript (strict), Node 20+ for tooling (pnpm)

## Frontend
- Framework: React (SPA, client-only; no SSR)
- Build: Vite (static output in `dist/`) + `vite-plugin-pwa` (Workbox service worker, web app manifest) — build tooling, not a palette framework
- Styling: Tailwind CSS

## Data & Storage
- On-device: IndexedDB behind a small storage contract in the app (deviation from palette: the product is local-first, PRD Access Control / NFR Offline; no server database in the app)
- Server database (only for the anonymous notification server, F-02 / ADR 0001): PostgreSQL (house default), pinned when F-02 is planned

## Infrastructure & Deploy
- Packaging: static build (`dist/`), served by any static host over HTTPS (PWA requirement)
- Deploy target: # TODO: deploy target — see Open Stack Questions

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
1. **Deploy target** — concrete static host (e.g. a VPS behind HTTPS, or a static hosting provider) not chosen; the build is host-agnostic. Owner: client. Needed before the first public publication, not for building.

## Decisions

| Decision | Source | Reason |
|---|---|---|
| React over Vue/Astro | Auto | Interactive app-like SPA (Astro is content/MPA-first); React keeps the native path open (React Native / Capacitor reuse of skills and components), per the "native later" note in discovery-notes `## Forward: tech-stack`. |
| Vite + vite-plugin-pwa | Auto | Static build and offline service worker are the F-01 outcome; Next adds SSR the product does not need. |
| IndexedDB for on-device data | Auto | Local-first product (PRD NFR Offline, Prywatność); IndexedDB is available in Android and iOS browsers and installed PWAs. |
| No Docker/Terraform for the app | Auto | A static PWA needs no container; revisit with the F-02 notification server. |
