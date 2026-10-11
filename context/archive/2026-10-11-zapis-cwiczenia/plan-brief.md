# Log a practice session with the current-week view — Plan Brief
Full plan: `context/changes/zapis-cwiczenia/plan.md` · request text: `change.md` · roadmap slice S-02 in `context/foundation/roadmap.md`

## What & why
North star S-02 (FR-005, FR-006 week only, US-01 without the goal): the student logs a practice session in about 10 seconds, at most 3 taps, offline, and sees today's Dzień z muzyką in the current week. If children will not log daily, nothing else in the product has anything to build on.

## Starting point
S-01 ships a home screen with a greeting and the instrument, and nothing else. Storage is an append-only migration list at v2 (`src/storage/migrations.ts:18-28`). `openDb` has no `blocking`/`terminated` handling (`src/storage/db.ts:28-34`), and the profile store caches one connection forever (`src/profile/profileStore.ts:84-95`). Both are flagged by S-01 review F2 for the slice that adds v3.

## Desired end state
Home screen: "Zagrałem!" → duration chip (last used preselected) → "Zapisz". The note and emoji sit behind "Dodaj więcej". Below the button, a Pn–Nd row highlights days with music, keeps empty days neutral and outlines today. Everything works in airplane mode and survives an offline reload. Old tabs close their connection when the schema upgrades.

## Complexity
MEDIUM. It adds a schema migration, a storage-contract change (connection lifecycle and rollback fallback) and a new UI flow across about 15 files. Each part is well understood and lives in one area.

Skipped: rs-research (the app is about 20 source files, all relevant ones read in planning) and rs-frame (the request states PRD outcomes, not a cause or a fix). Jev was not asked: Python is not installed on this machine, so `jev-decide.py` cannot run, and both steps were decided per rs-core §1.

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Area split | One area A1 `zapis-cwiczenia` → one increment | Store, flow and week view ship together as one feature | Orchestrator |
| Optional steps | Skip rs-research and rs-frame | Small codebase read directly; outcome-shaped request | Auto |
| Record schema | v3 store `practices` (keyPath `id`), index `byDay`; record holds id, instrumentId, durationMinutes, local `day` `YYYY-MM-DD`, createdAt ISO, optional note and emoji | A day stays stable across time-zone changes; week, month and "today" become index ranges for S-03, S-04 and S-08 | Consult |
| Connection lifecycle | `openDb` closes and flags on `blocking`/`terminated`; a shared `createConnection` helper reopens; the profile store moves onto it | S-01 review F2; one helper instead of a second copy of the stale cache | Consult |
| Rollback | `VersionError` fallback (retry once without a version); documented rollback is "revert the UI, keep v3"; the S-01 build is not a valid rollback | Old builds can read their stores while migrations stay additive (`migrations.ts:3-7`) | Consult |
| Additive-only rule | Comment in `migrations.ts`: never delete or rename a store or index | The fallback is safe only under this rule | Consult |
| Parallel migrations | Whoever merges second (F-02 / S-07) rebases, appends after, updates version tests | Version = list length (`db.ts:28`) | Orchestrator |
| Tap flow | Open → pick duration → Zapisz (3 taps worst case, 2 with the preselected last duration) | FR-005: at most 3 taps; optional fields add taps only when chosen | Auto |
| Duration input | Chips 5/10/15/20/30/45/60 min, default 15, last used preselected | No typing for a 7-year-old (NFR Czytelność) | Auto |
| Optional fields | Collapsed "Dodaj więcej": note ≤80 chars and an emoji from a fixed set of 5 | FR-005 challenge: collapsed by default; encouraging tone only | Issue |
| Week definition | Monday–Sunday, local time; "now" recomputed on `visibilitychange` | Polish convention; a PWA left open overnight | Auto |
| Week view content | Highlight music days, neutral empty days, outline today; no counter or goal | FR-006 week only; goal progress is S-03 | Issue |
| Instrument | Use the single `profile.instrument.id`; no picker | S-09 adds the choice | Auto |
| Edit/delete/past-day logging | Out of scope | Not in FR-005; keeps the visit short | Auto |
| Navigation | No router; in-place panel on the home screen | Matches the screen switching in `App.tsx` | Auto |
| Increment visibility | `User-visible: yes` | New UI and a schema migration | Auto |

## Scope
In: migration v3, connection lifecycle and fallback, shared connection helper, practice store and week math, 3-tap log panel, week view, App wiring, unit and e2e tests.
Out: weekly goal (S-03), month view (S-04), badges, share card, reminders, several instruments, editing sessions, other weeks.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Practice logging with the current-week view | — | yes | Migration version collision with F-02 / S-07 |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | Schema v3, connection lifecycle, VersionError fallback, shared helper | Lifecycle hard to test in `fake-indexeddb` |
| 2 | 1 | Practice store and local-time week math | UTC vs local day key |
| 3 | 1 | 3-tap log panel on the home screen | Optional fields creeping into the required path |
| 4 | 1 | Week view and offline e2e | SW control timing in e2e |

Prerequisites: S-01 (merged in the stack at 246ca4d).

## Open risks & assumptions
- An S-01 tab (no handler) can delay the first v3 upgrade until it is reloaded. This is accepted because `autoUpdate` reloads on the next start.
- Version collision with parallel F-02 / S-07 migrations: the merge-order rule is in the plan's Migration Notes.
- The 10-second target is checked manually on a phone.

## Success criteria (summary)
`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm test:e2e` all green. Tests cover the 3-tap save, same-day-once highlighting, the local day key near midnight, the v2→v3 upgrade, blocking-close and the VersionError fallback. Two manual checks on a phone: the timing and feel, and the neutral empty days in airplane mode.
