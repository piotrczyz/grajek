<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Deploy to Firebase Hosting from GitHub Actions

**Plan**: context/changes/ci-deploy-firebase/plan.md   **Scope**: increment 1 (phases 1-2, full plan)   **Date**: 2026-10-11
**Round**: 1   **Verdict**: APPROVED   **Findings**: 2

Diff base: `60d15d3` (stacked on the archived `szkielet-aplikacji-offline`), head `029cb26`. Code part of the diff: one file (`.github/workflows/ci.yml`, +58/-1), so both passes were done inline without evidence subagents. No `context/architecture/` model, so the boundary gate does not apply. Not bug mode.

## File classification
| File | Class |
|---|---|
| `.github/workflows/ci.yml` | in plan AND diff (Phase 1) |
| `README.md` | in plan AND diff (Phase 2) |
| `context/foundation/tech-stack.md` | in plan AND diff (Phase 2) |
| `context/changes/ci-deploy-firebase/*` | change record |

No unplanned files; no planned file missing.

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Plan adherence (inline)
- Concurrency: `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}` (`ci.yml:13`) — MATCH.
- Artifact: "Upload dist" right after Build, `name: dist`, `retention-days: 1`, `if-no-files-found: error` (`ci.yml:45-51`) — MATCH. `dist/` has no dotfiles, so upload-artifact v4's hidden-file exclusion drops nothing.
- `deploy-preview` (`ci.yml:71-93`): `needs: check`, same-repo `pull_request` condition, permissions `contents: read`, `pull-requests: write`, `checks: write`, checkout + download into `dist` + action with `repoToken`, secret, `projectId: grajek-app`, no `channelId` — MATCH.
- `deploy-live` (`ci.yml:96-114`): `needs: check`, `push` to `refs/heads/main`, `contents: read` only, `channelId: live` — MATCH.
- Existing check steps unchanged; `package.json`, `firebase.json`, `.firebaserc`, app code untouched — MATCH with "What we're NOT doing".
- README `## Publishing` and `### One-time setup` carry every element of the Phase 2 contract (both setup paths, "no" to generated workflows, delete `key.json`); "Other static hosts" and the cache-header list stay — MATCH.
- `tech-stack.md` `## CI/CD` updated; `updated:` is already `2026-10-11` (same day), so no bump was needed — MATCH.

## Safety notes
- Secrets are referenced only in the two deploy jobs; `check` keeps the read-only top-level token. Fork PRs cannot reach the secret (job skipped, and GitHub withholds secrets anyway). No `pull_request_target`, no `workflow_run`.
- On `pull_request` the checkout and the artifact are both the merge commit, so the deployed `dist/` matches the files `firebase.json` is read from.
- On `main`, GitHub keeps at most one pending run per concurrency group; a superseded pending run is replaced by the newer one, so the latest merge is what ends up live. Acceptable.

## Findings
### F1 — Hand-made service account may lack roles the preview deploy uses
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: README.md (One-time setup, path b, step 1)
- **Detail**: Path (b) grants only **Firebase Hosting Admin**. `firebase init hosting:github` (path a) grants a wider set (including API Keys Viewer and Firebase Authentication Admin), and preview-channel deploys try to add the channel domain to Auth's authorized domains; with Hosting Admin only that step may log a warning. The brief records the role as a requester-stated assumption ("Open risks & assumptions").
- **Fix**: If the first preview deploy with a hand-made account fails on permissions, add API Keys Viewer to the account and to the README.
- **Decision**: ACCEPT — matches the recorded assumption in plan-brief.md "Open risks & assumptions"; verified by Manual 1.7.

### F2 — One-day artifact retention limits late re-runs of a deploy job
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:50
- **Detail**: Re-running only a failed deploy job more than a day later finds no `dist` artifact and fails; the whole workflow must be re-run instead.
- **Fix**: None needed; re-run the full workflow.
- **Decision**: ACCEPT — `retention-days: 1` is specified by the plan (Critical Implementation Details, Artifact).

## Success criteria
| # | Command / check | Result |
|---|---|---|
| 1.1 | `npx --yes js-yaml .github/workflows/ci.yml` | PASS (parses) |
| 1.2 | parsed workflow: action steps | PASS — `[deploy-preview, needs check, grajek-app]`, `[deploy-live, needs check, grajek-app, live]`, exactly two |
| 1.3 | job `if:` conditions | PASS — preview requires head repo == repository; live requires `refs/heads/main`, `channelId: live` |
| 1.4 | permissions / secrets scope | PASS — top-level `{contents: read}`; write scopes only in `deploy-preview`; `secrets.` only in the two deploy jobs |
| 1.5 | `grep -c firebase package.json` | PASS — `0` |
| 1.6 | `pnpm lint`, `pnpm typecheck`, `vitest run --reporter=json`, `pnpm build` | PASS — all exit 0; 7 files, 11 tests, 0 failed |
| 2.1 | `grep -nE "firebase(-tools)? (login\|deploy)" README.md` | PASS — no match |
| 2.2 | greps for secret name, `init hosting:github`, `Firebase Hosting Admin`, `gh secret set` | PASS — 3/1/1/1 matches |
| 2.3 | `tech-stack.md` `## CI/CD` | PASS — mentions Firebase Hosting, no "no remote configured yet" |

Manual (pending, unchecked, diff evidence present for each): 1.7 preview comment after the secret exists (`deploy-preview` job), 1.8 live site after merge (`deploy-live` job), 1.9 fork PR skips preview (`if:` condition), 2.4 developer can follow either README path (One-time setup section). They go to the `manual-pending` guard. The first two cannot pass until the user creates the secret `FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP`; until then `deploy-preview` on this PR is expected to fail.
