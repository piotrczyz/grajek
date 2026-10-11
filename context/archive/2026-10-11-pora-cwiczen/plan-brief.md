# Pora ćwiczeń (practice time) — Plan Brief
Full plan: [plan.md](plan.md) · request: [change.md](change.md) · roadmap slice S-07: `context/foundation/roadmap.md:151`

## What & why
FR-003: the student sets when and where they practise, optionally differently on chosen weekdays, and sees today's practice time on the home screen. It is the data S-08 (one gentle daily reminder) will build on.

## Starting point
Profile (S-01) on top of the offline skeleton (F-01). IndexedDB schema at v2 (`profile`, `instruments`); `openDb` has no version-change handling (S-01 review F2, deferred to the first v3 slice). The home screen is `ProfileScreen`, rendered by `App` once a profile exists.

## Desired end state
Below the profile: "Ustal porę ćwiczeń" or "Dziś: 17:00 · W domu" + "Zmień". An inline editor sets the default time/place and per-weekday overrides. Data persists offline; failures never break the home screen.

## Complexity
MEDIUM — one area and one increment, but it adds a DB migration, fixes connection lifecycle in the shared storage contract (F2), and ships a new screen state with per-weekday editing; parallel changes touch the same migration list.

Skipped: rs-research (the whole relevant code — storage, profile, App — is under 400 lines and was read in full) and rs-frame (the request states an outcome from the roadmap, not a cause or a fix; scope is set by FR-003). Jev was unavailable (dry mode), so both were decided here.

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Areas | A1 pora-cwiczen (storage, editor, home display), builds on S-01 | Orchestrator split, kept as is | Orchestrator |
| Increments | One increment, 4 phases | One area; storage without UI is not useful on its own and the plan stays within 4 phases | Auto |
| Research / framing | Both skipped | Small, fully read codebase; request is an outcome | Auto (Jev unavailable) |
| Where to persist | New `practiceTime` object store via appended migration v3 | Keeps data that may leave the device (practice time, PRD `prd.md:106`) apart from the never-leaves `profile` store (`profileStore.ts:4-7`); renumbering against parallel F-02/S-02 is cheap pre-launch | Consult |
| Migration rule | Append a new entry, never edit existing ones; second-to-merge renumbers on rebase | `migrations.ts:4-9`; orchestrator constraint | Orchestrator |
| F2 (versionchange) | Fix in this change: `blocking`/`terminated` close + `onClose`; shared `createConnection` helper used by profile and practice-time stores | This change bumps the version; review deferred F2 to the v3 slice (`impl-review-inc-1.md:72`) | Orchestrator |
| Rollback | Revert feature code, keep the v3 migration entry; never ship a shorter migration list | Downgrading `openDB` version raises `VersionError`; an empty extra store is harmless | Auto |
| Module placement | `src/practice-time/` with its own store, domain, copy, card | Orchestrator constraint; mirrors `src/profile/` | Orchestrator |
| Home-screen change | One `<PracticeTimeCard />` mount (+ import) in `App.tsx` profile branch | Minimal churn next to parallel S-02 | Orchestrator |
| Editor placement | Inline state of the card, not a new `App` screen | Keeps `ScreenState` (`App.tsx:9-13`) untouched; no router in the app | Auto |
| First-run step | None; practice time is optional from the home screen | Roadmap S-07 risk: extra start step lengthens first launch | Auto |
| Data shape | `default` slot + `overrides` keyed by ISO weekday 1-7; slot = `{time "HH:MM", place}` | FR-003 "inna pora dla wybranych dni"; ISO weekday is unambiguous for S-08 | Auto |
| Override content | Full slot (time and place), prefilled from default | Glossary: moment and place may differ per day (`glossary.md:27-29`) | Auto |
| Place input | Required free text, max 24, prefilled "W domu" | Same limit as names (`profileStore.ts:36`); prefill keeps it to one tap for most kids | Auto |
| Default time | 17:00 prefilled | PRD example uses 17:00 (`prd.md:75`) | Auto |
| "Today" | Local device date at render; no midnight refresh | Visits under 30 s (PRD NFR) | Auto |
| Load failure | Card renders nothing; save failure shows `RETRY_MESSAGE`, keeps editor | Home screen must keep working; reuse S-01 copy (`copy.ts:4`) | Auto |
| No "rest day" flag | Out of scope | Not in FR-003; S-08 decides reminder days | Auto |

## Scope
In: migration v3, F2 fix, connection helper, practice-time domain/store, card (display + editor), one-line mount, unit/component/e2e tests.
Out: notifications, server sync, rest days, first-run step, Profile changes, routing.

## Architecture / Approach
`src/storage` gains v3 + lifecycle handling; `src/practice-time/` owns everything else; `App.tsx` mounts the card. `slotFor(practiceTime, date)` is the API S-08 will reuse.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Practice time stored, editable and shown on home | — | yes | Migration number collides with parallel F-02/S-02 |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | Migration v3, F2 handling, `createConnection`, profile store on the helper | `blocking` test behaviour in fake-indexeddb |
| 2 | 1 | Domain model, validation, `slotFor`, store | Weekday mapping (Sunday) |
| 3 | 1 | `PracticeTimeCard` + mount | Usability of per-day editing for 7–13 year olds |
| 4 | 1 | E2E persistence online/offline | Service-worker timing (reuse S-01 pattern) |

Prerequisites: S-01 merged (this branch is stacked on it); dependencies installed.

## Open risks & assumptions
- F-02 already has its own v3 (`device`) and S-02 will add one: the change merged second moves its entry down on rebase; tests avoid exhaustive store lists.
- F-02/S-02 may also add F2 handling in `db.ts`; the first to merge owns it, the others drop theirs.
- Card in `App` opens the default `grajek` DB in `App.test.tsx` (fake-indexeddb); assumed harmless, verified by the unchanged App suite.

## Success criteria (summary)
`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:e2e` pass; manual phone usability check of the editor.
