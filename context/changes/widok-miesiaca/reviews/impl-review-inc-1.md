<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Month view and lifetime total

**Plan**: context/changes/widok-miesiaca/plan.md   **Scope**: increment 1 (phases 1-2, full plan)   **Date**: 2026-10-11
**Round**: 1   **Verdict**: APPROVED   **Findings**: 5

Diff base: `e4e6ed3...HEAD` (branch stacked on unmerged prerequisites F-01 → S-01 → S-07 → S-02), not `origin/main`.

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Scope classification
- In plan AND diff: `src/month/{month,monthStore,copy,index}.ts`, `src/month/MonthCard.tsx`, the three test files, `src/App.tsx`, `e2e/month.spec.ts`. All planned contract items MATCH (month helpers `src/month/month.ts:16-77`, read-only store `src/month/monthStore.ts:33-58`, toggle with `aria-expanded` closed by default `src/month/MonthCard.tsx:44,87`, load on open + visibilitychange `:49-73`, grid `ul aria-label="Ten miesiąc"` `:132-156`, lifetime line `:158-162`).
- In diff NOT plan: none (only `context/changes/widok-miesiaca/*`). Minor additive extras inside owned files: exported `LifetimeTotal` type, `RETRY_BUTTON` copy, `aria-controls`/`role="alert"`, extra tests (other-month query, visibilitychange reload).
- In plan NOT diff: none.

## Requester constraints
- No IndexedDB migration / version bump: `git diff --stat e4e6ed3..HEAD -- src/storage` is empty; store only calls `getAllFromIndex` / `getAll` (`src/month/monthStore.ts:44,49`); `monthStore.test.ts:75` asserts the DB version stays `migrations.length`. Nothing under `src/practice` or `src/profile` changed. PASS.
- `src/App.tsx` diff is exactly `+import { MonthCard } from './month/index.ts';` and `+<MonthCard />` after `<PracticeTimeCard />` (+2/-0). PASS.

## Success criteria
| # | Command | Result |
|---|---|---|
| 1.1 / 2.1 | `vitest run --reporter=json` (full suite, once) | PASS — 138/138 tests, 45 files; `month.test.ts` 13, `monthStore.test.ts` 6, `MonthCard.test.tsx` 8, `App.test.tsx` 15 (unchanged) |
| 1.2 / 2.2 | `pnpm typecheck` / `pnpm lint` / `pnpm build` | PASS (exit 0 each; build emits `dist/sw.js`, 12 precache entries) |
| 1.3 | `git diff --stat e4e6ed3..HEAD -- src/storage` | PASS — empty |
| 2.3 | `CI=1 pnpm exec playwright test e2e/month.spec.ts` | PASS — 1 passed (mobile-chromium, own webServer) |
| 2.4 | `git diff e4e6ed3..HEAD -- src/App.tsx` | PASS — import + one element |
| 2.5 | Manual: phone viewport, one button when closed, no horizontal scroll, no red | PENDING — diff evidence supports it (single toggle when closed `MonthCard.tsx:86-105`; `max-w-sm` + `grid-cols-7` + `aspect-square` cells; only `bg-amber-300` / `bg-white/10` classes) — left for the human on the preview |

Architecture boundary gate: not run (`context/architecture/model.c4` absent).

## Findings
### F1 — Overlapping loads can resolve out of order
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/month/MonthCard.tsx:49-62
- **Detail**: The opening load and a `visibilitychange` load share one `active` flag; if the first resolves after the second, it overwrites it. Both read the same device data milliseconds apart, so the visible result is the same in practice.
- **Fix**: Optional later: a per-load sequence number, applying only the latest response.
- **Decision**: ACCEPT — benign; no user-visible difference for a single-user local store.

### F2 — Card does not refresh when a session is saved while it is open
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: src/month/MonthCard.tsx:73, src/App.tsx:66
- **Detail**: Counter and lifetime update on reopening or on returning to the app, not immediately after a save made with the card open.
- **Fix**: If wanted later, pass a refresh key from the save flow.
- **Decision**: ACCEPT — deliberate trade-off, plan-brief Key decisions row "Freshness: Load on every opening and on visibilitychange while open" (no coupling to ProfileScreen state, conflict avoidance with S-03/S-06).

### F3 — A failed refresh replaces an already shown month with the retry message
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Pattern Consistency
- **Location**: src/month/MonthCard.tsx:58-60, 92-101
- **Detail**: `ProfileScreen` keeps the old week on a refresh failure; MonthCard switches to the neutral retry state. Copy is the shared neutral `RETRY_MESSAGE`, nothing about missed days.
- **Fix**: Optional: keep the `ready` state on refresh failure.
- **Decision**: ACCEPT — matches the plan's "Load failure" contract; a refresh failure on a local DB is rare.

### F4 — DST helper test is not pinned to a DST timezone
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Success Criteria
- **Location**: src/month/month.test.ts:31-39
- **Detail**: No `TZ` is set in vitest config, so in a UTC runner the DST case passes without exercising a DST transition. Implementation builds dates from local parts (`month.ts:16-20`), which is DST-safe by construction.
- **Fix**: Optional: pin `TZ=Europe/Warsaw` for the test run.
- **Decision**: ACCEPT — repo-wide convention (no TZ pinning anywhere); implementation is correct by construction.

### F5 — Minor a11y / e2e edges
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/month/MonthCard.tsx:87-91; e2e/month.spec.ts:30-46
- **Detail**: No live-region announcement while the month loads (plan specifies "nothing rendered beyond the toggle"); `aria-controls` points at an id absent while closed. The e2e spec depends on the current date and could flake if run across local midnight.
- **Fix**: Optional polish; none required for this increment.
- **Decision**: ACCEPT — load is near-instant from a local DB; behaviour matches the plan.
