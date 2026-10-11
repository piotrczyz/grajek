# Month view and lifetime total — Plan Brief
Full plan: `context/changes/widok-miesiaca/plan.md` · request text: `change.md` · roadmap slice S-04 in `context/foundation/roadmap.md`

## What & why
S-04 / FR-006: the student opens "Mój miesiąc" and sees the current month with music days highlighted (empty days neutral), the counter "Dni z muzyką w tym miesiącu: N", and the lifetime total of music days and practice time, which only grows. After a break the student sees what was earned, never a failure message.

## Starting point
S-02 already stores every session in IndexedDB `practices` (index `byDay`, migration v4, DB version 4). `PracticeStore` has no delete/edit, so totals only grow. `WeekView` defines the visual language; `PracticeTimeCard` is the self-contained card pattern rendered from `App.tsx`.

## Desired end state
One collapsed toggle on the home screen; opened, it shows month heading, counter, Monday-first grid and lifetime line, read fresh from the device, offline. No charts, no month navigation, no streaks.

## Complexity
LOW — read-only queries over an existing store plus one new component in a new module; two phases, no schema, no dependency, no contract change. Not TRIVIAL (about 10 planned files, an e2e spec).

Skipped: rs-research (shape clear from S-02 code and a direct read of `practiceStore.ts`, `week.ts`, `WeekView.tsx`, `App.tsx`); rs-frame (request states an observable outcome from the roadmap/PRD, not a cause or fix). Jev not asked: unavailable (no Python on this machine, per orchestrator).

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Areas | One area A1 `widok-miesiaca`, one increment | Request Areas block; prefer a single increment | Orchestrator |
| Schema | No migration, no version bump; read `practices` + `byDay` | Requester constraint; store and index already exist (`src/storage/db.test.ts:122-131`) | Issue |
| App.tsx touch | Only one import + one `<MonthCard />` after `<PracticeTimeCard />` | Requester constraint: parallel S-03/S-06 edit App.tsx | Issue |
| Deploy | None | Requester constraint | Issue |
| Data access | New read-only `src/month/monthStore.ts` over `practices`, not new methods on `PracticeStore` | Keeps S-02 interface and its fakes untouched; file-disjoint from parallel work | Auto |
| Placement | Self-contained card rendered from App, not inside `ProfileScreen` | `ProfileScreen` is the likely S-03 conflict point; card pattern exists (`src/practice-time/PracticeTimeCard.tsx:52`) | Auto |
| Visibility | Collapsed "Mój miesiąc" toggle, closed by default | NFR Czas w aplikacji and S-04 risk "browsing instead of leaving"; keeps home short and App tests unaffected | Auto |
| Freshness | Load on every opening and on visibilitychange while open | No coupling to ProfileScreen save state (`src/profile/ProfileScreen.tsx:34-47`) | Auto |
| Month scope | Current month only, no navigation | "Jeden prosty widok" (FR-006 challenge) | Auto |
| Lifetime definition | Distinct `day` count + sum of `durationMinutes` over all records, any instrument | PRD Business Logic: Dzień z muzyką on any instrument; "wszystkie dni i godziny" | Auto |
| Time format | "45 min" / "2 godz." / "12 godz. 30 min"; "1 dzień" vs "N dni" | Child-friendly Polish, abbreviation avoids hour plurals | Auto |
| Empty lifetime | Encouraging first-step line instead of zeros | PRD tone "wyłącznie zachęcający" | Auto |
| Visual language | Reuse WeekView classes (amber + ♪, neutral `bg-white/10`, ring for today) | `src/practice/WeekView.tsx:15-16`; FR-006 "puste neutralne, nie czerwone" | Auto |
| Load failure | Shared neutral `RETRY_MESSAGE` + retry | Existing pattern in App/PracticeTimeCard | Auto |
| Diff checks base | `e4e6ed3..HEAD`, not `main` | Branch is based on unmerged prerequisites | Auto |

## Scope
In: `src/month/` (helpers, read-only store, copy, MonthCard, tests), a 2-line hook in `src/App.tsx`, `e2e/month.spec.ts`.
Out: migrations, `PracticeStore`/`ProfileScreen`/`WeekView` edits, month navigation, per-instrument stats (S-09), goal progress (S-03), badges (S-05), deploy.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Month view and lifetime total | — | yes | App.tsx merge conflict with S-03/S-06 (kept to 2 lines) |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | Calendar/format helpers + read-only month store, unit-tested | Local-date/DST bugs at month edges |
| 2 | 1 | MonthCard, copy, App hook, e2e | Polish copy/plural forms |
Prerequisites: S-02 (`practices` store), present on this branch (archived, not yet on `main`).

## Open risks & assumptions
- The branch builds on unmerged F-01 → S-01 → S-07 → S-02; it must merge after them.
- App.tsx will likely conflict textually with S-03/S-06; the conflict is a 2-line addition.

## Success criteria (summary)
Unit, component and e2e tests pass; typecheck, lint, build pass; no change under `src/storage`; App.tsx diff is the import and one element; manual phone-viewport check of the opened month.
