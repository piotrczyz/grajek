<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Move the app to grajek.web.app

**Plan**: context/changes/zmiana-adresu-aplikacji/plan.md   **Scope**: increment 1 (phases 1-2)   **Date**: 2026-10-11
**Round**: 2   **Verdict**: APPROVED   **Findings**: 3

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Diff: 7 code/config files (`firebase.json`, `hosting/legacy/sw.js`, `.github/workflows/ci.yml`, `functions/test/firebase-config.test.ts`, `src/hosting/firebase-config.test.ts`, `src/hosting/legacy-sw.test.ts`, `src/push/push-sw.test.ts`) plus README and `tech-stack.md`. That is under the Step 2 threshold, so it was reviewed inline without subagents. There is no `context/architecture/model.c4`, so the boundary gate does not apply. Not bug mode.

Classification: every planned file is in the diff. In the diff but not in the plan: `functions/test/firebase-config.test.ts` (F2). `.firebaserc`, `functions/src`, the secret name and the project id are untouched.

## Success criteria (run locally)
| # | Command | Result |
|---|---|---|
| 1.1 / 2.4 | `vitest run --reporter=json` | PASS: 441/441 tests in 133 files; `src/hosting/firebase-config.test.ts` 19, `src/hosting/legacy-sw.test.ts` 5, `src/push/push-sw.test.ts` 7 |
| 1.2 | `node -e "JSON.parse(...firebase.json...)"`; `git diff --quiet origin/main -- .firebaserc` | PASS (both) |
| 1.3 / 2.4 | `pnpm lint`, `pnpm typecheck`, `pnpm build` | PASS (exit 0 each) |
| 1.4 | `CI=1 pnpm test:e2e` | PASS: 15 passed |
| 1.5 | `pnpm --dir functions test` | PASS: 106/106 in 6 files |
| 1.5 | `pnpm --dir functions test:emulators` | SKIPPED: no JDK on this machine; the plan accepts CI's `functions` job as the proof. Partly covered: `firebase emulators:exec --only hosting --project demo-grajek` (firebase-tools 15.33.0) loads the two-site config with no `.firebaserc` targets and serves `grajek` on :5000 and `grajek-app` on :5005 |
| 2.1 | `git grep -n "grajek-app.web.app" -- . ':!context/archive' ':!context/changes'` | PASS: only README:42 (describes the redirect), `hosting/legacy/sw.js:2`, `src/hosting/legacy-sw.test.ts` |
| 2.2 | `npx --yes js-yaml .github/workflows/ci.yml` | PASS: deploy-preview `{target: grajek, projectId: grajek-app}`; deploy-live `{channelId: live, projectId: grajek-app}` with no target |
| 2.3 | `git diff --quiet origin/main -- .firebaserc functions` | FAIL (exit 1): `functions/test/firebase-config.test.ts` changed, see F2. `grep -c FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP` prints 2: PASS |

Hosting emulator probe of the real `firebase.json`, legacy site on :5005, with `redirect: manual`:
- `/` → **404**
- `/some/path?q=1` → 301 to `https://grajek.web.app/some/path?q=1`
- `/sw.js` → 200
- `/sw.json` → 301
- `/a/sw.js` → 301
- `/api/x` → 301

On the app site (:5000), `/api/x` is rewritten to the `api` function in `europe-central2`.

Control experiment in a throwaway project:
- `^/(.*)$` → `:1` also returns 404 on `/` (the capture is empty).
- A separate rule `regex: "^/$"` with the literal destination `https://grajek.web.app/` returns 301 on `/`.

Manual rows 1.6, 1.7, 1.8 and 2.5 are unchecked. They need the first live deploy or the PR preview and are carried as `manual-pending`.

