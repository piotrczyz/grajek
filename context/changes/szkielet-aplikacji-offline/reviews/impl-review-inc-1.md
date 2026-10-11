<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Offline-capable installable app skeleton

**Plan**: context/changes/szkielet-aplikacji-offline/plan.md   **Scope**: increment 1 (phases 1-4, full plan)   **Date**: 2026-10-11
**Round**: 1   **Verdict**: NEEDS_ATTENTION   **Findings**: 8

Base: `main` (no remote; `origin/main` absent). Diff `main...HEAD`: 43 files, of which
~25 code/config files (~700 changed lines excluding `pnpm-lock.yaml`), plus icons and
prose. The authoritative plan is commit `5015f02` (an earlier `39b1c1c` plan commit was
superseded; not a finding). `6b5ccb7` (rs-init context scaffold) is on the branch below
the plan and is context, not increment scope. The code is small and was read in full by
the reviewer; no evidence subagents were spawned (Auto: the whole code diff fits one read).

Client decision received during implementation (Source: Issue, treated as a client
requirement inside F-01 "sposób publikacji"): deploy target = **Firebase Hosting**,
project `grajek-app` (https://grajek-app.web.app). It supersedes the plan's
"No deploy target, domain or hosting configuration" line for configuration only:
no deploy, no deploy job in CI. F1-F3 bring the increment in line with it.

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Architecture: no `context/architecture/model.c4`, boundary gate not applicable.

## Success criteria (run locally, Node 24.19.0, pnpm 12.9.1)
| # | Check | Result |
|---|---|---|
| 1.1 | `pnpm install --frozen-lockfile` | PASS (node_modules installed from the frozen lockfile; `git status` clean) |
| 1.2 / 2.2 / 3.4 | `pnpm lint` (exit 0), `pnpm typecheck` = `tsc -b` (exit 0) | PASS |
| 1.3 / 2.1 / 3.4 | `vitest run --reporter=json`: 7 suites, 11 tests, 11 passed, 0 failed | PASS |
| 1.4 | `pnpm build`; `dist/index.html` contains `lang="pl"` | PASS |
| 3.1 | `dist/sw.js` and `dist/manifest.webmanifest` emitted; precache 12 entries incl. `index.html`, all icons, hashed assets, `manifest.webmanifest` | PASS |
| 3.2 / 3.3 | `CI=1 pnpm test:e2e`: 3 passed (offline reload, manifest + icons, iOS tags) | PASS |
| 4.1 | `ci.yml` valid YAML, same scripts as `package.json` | PASS by inspection (no YAML parser installed; structure and indentation checked by hand; steps run `lint`, `typecheck`, `test`, `build`, `test:e2e` exactly as in `package.json`) |
| 4.2 | full local run (the five commands above) | PASS |

Manual rows, diff evidence (all stay pending for the human):
- 1.5 centred, readable, no scroll: `src/App.tsx:6` flex centring, `text-6xl` heading / `text-2xl` body on an 18 px root (`src/index.css:10`), `body { overflow: hidden }` (`src/index.css:21`); white on `#1e3a8a` is well above WCAG AA.
- 3.5 / 3.6 / 3.7 Android install, iOS Add to Home Screen, Lighthouse: manifest and head tags present (`vite.config.ts:22-46`, `index.html:5-14`); needs a real HTTPS host (Firebase Hosting, once deployed).
- 4.3 README sub-path publication: `README.md:32-52`.

## Adaptations reported by the implementer (judged)
- `engines.node >=22.12` + `.nvmrc 24` instead of "Node 20+": required by the Vite 8 / Vitest 5 toolchain; CI reads `.nvmrc`. ACCEPT (O2); `tech-stack.md` still says Node 20+ (F3).
- `typescript ~6.0.3`: typecheck and lint pass with typescript-eslint 8.71. ACCEPT.
- `tsconfig.app.json` (out of the planned file list): the standard Vite project-references split; the plan allowed a split. ACCEPT (O1).
- `workbox-window` runtime dependency: needed by `virtual:pwa-register` (`src/main.tsx:3`); it is the "PWA register helper" the plan's Performance Notes allow; separate 5.65 kB chunk. ACCEPT (O3).
- `globPatterns` without `webmanifest` + `includeManifestIcons: false`: verified in `dist/sw.js` that the plugin still precaches `manifest.webmanifest` and every icon exactly once. ACCEPT (O4).

## Findings
### F1 — Firebase Hosting configuration missing (client decision)
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: repo root (no `firebase.json`, no `.firebaserc`); `.gitignore:1-9`
- **Detail**: The client chose Firebase Hosting, project `grajek-app`, as the publication method of F-01. The repo has no hosting configuration, so the cache rules the plan requires (plan.md Critical Implementation Details: no long-lived cache for `sw.js`, `registerSW.js`, `manifest.webmanifest`, `index.html`) are not enforced on the chosen host. Note: the build emits `workbox-<hash>.js` next to `sw.js` (outside `assets/`), and no `registerSW.js` (`injectRegister: false`); both must be covered by the no-cache rule.
- **Fix**: Add `firebase.json` with `hosting.public: "dist"`, `ignore` of `firebase.json`/`**/.*`/`**/node_modules/**`, rewrite `{"source":"**","destination":"/index.html"}`, headers `Cache-Control: no-cache` for `/index.html`, `/sw.js`, `/registerSW.js`, `/workbox-*.js`, `/manifest.webmanifest` (plus `Content-Type: application/manifest+json` on the manifest), and `public, max-age=31536000, immutable` only for `/assets/**`; add `.firebaserc` `{"projects":{"default":"grajek-app"}}`; add `.firebase/` and `firebase-debug.log` to `.gitignore`; no deploy, no CI deploy job, no `firebase-tools` dependency; re-run `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.
- **Decision**: FIXED (d1bcb4b)

### F2 — README publication section does not name the chosen host
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: `README.md:32-52`
- **Detail**: README says "The deploy target is still an open decision of the client". It is now Firebase Hosting (`grajek-app`, https://grajek-app.web.app). Not a one-edit prose fix (new steps and a reference to F1's config), so it goes with F1.
- **Fix**: Rewrite the Publishing section: chosen host Firebase Hosting, project `grajek-app`, URL https://grajek-app.web.app; steps `pnpm build` then `npx firebase-tools deploy --only hosting` (one-time `npx firebase-tools login`; `firebase-tools` not added as a dependency); cache headers live in `firebase.json`; keep the host-agnostic notes (relative paths, any sub-path, HTTPS, the no-cache list incl. `workbox-*.js`, long cache for `assets/`) as a subsection for other static hosts.
- **Decision**: FIXED (d1bcb4b)

### F3 — tech-stack.md out of date (deploy target, Node version, F-02 note)
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: `context/foundation/tech-stack.md:5` (`updated`), `:15` (Node 20+), `:25` (PostgreSQL for F-02), `:31` (Deploy target TODO), `:51-52` (Open Stack Question 1)
- **Detail**: The foundation still lists the deploy target as open and Node 20+, while the client decided Firebase Hosting and the toolchain needs Node >=22.12 (`package.json:17`, `.nvmrc`). `context/` is outside the reviewer's prose-fix exception.
- **Fix**: Edit in place: bump `updated:`; Languages: "Node >=22.12 for tooling (`.nvmrc` pins 24)"; Deploy target: "Firebase Hosting, project `grajek-app` (https://grajek-app.web.app), config in `firebase.json` / `.firebaserc`"; remove Open Stack Question 1 (leave "None." under the heading if empty); add a Decisions row "Deploy target = Firebase Hosting | Client (Issue) | chosen by the client for F-01 publication"; under Data & Storage add a note, explicitly not a decision, that F-02 planning should consider the Firebase ecosystem (FCM for push, Cloud Functions / Firestore) instead of PostgreSQL.
- **Decision**: FIXED (d1bcb4b)

### O1 — `tsconfig.app.json` outside the planned file list
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Scope Discipline
- **Location**: `tsconfig.app.json:1-23`
- **Detail**: Plan named `tsconfig.json` (+ `tsconfig.node.json` if split). The app config is the standard Vite references layout; `tsc -b` checks both.
- **Fix**: None.
- **Decision**: ACCEPT — reported adaptation, harmless.

### O2 — Node engine raised to >=22.12
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: `package.json:16-18`, `.nvmrc:1`, `README.md:12`
- **Detail**: Plan said `engines.node >= 20`; the chosen Vite/Vitest majors require 22.12+. README and CI are consistent; `plan.md` is locked and keeps "Node 20+".
- **Fix**: None in code (foundation updated by F3).
- **Decision**: ACCEPT — reported adaptation.

### O3 — `workbox-window` as a runtime dependency
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: `package.json:24`, `src/main.tsx:3,13-15`
- **Detail**: Peer of `virtual:pwa-register`; first-party, no network requests; matches the plan's allowed "PWA register helper".
- **Fix**: None.
- **Decision**: ACCEPT.

### O4 — precache `globPatterns` excludes `webmanifest`
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: `vite.config.ts:21,49`
- **Detail**: Plan listed `webmanifest` in the glob; the plugin adds the manifest itself, and `dist/sw.js` contains it once. Avoids a duplicate precache entry.
- **Fix**: None.
- **Decision**: ACCEPT.

### O5 — CI YAML validated by inspection only
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Success Criteria
- **Location**: `.github/workflows/ci.yml:1-58`
- **Detail**: No YAML parser is available in the worktree or on the machine; the file was checked by hand. It runs for real only once the repo has a GitHub remote (brief, Open risks).
- **Fix**: None now; the first push confirms it.
- **Decision**: ACCEPT.

## Key decisions (review)
| Decision | Choice | Source |
|---|---|---|
| Firebase Hosting config in this increment | FIX findings F1-F3, configuration only, no deploy | Issue (client) |
| Evidence subagents | Not spawned; code diff read in full by the reviewer | Auto |
| Diff base | local `main` (no remote) | Auto |
| Implementer adaptations | All accepted (O1-O4, TypeScript 6) | Auto |
