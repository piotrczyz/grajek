# Fix round 1: zmiana-adresu-aplikacji, increment 1

Report: `reviews/impl-review-inc-1.md` (Round 1). Findings with `Decision: FIX`: F1. F2 and F3 are `ACCEPT` and untouched.

## F1: root of the old address not redirected

- `firebase.json`: added `{ "regex": "^/$", "destination": "https://grajek.web.app/", "type": 301 }` before the existing rule in the `grajek-app` config; the existing rule is unchanged.
- `src/hosting/firebase-config.test.ts`: `redirectFor(rules, path)` evaluates the rules in order (first match wins); `applyRule` treats an empty referenced capture as no match (emulator behaviour); the shape test expects two rules with the root rule first; the RE2 check covers every rule; `/` still maps to `https://grajek.web.app/`, `/sw.js` still is not redirected.

## Red-first proof

Fix reverted (`git show HEAD:firebase.json > firebase.json`, test changes kept):

```
$ npx vitest run src/hosting/firebase-config.test.ts
       × has two 301 rules to the new address: the root, then every other path
       × redirects / to the same path on the new address
 Test Files  1 failed (1)
      Tests  2 failed | 17 passed (19)
```

Fix restored:

```
$ npx vitest run src/hosting/firebase-config.test.ts
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

## Automated criteria of phase 1 (the phase the fix touches)

| # | Command | Result |
|---|---|---|
| 1.1 | `pnpm test` | PASS: `Test Files 45 passed (45)`, `Tests 441 passed (441)` |
| 1.2 | `node -e "JSON.parse(...firebase.json...)"`; `git diff --quiet origin/main -- .firebaserc` | PASS (exit 0, exit 0) |
| 1.3 | `pnpm lint`; `pnpm typecheck`; `pnpm build` | PASS (exit 0 each) |
| 1.4 | `CI=1 pnpm test:e2e` | PASS: `15 passed (9.1s)` |
| 1.5 | `pnpm --dir functions test` | PASS: `Tests 106 passed (106)`; `test:emulators` not run (no JDK), CI's `functions` job is the proof as in round 1 |

## Baseline comparison

Round 1 baseline: 441/441 unit tests, 15 e2e, 106 functions tests. Now: 441/441, 15, 106. No new failures; test count unchanged (the root case was already in the table, the shape test was rewritten in place).

## Build

`pnpm build` exit code 0.

Not re-run here: the Hosting emulator probe (needs no JDK, but the reviewer's probe setup is not part of the plan's criteria). The control experiment in the report already shows a literal `^/$` rule returns 301 on `/`.