## Findings
### F1 — The root of the old address is not redirected (404)
- **Severity**: CRITICAL
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: firebase.json:60; src/hosting/firebase-config.test.ts:43, :93
- **Detail**: The request asks for a 301 on every path. The single regex rule handles `/` through an empty capture (`:1` = ""). The Hosting emulator (firebase-tools 15.33.0) skips the redirect when the capture is empty, so `GET https://grajek-app.web.app/` returns 404. The control run with `^/(.*)$` does the same. `/` is the address people actually have: shared links, bookmarks, the PWA `start_url`. The unit test cannot catch this because its `redirectFor` resolves an empty capture to `''` (line 43), which is not what Hosting does. The plan caused the defect: it asked for "one rule … (empty path goes to https://grajek.web.app/)". Production Hosting may behave differently from the emulator, but nothing on this machine can show that, and the fix is harmless either way.
- **Fix**: Add a rule `{ "regex": "^/$", "destination": "https://grajek.web.app/", "type": 301 }` before the existing rule in the `grajek-app` config and keep the existing rule. Update `src/hosting/firebase-config.test.ts` so that it:
  - evaluates the rules in order, first match wins;
  - treats an empty capture as no match, which is what the emulator does;
  - accepts two rules instead of `toHaveLength(1)`;
  - still asserts that `/` → `https://grajek.web.app/` and that `/sw.js` is not redirected.
- **Decision**: FIXED (c55f722) — verified r2: the `^/$` rule comes first, the test evaluates rules in order, the emulator returns 301 on `/`.

### F2 — Out-of-plan edit to the functions config test; criterion 2.3 ticked although its command fails
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Scope Discipline
- **Location**: functions/test/firebase-config.test.ts:14-37; plan.md Progress 2.3
- **Detail**: The existing backend test read `hosting.rewrites` from `firebase.json` as an object. Turning `hosting` into an array, which the plan requires, breaks that test, so the edit is necessary and correct: it now selects site `grajek` and keeps both assertions. The plan did not foresee this edit. Criterion 2.3 (`git diff --quiet origin/main -- .firebaserc functions`) exits 1 but is ticked `[x]`, and no commit or note mentions the adaptation. The criterion's intent (no change to function code, region or secrets) holds, because `functions/src` is untouched.
- **Fix**: None in code. The plan's criterion should have excluded `functions/test`.
- **Decision**: ACCEPT — the edit follows necessarily from a planned contract change and there is nothing to fix. It is recorded as `out-of-plan-files` and `adaptation` guards.

### F3 — Emulator suite not run locally
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Success Criteria
- **Location**: functions/package.json:15
- **Detail**: `test:emulators` (Firestore emulator) could not run because there is no JDK. The plan accepts CI's `functions` job as the proof. The risk the plan named (firebase-tools must accept the two-site config under `demo-grajek` with no targets) was checked locally with the Hosting-only emulator; see the probe above.
- **Fix**: None. CI's `functions` job confirms it before merge.
- **Decision**: ACCEPT — the plan explicitly allows this, and the risk it guarded against is covered.

## Round 2
Re-review of fix commit c55f722, which covers F1 only. F2 and F3 are untouched and the fix stays inside the increment's files: `firebase.json` and `src/hosting/firebase-config.test.ts`.
- **Test.** The rules are now evaluated in order, first match wins, and an empty capture counts as no match. `fix-r1.md` records the red-first run: with the old `firebase.json`, 2 tests fail, including `/`.
- **Phase 1 checks re-run:** `pnpm test` 441/441; lint, typecheck and build exit 0; `CI=1 pnpm test:e2e` 15 passed; `pnpm --dir functions test` 106/106; the JSON parse passes and `.firebaserc` is unchanged. These match the baseline in `fix-r1.md`.
- **Hosting emulator, old site on :5005:**
  - `/` → 301 `https://grajek.web.app/`
  - `/?utm=x` → 301 `https://grajek.web.app/?utm=x`
  - `/index.html` and `/some/path?q=1` → 301, path kept
  - `/sw.js` → 200
  - `/sw.json` and `/a/sw.js` → 301
- **Verdict:** APPROVED. F2 (WARNING, ACCEPT) is the only open warning, and F3 is an accepted observation.

## Notes on the rest of the diff
- `hosting/legacy/sw.js`: skip-waiting, cache purge, unregister and window navigation each still run when an earlier step fails, and there is no fetch handler. This matches the established self-destroying-worker pattern, and the tests cover the failure paths.
- CI: the preview's `target: grajek` relies on firebase-tools resolving a `site` id in `--only`, which it supports for `site` configs. The first PR preview will confirm it (2.5).
- The `/sw.js` exclusion is RE2-safe (no lookaround) and was verified in the emulator: `/sw.js` returns 200, while `/sw.json` and `/a/sw.js` return 301.
