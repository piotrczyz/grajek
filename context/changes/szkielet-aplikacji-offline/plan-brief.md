# Offline-capable installable app skeleton — Plan Brief
Full plan: `context/changes/szkielet-aplikacji-offline/plan.md` · request text: `change.md` · roadmap slice F-01 in `context/foundation/roadmap.md`

## What & why
Roadmap foundation F-01. A Uczeń can install Grajek on an Android or iOS home
screen and open it without internet, seeing a Polish, child-readable welcome
screen. It also fixes the minimal on-device storage contract and the static
publication method that S-01 onward build on. No product feature.

## Starting point
Greenfield: only `context/` documents. Stack declared by rs-init in
`context/foundation/tech-stack.md` (React + TS + Vite + vite-plugin-pwa,
Tailwind, IndexedDB, Vitest, Playwright, pnpm); deploy target is an open client
question the change does not depend on.

## Desired end state
`pnpm build` yields a host- and path-agnostic `dist/` with manifest, icons and a
precaching service worker; Chrome sees it as installable, iOS adds it with its
own icon/title; offline reload shows "Grajek"; `src/storage/` exposes
`openDb()` + migrations + `requestPersistentStorage()`; lint, typecheck, unit
and e2e pass; README explains publication; CI runs it all.

## Complexity
MEDIUM — no existing code to fit, but a whole toolchain, a service worker with
cross-platform install quirks (iOS ignores most of the manifest) and a new
storage contract later slices depend on. One area, four phases, one increment.
Skipped: rs-research (greenfield, no code to read) and rs-frame (the request
states an outcome, not a cause or a fix; scope is fixed by the roadmap slice)
— Jev unavailable (dry mode, p=0.23 / p=0.10), decided Auto.

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Areas | One area A1 offline-app-skeleton, builds on nothing | Split settled upstream with Jev | Orchestrator |
| Increments | One increment, phases 1-4, user-visible yes | Single area; the welcome screen is what the Uczeń sees | Orchestrator |
| Research / framing | Both skipped | Greenfield; outcome-shaped request; Jev answered `unavailable` | Auto |
| Stack | React + TS strict + Vite + vite-plugin-pwa + Tailwind v4 + Vitest + Playwright + pnpm | Declared in tech-stack.md | Auto |
| Deploy target | Not chosen; build stays host-agnostic | Open Stack Question owned by client; change does not depend on it | Auto |
| Repo layout | Single package at repo root | Workspace is premature; F-02 can add `server/` later | Auto |
| Base path | Vite `base: './'`, relative manifest `start_url`/`scope` | Works under any host and sub-path while the target is open | Auto |
| SW strategy | generateSW, precache whole shell, `autoUpdate`, navigate fallback | Shell holds no user state an update could disturb; offline is the outcome | Auto |
| Storage contract | `openDb()` on `idb` + ordered migration list (v1 no-op) + `requestPersistentStorage()`; no KV interface, no stores | Smallest base S-01 can extend; KV/collection layer would be bypassed by S-02/S-04 queries; Capacitor keeps IndexedDB | Consult |
| Persistence request | Called once at app start, best effort, never blocks | iOS eviction vs PRD Open Question #2 (data loss) | Consult |
| Storage test tool | Vitest + fake-indexeddb | Requested; runs IndexedDB in Node | Orchestrator |
| Icons | Placeholder SVG mark, PNGs generated with @vite-pwa/assets-generator and committed | Covers Android 192/512/maskable and iOS 180; final art out of scope | Auto |
| iOS support | Explicit apple-touch-icon and iOS web-app meta tags | Safari ignores most manifest fields | Auto |
| Install prompt | None in-app | Not in the slice outcome; adds UX/copy beyond F-01 | Auto |
| Welcome copy | "Grajek" + "Cześć! Tu zapiszesz swoje ćwiczenia na instrumencie." | Polish, gender-neutral, encouraging (NFR Czytelność) | Auto |
| Fonts / third parties | System font stack, no external requests | PRD NFR Prywatność + offline | Auto |
| E2E target | Playwright on mobile Chromium against `vite preview` of the production build; no WebKit project | SW exists only in the build; Playwright WebKit does not model iOS home screen | Auto |
| CI | GitHub Actions: lint, typecheck, test, build, e2e; no deploy job | tech-stack default; no deploy target yet | Auto |
| Lint/typecheck | ESLint flat config + typescript-eslint + react-hooks; `tsc` typecheck | Matches tech-stack Commands | Auto |

## Scope
In: toolchain, welcome screen, storage contract, PWA manifest/icons/SW, iOS tags,
unit + e2e tests, README publication notes, CI.
Out: any product feature or entity, export/import, install prompt, push/server
(F-02), hosting config, analytics, final artwork.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Installable offline skeleton with storage contract and static build | — | yes | Android/iOS install and offline differences |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | Scaffold, tooling, welcome screen + test | Toolchain version friction |
| 2 | 1 | IndexedDB contract + tests | Migration rule misunderstood by later slices |
| 3 | 1 | Manifest, icons, iOS tags, SW, Playwright | Flaky offline test if SW not yet controlling |
| 4 | 1 | README publication, CI workflow | CI unverifiable until a remote exists |

Prerequisites: Node 20+ and pnpm locally; Playwright Chromium browser download.

## Open risks & assumptions
- Real-device install/offline on Android and iOS can only be checked once an
  HTTPS host exists; deploy target is the client's open decision (Manual 3.5, 3.6).
- CI workflow cannot run until the repo has a GitHub remote.
- Storage: slices use `idb` directly; a later native storage swap costs one
  edit per repository module (accepted by Consult). Revisit if the client
  wants export/import (PRD Open Question #2) or picks React Native before S-02.
- F-02 runs in parallel and may also touch root `package.json`; expect a merge
  of scripts/dependencies there.

## Success criteria (summary)
Automated: frozen install, lint, typecheck, unit (welcome + storage), build emits
SW and manifest, Playwright offline reload and installability metadata, CI YAML
valid. Manual: child-readable layout, Android install + offline, iOS Add to Home
Screen + offline, Lighthouse installable, README publication steps.
