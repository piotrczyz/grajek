# Practice backdating (up to 3 days back) — Plan Brief
Full plan: `context/changes/cwiczenie-wstecz/plan.md` · issue text: `change.md` (issue #17)

## What & why
Students who forgot to log practice can add it afterwards, for up to 3 days
back, so a practised day is not lost for good ("reward effort").

## Starting point
`practiceStore.add` always stamps today (`src/practice/practiceStore.ts:110-121`);
the log panel has no day choice; the week view is display-only. Month, goal,
badges and stats already count by `practice.day`, so they need no change.

## Desired end state
Day chips (Dziś preselected · Wczoraj · Przedwczoraj · weekday of 3 days ago) in
the panel; empty past days of the last 3 in "Ten tydzień" open the panel with
that day; "Super! Dopisane do <dnia>." after a backdated save; the store rejects
days outside today..3 back with `PracticeError`.

## Complexity
LOW — one module (`src/practice`) plus the home screen; no schema, migration,
dependency or contract change; the approach is clear from the code.
Skipped: rs-research (the issue names the files and a read confirmed them);
rs-frame (the issue states an observation and a bounded scope, nothing to reframe). Jev unavailable this run.

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Areas | A1 practice-backdating → increment 1 | single area, builds on nothing | Orchestrator |
| Research / framing | Both skipped | shape clear from issue + read of `src/practice/*`, `ProfileScreen.tsx` | Auto |
| Increments | One increment, 3 phases | one area, one deployable feature; files all in `src/practice` + home screen | Auto |
| Window definition | Shared `backdateDays(now)` helper in `week.ts` | store, chips and week view must agree; `week.ts` already owns local-date logic (`week.ts:13-25`) | Auto |
| Store input | Optional `NewPractice.day` (day key); absent = today at save time | preserves the midnight behaviour (`ProfileScreen.tsx:97-99`, `App.test.tsx:259`) and AC-02 | Auto |
| Invalid day | `PracticeError('invalid','day')`, new reason `day` | issue AC-04; follows existing reasons (`practiceStore.ts:54`) | Issue |
| Selected day in the panel | Day key, not an offset; "Dziś" omits `day` | an offset would change meaning across midnight | Auto |
| 3-days-ago chip label | Existing short label (e.g. "Cz"), full name as accessible name | consistent with the week row (`week.ts:33-41`); issue's "Czw" is an example | Auto |
| Day group label | "Kiedy grałeś?" | radiogroup needs a name; matches "Na czym grałeś?" tone (`copy.ts:6`) | Auto |
| Save message | Today: "Super! Zapisane." unchanged; past: "Super! Dopisane do <genitive weekday>." | issue AC-01/AC-02; Polish "do" takes the genitive | Issue + Auto |
| Tappable week days | Only empty days in the window, not today, only while the panel is closed | issue FR-002 / AC-03 / AC-04; avoids two panels | Auto |
| Previous-week days | Not shown/tappable; reachable through chips | week view shows the current week only (`ProfileScreen.tsx:122`) | Auto |
| `lastPractice` ordering | Unchanged | only affects preselection; out of scope | Auto |
| Downstream views (month, goal, badges) | No change | all key off `day` (`badgeRules.ts:71`, `monthStore.ts:45`, `WeeklyGoalCard.tsx:92`) | Auto |
| Tests | Vitest unit + App flow with faked Date + one Playwright spec with fixed clock | existing patterns (`App.test.tsx:259`, `e2e/weekly-goal.spec.ts:9`) | Auto |

## Scope
In: issue scope items 1-4, AC-01..AC-05. Out: more than 3 days back, future
days, editing/deleting sessions, schema changes.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Backdated logging from chips and week view | — | yes | day boundary / time-zone edge cases |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | store `day` + window helper | DST/month-boundary key math |
| 2 | 1 | day chips, tappable week days | "Dziś" must stay one-tap-free |
| 3 | 1 | home-screen wiring, message, e2e | midnight regression |

## Open risks & assumptions
- Genitive weekday in the message is an interpretation of the issue's "<dzień>".
- No decision-to-verify guards.

## Success criteria (summary)
Full `pnpm test`, `pnpm lint && pnpm typecheck`, `pnpm build`, the new and
existing practice e2e specs pass; manual phone check that past days look
neutral but tappable.
