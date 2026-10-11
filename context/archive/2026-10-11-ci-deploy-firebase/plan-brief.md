# Deploy to Firebase Hosting from GitHub Actions — Plan Brief
Full plan: `context/changes/ci-deploy-firebase/plan.md` · request text: `change.md`

## What & why
Publishing is manual today (README tells a developer to run `firebase-tools deploy`
locally). The client wants CI to publish: a preview link on every PR and the live
site updated on every merge to `main`, both only after the checks pass.

## Starting point
`ci.yml` has one `check` job (lint, typecheck, unit, build, e2e) on every push/PR,
`contents: read`, cancel-in-progress concurrency. `firebase.json` / `.firebaserc`
already target `grajek-app`. No artifact upload, no deploy job, no deploy script.

## Desired end state
Same-repo PR → `check` → `deploy-preview` (preview channel, URL commented on the PR).
Fork PR → `check` only. Push to `main` → `check` → `deploy-live`. README documents the
secret setup; no local deploy path remains.

## Complexity
LOW — two files outside `context/` and one stack-record line, no app code. Not
TRIVIAL because it introduces a CI secret and write permissions (a security
boundary in CI), which the gating and permission criteria check explicitly.
Skipped: rs-research (the whole surface is `ci.yml`, `firebase.json`, `README.md`,
read in full) and rs-frame (the request states an outcome, not a cause; scope is
fixed by the requester). Jev not consulted: `jev-decide.py` unavailable (no python3).

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Area split | One area A1 (CI/CD deploy pipeline), one increment | Orchestrator split; files `ci.yml`, `README.md` form one deployable unit | Orchestrator |
| Research / framing | Skip both | Surface fully read (`ci.yml:1-55`, `firebase.json`, `README.md`); request is outcome-shaped | Auto |
| Where deploy lives | New jobs in `ci.yml` with `needs: check` | Reuses the existing gate (`ci.yml:15-43`) without duplicating steps; `workflow_run` and a duplicated `deploy.yml` rejected | Auto |
| What gets deployed | `dist/` artifact uploaded by `check`, downloaded by deploy jobs | Ships exactly the build the checks validated; no second build | Auto |
| Deploy action / secret | `FirebaseExtended/action-hosting-deploy@v0`, `secrets.FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP`, `projectId: grajek-app` | Named by requester; project from `.firebaserc:3` | Issue |
| Preview scope | Only `pull_request` events with head repo == this repo | Requester: no forks; fork PRs get no secrets anyway | Issue |
| Live scope | Only `push` to `refs/heads/main`, `channelId: live` | Requester | Issue |
| Permissions | Top-level `contents: read`; preview adds `pull-requests: write`, `checks: write`; live nothing extra | Requester + action docs; least privilege | Issue |
| Concurrency on main | `cancel-in-progress` false on `main`, true elsewhere | `ci.yml:12` would cancel a live deploy mid-flight; queued runs keep deploy order | Auto |
| Preview channel id / expiry | Action default (per-PR channel, 7 days) | No requirement to change; fewer knobs | Auto |
| `firebase init hosting:github` side effect | README says not to commit its generated workflows | They would deploy a second time without the gates | Auto |
| Local deploy | Removed from README, no `package.json` script | Requester | Issue |
| Tech-stack record | Update `## CI/CD` line | Keeps `tech-stack.md` true (remote now exists) | Auto |
| User-visible | `no` | No app change; the site only changes through later merges | Auto |

## Scope
In: `ci.yml` deploy jobs + artifact + concurrency tweak; README `## Publishing`; tech-stack line.
Out: secret / service-account creation, environments, branch protection, fork previews, app code.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Deploy pipeline + setup docs | — | no | Cannot be proven end to end until the secret exists |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | Deploy jobs in `ci.yml` | Wrong condition deploys from the wrong event |
| 2 | 1 | README setup + tech-stack line | Setup steps drift from Firebase CLI prompts |

## Open risks & assumptions
- Until the user adds the secret, `deploy-preview` on this change's own PR will fail; that is expected and documented.
- Role "Firebase Hosting Admin" is assumed sufficient for a static, hosting-only deploy (as the requester states).

## Success criteria (summary)
YAML parses; deploy jobs gated on `check` with the right conditions, permissions and
secret scope; no firebase in `package.json`; app suites green; README has the two
setup paths and no local deploy. Manual: first preview comment, first live deploy,
fork PR skips preview.
