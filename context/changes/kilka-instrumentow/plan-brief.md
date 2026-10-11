# Several instruments (S-09) — Plan Brief
Full plan: `context/changes/kilka-instrumentow/plan.md` · request: `change.md` · roadmap slice S-09 in `context/foundation/roadmap.md` · PRD FR-009

## What & why
FR-009 (nice-to-have): a student who plays more than one instrument can add it
to the Profile, pick it when logging, and see stats per instrument and
together. A Dzień z muzyką and the weekly goal stay shared across instruments.

## Starting point
The `instruments` store (v2) already accepts many rows and every practice
carries `instrumentId`, but `ProfileStore` exposes only the oldest instrument
and cannot add one; `LogPractice` takes a single fixed instrument id; week,
month and lifetime queries already ignore the instrument.

## Desired end state
"Moje instrumenty" card with per-instrument days and time, a "Razem" line and
"Dodaj instrument"; an instrument chip row in the log panel only when there are
2+ instruments, preselected to the last used; the header shows the last used
instrument; same-day sessions on two instruments are one Dzień z muzyką.

## Complexity
MEDIUM — four layers (profile store, practice store, a new read-only stats
module, two UI surfaces plus App wiring) and e2e coverage, but no schema change,
no new dependency and no server part.

Skipped: rs-research (the store, UI and query code was read directly and is
small; `file:line` grounding is in plan.md) and rs-frame (a roadmap slice with
a stated outcome, not a cause or a fix; scope is set by FR-009 and the request).
Jev not asked: Python is not available on this machine, decided directly.

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Area split | One area A1 (whole slice), one increment | Parts form one dependent chain; base stack unmerged | Orchestrator |
| Research / framing | Both skipped | Shape clear from slice + code read; no stated cause | Auto |
| IndexedDB migration | None; DB stays at v5 | `instruments` store keyed by `id` already holds many rows (`src/storage/migrations.ts:28-31`) | Auto |
| Where "last used" comes from | Derived from the latest practice (`lastPractice()`) | Same lookup as `lastDuration()` (`src/practice/practiceStore.ts:117-126`); no second source of truth, no extra write per save | Auto |
| Stats storage | New read-only `src/instruments/` module scanning `practices` once | Mirrors `monthStore.lifetime()` (`src/month/monthStore.ts:48-57`); no index, no migration | Auto |
| Combined stats semantics | Distinct days across instruments + summed minutes | Request: Dzień z muzyką independent of instrument; matches existing lifetime total | Issue |
| Picker with one instrument | Not rendered | Request: no extra tap with one instrument; existing 3-tap e2e must stay green | Issue |
| Default instrument | Last session's instrument if still owned, else the oldest | PRD FR-009 challenge: suggest last used | Issue |
| `Profile` shape | Add `instruments[]`, keep `instrument` (oldest) | Existing consumers (`ShareCardButton`, tests, parallel branches) keep compiling | Auto |
| Add-instrument API | `ProfileStore.addInstrument(name)` in one readwrite tx; reasons duplicate / limit / empty / too long; `missing` when no profile | ProfileStore already owns the `instruments` store (`src/profile/profileStore.ts:71-127`) | Auto |
| Instrument limit | `MAX_INSTRUMENTS = 6` | Keeps chip rows and the card on one phone screen; children rarely play more | Auto |
| Duplicate names | Rejected, case-insensitive | Two identical chips would be indistinguishable in the log panel | Auto |
| Where adding lives | "Moje instrumenty" toggle card on the home screen | No routing/settings screen exists; follows MonthCard/PracticeTimeCard pattern; minimal `App.tsx` edit | Auto |
| Progress Card | Unchanged model; shows the last used instrument | Card model takes one name (`src/progress-card/cardModel.ts:9-15`); keeps S-06 files out of scope | Auto |
| Month view | Unchanged | Already instrument-independent; its "Razem" is the combined total | Auto |
| Rename/delete instruments | Out of scope | Not in FR-009; deleting would orphan practices | Auto |
| Merge-conflict containment | `App.tsx`: one import, one element, one callback; `ProfileScreen`: header, last-practice effect, LogPractice props only | Request: minimal edits (parallel S-03/S-08) | Issue |

## Scope
In: profile store add/list, practice `lastPractice`, stats module, log-panel
picker, header instrument, instruments card, App mount, unit/component/e2e tests.
Out: migrations, rename/delete, month view, Progress Card model, per-instrument
goals, reminders, deploy.

## Architecture / Approach
Data stays where it is owned (profile store owns instruments, practice store owns
the log); stats are a read-only projection in a new module; UI follows the
existing toggle-card pattern.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Several instruments with per-instrument and combined stats | — | yes | Merge conflicts in `ProfileScreen.tsx` / `App.tsx` with S-03/S-08 |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | Profile `instruments[]`, `addInstrument`, `lastPractice` | Widened interfaces break test fakes |
| 2 | 1 | Pure stats + read-only stats store | Combined days miscounted as a sum |
| 3 | 1 | Log-panel picker, last-used header | Extra tap sneaks into the one-instrument path |
| 4 | 1 | "Moje instrumenty" card, App wiring, e2e | App.tsx conflict with parallel slices |

Prerequisites: S-01, S-02 (done); S-04/S-06 done and untouched.

## Open risks & assumptions
- S-03 (weekly goal) is assumed to count days from `listWeek` / `practices`
  without an instrument filter; nothing here filters, and a regression test pins it.
- `ProfileScreen.tsx` and `App.tsx` will likely conflict textually with S-03/S-08;
  the edits are kept small and local to ease the rebase.

## Success criteria (summary)
Full unit suite, lint, typecheck and build green; new e2e add → choose →
offline-reload path green; existing 3-tap practice e2e unchanged and green;
manual: 10-second log with two instruments, card legibility on a phone.
