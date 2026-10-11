# Student profile with name and instrument — Plan Brief
Full plan: `context/changes/profil-i-instrument/plan.md` · request text: `change.md` · roadmap slice S-01 in `context/foundation/roadmap.md`

## What & why
FR-001: the student creates one on-device Profile (name or pseudonym + one instrument) that survives closing and reopening the app. It is the prerequisite of S-02 (north star: logging practice) and S-07.

## Starting point
F-01 (stacked, not yet on main) ships a static welcome screen and an IndexedDB storage contract with an append-only migration list holding one empty v1 migration (`src/storage/migrations.ts:19-22`). Nothing stores product data yet; the app never opens the database at runtime (`src/main.tsx`).

## Desired end state
First launch shows a Polish create screen (heading, greeting, name field, instrument buttons with "Inny"); after "Gotowe" the profile screen greets the student by name with the instrument. Reopening the app, online or offline, shows the profile again.

## Complexity
LOW — one area, a small additive schema change and two screens on an existing storage contract; the only non-routine choice was the data shape (consulted). Not TRIVIAL: it adds a migration and a schema.

Skipped: rs-research (the whole app is about ten source files, read in full during planning) and rs-frame (the request states an observable PRD outcome, not a cause or a fix); Jev not asked (dry mode per caller, and `python3` is not on PATH), so both were decided per rs-core §1.

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Area split | One area A1 "Profil ucznia" (data model + create/view screen) → one increment | Orchestrator split; the UI cannot ship without the store and both are small | Orchestrator |
| Optional steps | Skip rs-research and rs-frame | Small codebase read in full; outcome-shaped request | Auto |
| Schema | Migration v2: store `profile` (fixed key `current`) + store `instruments` (keyPath `id`, uuid) holding one row | Stable instrument id for S-02; S-09 adds rows without a data migration; fixed key enforces one profile per device | Consult |
| Storage API | `ProfileStore` interface (`load`, `create`) over `openDb()`; App takes an optional `store` prop | Keeps the UI off IndexedDB; injectable in tests | Auto |
| Instrument input | Preset list with icons + "Inny" free text, stored as the display label | PRD: any instrument; NFR Czytelność: icons, little typing | Auto |
| Validation | Trimmed name 1-24 chars; instrument required, "Inny" text 1-24 chars | Short labels fit the profile screen and the later share card | Auto |
| Edit/delete profile | Not in this change | FR-001 asks for create + persistence only; several profiles are parked | Auto |
| Second profile | `create` refuses when a profile exists | "One profile per device" in the request | Issue |
| Loading state | Render an empty frame until the load resolves | A returning student must not see the form flash | Auto |
| Routing | No router; App switches on profile state | Two screens, no URL navigation needed | Auto |
| First-launch copy | Create screen keeps h1 `Grajek` and `GREETING` | Keeps the F-01 offline e2e test valid unchanged (`e2e/offline.spec.ts:3-24`) | Auto |
| Migration rollback | Additive; the F-01 build never opens the DB, so redeploying it is safe | `src/main.tsx:8-26` | Auto |
| Increment visibility | `User-visible: yes` | New screens; the child's name is stored on the device | Auto |

## Scope
In: schema v2, profile store + tests, create screen, profile screen, App wiring, e2e reload/offline persistence.
Out: more instruments (S-09), editing/deleting the profile, practice logging, goals, reminders, any network or export.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Profile storage, create and view screen, persistence e2e | — (F-01 is the base branch) | yes | A long first-launch form discourages a 7-year-old |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | Migration v2 + ProfileStore + unit tests | Editing the v1 migration instead of appending |
| 2 | 1 | Create/profile screens, App wiring, component tests | Async load breaks the existing synchronous App tests |
| 3 | 1 | Playwright reload + offline reload spec | Service worker control timing before the offline reload |

Prerequisite: F-01 (`szkielet-aplikacji-offline`) merged before this PR, since the branch is stacked on it.

## Open risks & assumptions
- The child's name is personal data, called for by FR-001 and stored only on the device (NFR Prywatność); nothing sends it anywhere.
- iOS may evict IndexedDB under storage pressure; F-01's `requestPersistentStorage` is the mitigation, data export is an open roadmap question.
- F-02 runs in parallel and may also append a migration; a conflict in `src/storage/migrations.ts` is resolved by appending after the merged one, never editing it.

## Success criteria (summary)
`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:e2e` pass; manual: phone viewport fit and a real-phone close/reopen check.
