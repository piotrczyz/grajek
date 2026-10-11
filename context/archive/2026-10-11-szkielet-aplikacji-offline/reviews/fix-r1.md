# Fix round 1: szkielet-aplikacji-offline, increment 1

**Report**: `reviews/impl-review-inc-1.md` (Round 1, NEEDS_ATTENTION)   **Date**: 2026-10-11
Environment: Node 24.19.0, pnpm (packageManager pin), Windows 11, worktree `node_modules` already installed.

## Findings addressed

| Id | Fix | Files |
|---|---|---|
| F1 | Firebase Hosting config: `hosting.public: "dist"`, ignore list, SPA rewrite `** -> /index.html`, `Cache-Control: no-cache` for `/`, `/index.html`, `/sw.js`, `/registerSW.js`, `/workbox-*.js`, `/manifest.webmanifest` (+ `Content-Type: application/manifest+json`), `public, max-age=31536000, immutable` for `/assets/**`; `.firebaserc` default project `grajek-app`; `.gitignore` adds `.firebase/` and `firebase-debug.log`. No deploy, no CI deploy job, no `firebase-tools` dependency. | `firebase.json`, `.firebaserc`, `.gitignore` |
| F2 | README Publishing rewritten: Firebase Hosting `grajek-app`, https://grajek-app.web.app, `pnpm build` then `npx firebase-tools deploy --only hosting` (one-time `npx firebase-tools login`); host-agnostic notes kept under "Other static hosts" incl. `workbox-*.js` in the no-cache list. | `README.md` |
| F3 | tech-stack.md: Node >=22.12 (`.nvmrc` pins 24); deploy target Firebase Hosting with config files; Open Stack Question 1 removed ("None."); Decisions row "Deploy target = Firebase Hosting / Client (Issue)"; Data & Storage note (not a decision) that F-02 should consider FCM / Cloud Functions / Firestore instead of PostgreSQL. `updated:` already 2026-10-11 (today), unchanged. | `context/foundation/tech-stack.md` |

Adaptation (within F1's intent): added a no-cache header for `/` besides `/index.html`, because Firebase matches header globs against the request path and the root request serves `index.html` without matching `/index.html`.

## Red-first

Not applicable: configuration and prose only, no new or changed tests. `firebase.json` and `.firebaserc` validated as JSON:

```
$ node -e "...JSON.parse(firebase.json); JSON.parse(.firebaserc)..."
json ok
```

`pnpm build` output confirms every no-cache target exists in `dist/`: `index.html`, `sw.js`, `workbox-2fbc6a65.js`, `manifest.webmanifest` (no `registerSW.js`, `injectRegister: false`); hashed files under `assets/`.

## Full run (baseline: review round 1, 11 unit tests + 3 e2e, all green)

```
=== pnpm lint
$ eslint .
exit 0
=== pnpm typecheck
$ tsc -b
exit 0
=== pnpm test
 Test Files  3 passed (3)
      Tests  11 passed (11)
exit 0
=== pnpm build
PWA v2.0.0
mode      generateSW
precache  12 entries (239.56 KiB)
files generated
  dist/sw.js
  dist/workbox-2fbc6a65.js
exit 0
=== CI=1 pnpm test:e2e
  ok 1 [mobile-chromium] › e2e\installability.spec.ts:66:1 › carries the iOS home screen tags and Polish language
  ok 2 [mobile-chromium] › e2e\installability.spec.ts:30:1 › serves a complete web app manifest with reachable icons
  ok 3 [mobile-chromium] › e2e\offline.spec.ts:3:1 › reloading without network still shows the welcome screen
  3 passed (5.5s)
exit 0
```

Baseline comparison: 11/11 unit and 3/3 e2e, same as round 1; no new failures. Build exit code 0.
Criteria re-run: 1.2, 1.3, 1.4, 3.1-3.4, 4.2 (all pass). 4.1 (`ci.yml`) untouched.
