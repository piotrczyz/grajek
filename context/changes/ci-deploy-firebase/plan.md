# Deploy to Firebase Hosting from GitHub Actions — Implementation Plan

## Overview
Publish the app to Firebase Hosting from GitHub Actions only: every pull request
from this repository gets a preview channel whose link the official action posts
as a PR comment, and every push to `main` deploys the live site
(https://grajek-app.web.app). Both deploys run only after the existing checks
(lint, typecheck, unit tests, build, e2e) pass, and they ship the exact `dist/`
those checks built. The README stops describing a local deploy and explains the
one-time secret setup.

## Current State Analysis
- `.github/workflows/ci.yml:3-5` triggers on every `push` and `pull_request`; `:7-8` top-level `permissions: contents: read`; `:10-12` concurrency `ci-${{ github.ref }}` with `cancel-in-progress: true`.
- `.github/workflows/ci.yml:15-43` single job `check`: checkout, `pnpm/action-setup@v4` (version from `packageManager`), `actions/setup-node@v4` with `node-version-file: .nvmrc` and pnpm cache, then install, lint, typecheck, unit tests, build, Playwright install, e2e. No job uploads `dist/`; nothing deploys.
- `firebase.json:3` serves `dist` with SPA rewrite and cache headers; `.firebaserc:3` default project `grajek-app`. Both are needed in the deploy job's working tree (the action runs `firebase-tools` against them).
- `package.json:6-15` has no deploy script and no `firebase-tools` dependency — keep it that way.
- `README.md` `## Publishing` tells the reader to deploy locally with `npx firebase-tools login` / `npx firebase-tools deploy --only hosting` and says "CI only checks and builds; it does not deploy." Both must change.
- `context/foundation/tech-stack.md` `## CI/CD` says "GitHub Actions (default; no remote configured yet)"; the remote now exists (`origin` = `https://github.com/piotrczyz/grajek.git`).
- Secret `FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP` does not exist yet (requester); the first real deploy can only be verified after the user creates it.

## Desired End State
- A PR opened from a branch of `piotrczyz/grajek`: the `check` job runs, then a `deploy-preview` job deploys `dist/` to a Firebase preview channel and the action comments the preview URL on the PR (updated on later pushes).
- A PR from a fork: `check` runs; `deploy-preview` is skipped (no secrets, no write token).
- A push to `main` (a merge): `check` runs, then `deploy-live` deploys to the `live` channel of `grajek-app`.
- Pushes to other branches: only `check`.
- No local deploy path is documented or scripted; the README explains how to create the secret, by `firebase init hosting:github` or by hand.

### Key discoveries
- Existing check steps live in one job (`ci.yml:15-43`), so a deploy job can gate on it with `needs: check` instead of duplicating steps.
- `cancel-in-progress: true` (`ci.yml:12`) would let a newer push cancel a live deploy mid-flight; on `main` runs must queue instead.
- `firebase init hosting:github` writes its own `firebase-hosting-merge.yml` / `firebase-hosting-pull-request.yml`, which would deploy a second time without our gates — the README must tell the user not to commit them.

## What we're NOT doing
- No `deploy` script in `package.json`, no `firebase-tools` dependency, no local deploy instructions.
- No preview for fork PRs (no `pull_request_target`).
- No GitHub Environments, required reviewers or branch protection setup.
- No change to the app code, `firebase.json`, `.firebaserc`, or the existing check steps.
- No creation of the secret or the service account (the user does it).

## Implementation Approach
Extend `ci.yml` rather than add a second workflow. The `check` job uploads the
built `dist/` as a short-lived artifact; two new jobs, `deploy-preview` and
`deploy-live`, declare `needs: check`, check out the repo (for `firebase.json` /
`.firebaserc`), download that artifact into `dist/`, and run
`FirebaseExtended/action-hosting-deploy@v0` with
`firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP }}` and
`projectId: grajek-app`. The preview job passes `repoToken: ${{ secrets.GITHUB_TOKEN }}`
(for the comment) and no `channelId` (the action derives a per-PR channel);
the live job passes `channelId: live`. Job-level `permissions` grant only what
each job needs; the top-level `contents: read` stays.

Alternatives rejected: a separate `deploy.yml` that repeats the check steps
(two copies of the gate drift apart, and the checks run twice); a
`workflow_run`-triggered workflow (runs default-branch code with secrets for PR
events — a known injection risk — and cannot comment on the PR without extra
lookups); turning `ci.yml` into a reusable workflow (more indirection for no
gain over `needs:` in one file).

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Firebase Hosting deploy pipeline (A1) | 1-2 | — | no | pending | — |

## Critical Implementation Details
- **Job conditions.** `deploy-preview`: `github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository`. `deploy-live`: `github.event_name == 'push' && github.ref == 'refs/heads/main'`. Because `ci.yml` also runs on `push` for PR branches, only the `pull_request` run may deploy a preview.
- **Permissions.** Top-level stays `contents: read`. `deploy-preview`: `contents: read`, `pull-requests: write`, `checks: write`. `deploy-live`: `contents: read`. `check` gets no new permissions. Secrets are referenced only inside the two deploy jobs.
- **Concurrency.** Keep the group; set `cancel-in-progress` to `${{ github.ref != 'refs/heads/main' }}` so runs on `main` queue in order and a live deploy is never cancelled half-way, while PR/branch runs still cancel superseded ones.
- **Artifact.** Upload `dist/` from `check` after the Build step (`actions/upload-artifact@v4`, a fixed name such as `dist`, `retention-days: 1`, `if-no-files-found: error`); deploy jobs use `actions/download-artifact@v4` with `path: dist`. Upload it unconditionally (cheap, keeps `check` free of deploy logic), right after Build; the deploy jobs still wait for the whole `check` job, e2e included.
- **Action.** `FirebaseExtended/action-hosting-deploy@v0`; preview channel expiry stays at the action default (7 days). No Node setup is needed in deploy jobs (the action brings its own runtime and fetches `firebase-tools`).

## Phase 1: Deploy jobs in CI
### Overview
`ci.yml` builds once, then deploys that build to a preview channel for same-repo PRs and to live for `main`.

### Required changes
#### 1. CI workflow
- **File**: `.github/workflows/ci.yml`
- **Goal**: gate Firebase Hosting deploys on the existing `check` job and reuse its `dist/`.
- **Contract**: `check` gains an "Upload dist" step; new jobs `deploy-preview` and `deploy-live` per *Critical Implementation Details* (conditions, permissions, `needs: check`, checkout + download artifact + `FirebaseExtended/action-hosting-deploy@v0` with secret `FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP`, `projectId: grajek-app`; preview with `repoToken`, live with `channelId: live`); concurrency `cancel-in-progress` false on `main`. Existing check steps unchanged.

### Success criteria
#### Automated
- `npx --yes js-yaml .github/workflows/ci.yml` parses the workflow without error
- `ci.yml` has exactly two `FirebaseExtended/action-hosting-deploy@v0` steps, in jobs `deploy-preview` and `deploy-live`, each with `needs: check` and `projectId: grajek-app`
- `deploy-preview` condition requires `github.event.pull_request.head.repo.full_name == github.repository`; `deploy-live` condition requires `github.ref == 'refs/heads/main'` and it sets `channelId: live`
- Top-level `permissions` is still only `contents: read`; `pull-requests: write` and `checks: write` appear only in `deploy-preview`; `secrets.` appears only in the two deploy jobs
- `package.json` contains no `firebase` reference (`grep -c firebase package.json` prints 0)
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass
#### Manual
- After the secret exists, a PR from a branch of this repo gets a comment with a working preview URL once `check` passes
- After a merge to `main`, https://grajek-app.web.app serves the new build
- A PR from a fork runs `check` and shows `deploy-preview` as skipped

## Phase 2: Setup documentation
### Overview
The README explains the automatic publishing and the one-time secret setup; local deploy instructions are gone.

### Required changes
#### 1. README
- **File**: `README.md`
- **Goal**: replace the local-deploy steps in `## Publishing` with how publishing works now and how to create the secret.
- **Contract**: `## Publishing` states: previews for same-repo PRs (link in a PR comment, channel expires after 7 days), live deploy on every push to `main`, both only after the checks pass, no local deploy. A "One-time setup" subsection gives two exact ways to create repo secret `FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP`: (a) `npx firebase-tools init hosting:github` for repo `piotrczyz/grajek`, which creates the service account and the secret with that name — answer "no" to its build-script/workflow prompts or delete the generated `.github/workflows/firebase-hosting-*.yml` files, because `ci.yml` already deploys; (b) by hand: in Google Cloud console for project `grajek-app` create a service account with role **Firebase Hosting Admin**, create a JSON key, run `gh secret set FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP -R piotrczyz/grajek < key.json`, then delete the local key file. The "Other static hosts" subsection and cache-header list stay.

#### 2. Tech stack record
- **File**: `context/foundation/tech-stack.md`
- **Goal**: keep the stack record true.
- **Contract**: `## CI/CD` line says GitHub Actions runs the checks and deploys to Firebase Hosting (preview channel per same-repo PR, live on `main`); drop "no remote configured yet"; bump `updated`.

### Success criteria
#### Automated
- `grep -nE "firebase(-tools)? (login|deploy)" README.md` finds nothing
- `README.md` mentions `FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP`, `init hosting:github`, `Firebase Hosting Admin` and `gh secret set` (each grep finds a match)
- `context/foundation/tech-stack.md` `## CI/CD` mentions Firebase Hosting and no longer says "no remote configured yet"
#### Manual
- A developer can create the secret by following either README path without other sources

## Testing Strategy
No app code changes, so the existing suites only need to stay green (Phase 1 criterion). The workflow is checked statically (YAML parse, greps on conditions and permissions); its behaviour is proven by the first real runs after the user adds the secret (Manual criteria), which the PR for this change itself exercises: its own `pull_request` run will show `deploy-preview` failing or succeeding depending on whether the secret exists yet.

## References
- `change.md` (request and constraints)
- `.github/workflows/ci.yml`, `firebase.json`, `.firebaserc`, `package.json`, `README.md`
- `context/foundation/tech-stack.md` `## Infrastructure & Deploy`, `## CI/CD`
- FirebaseExtended/action-hosting-deploy README (inputs `repoToken`, `firebaseServiceAccount`, `projectId`, `channelId`; required permissions `pull-requests: write`, `checks: write`)

## Progress

### Phase 1: Deploy jobs in CI
#### Automated
- [ ] 1.1 `npx --yes js-yaml .github/workflows/ci.yml` parses the workflow without error
- [ ] 1.2 `ci.yml` has exactly two `FirebaseExtended/action-hosting-deploy@v0` steps, in jobs `deploy-preview` and `deploy-live`, each with `needs: check` and `projectId: grajek-app`
- [ ] 1.3 `deploy-preview` condition requires `github.event.pull_request.head.repo.full_name == github.repository`; `deploy-live` condition requires `github.ref == 'refs/heads/main'` and it sets `channelId: live`
- [ ] 1.4 Top-level `permissions` is still only `contents: read`; `pull-requests: write` and `checks: write` appear only in `deploy-preview`; `secrets.` appears only in the two deploy jobs
- [ ] 1.5 `package.json` contains no `firebase` reference (`grep -c firebase package.json` prints 0)
- [ ] 1.6 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass
#### Manual
- [ ] 1.7 After the secret exists, a PR from a branch of this repo gets a comment with a working preview URL once `check` passes
- [ ] 1.8 After a merge to `main`, https://grajek-app.web.app serves the new build
- [ ] 1.9 A PR from a fork runs `check` and shows `deploy-preview` as skipped

### Phase 2: Setup documentation
#### Automated
- [ ] 2.1 `grep -nE "firebase(-tools)? (login|deploy)" README.md` finds nothing
- [ ] 2.2 `README.md` mentions `FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP`, `init hosting:github`, `Firebase Hosting Admin` and `gh secret set` (each grep finds a match)
- [ ] 2.3 `context/foundation/tech-stack.md` `## CI/CD` mentions Firebase Hosting and no longer says "no remote configured yet"
#### Manual
- [ ] 2.4 A developer can create the secret by following either README path without other sources
