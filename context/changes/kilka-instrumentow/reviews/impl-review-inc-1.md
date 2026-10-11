<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Several instruments (S-09)

**Plan**: context/changes/kilka-instrumentow/plan.md   **Scope**: full plan (increment 1, phases 1-4)   **Date**: 2026-10-11
**Round**: 1   **Verdict**: APPROVED   **Findings**: 2

Diff base: `feat/karta-postepu/1...HEAD` (stacked increment; base not yet merged to main).

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Plan adherence (evidence)
Every planned file is in the diff and matches its contract; no planned file is missing and no unplanned code file was touched. Highlights:
- `src/profile/profileStore.ts:173-205` `addInstrument` checks and inserts in one readwrite transaction over `profile` + `instruments`; rejects `missing` / `invalid` with `instrument-empty|too-long|duplicate|limit`; `validateInstrumentName` exported (`:80`), `MAX_INSTRUMENTS = 6` (`:47`). Extra (harmless): `createdAt` nudged +1 ms to keep oldest-first strict (`:196-201`).
- `src/practice/practiceStore.ts:99-107` `lastPractice()`; `lastDuration()` delegates (`:129-133`).
- `src/instruments/stats.ts` combined = distinct days over all records (unknown ids included); `statsStore.ts` single read-only `getAll`.
- `src/practice/LogPractice.tsx:90` instrument radiogroup only when `instruments.length > 1`; one-instrument path unchanged.
- `src/profile/ProfileScreen.tsx:53-74` single `lastPractice` effect, fallback to the oldest instrument, header and share button use the current default, `onSaved` updates it.
- `src/App.tsx`: one import, one element, functional `onAdded` append; nothing else.
- No file under `src/month/**`, `src/progress-card/**`, `src/push/**`, `src/practice-time/**`, and no migration / DB version bump.
- Architecture gate: `context/architecture/model.c4` absent, gate not applicable.

## Success criteria
| Criterion | Command | Result |
|---|---|---|
| 1.1, 2.1, 3.1, 3.2, 4.1 | `pnpm exec vitest run --reporter=json` (full suite) | PASS — 79 files, 267/267 tests |
| 1.2, 2.2, 3.3, 4.2 | `pnpm lint` / `pnpm typecheck` | PASS (exit 0 both) |
| 4.3 | `pnpm build` | PASS (exit 0, PWA sw generated) |
| 4.4 | `playwright test e2e/instruments.spec.ts e2e/practice.spec.ts` (temporary unstaged config on port 4391, removed after) | PASS — 2/2 |
| 3.4 Manual | 3-tap / 10 s log with two instruments | pending — diff evidence: default chip preselected (`LogPractice.tsx:96`), e2e saves without touching it is possible; human check on preview |
| 4.5 Manual | card legible on a phone | pending — diff evidence: `min-h-14` chips, `break-words`, `max-w-sm` card; human check on preview |

## Findings
### F1 — Default instrument does not follow a late `lastPractice()` result
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/practice/LogPractice.tsx:59, src/profile/ProfileScreen.tsx:53-66
- **Detail**: `initialInstrumentId` only seeds `useState`; if the student opens the log panel before the mount-time `lastPractice()` read resolves (milliseconds on IndexedDB), the chips keep the oldest instrument. Symmetrically, a read resolving after a save could restore the previous instrument. Both are the same pre-existing behaviour as `initialDuration` / `lastDuration`.
- **Fix**: none needed now; if ever observed, key `LogPractice` on the default or ignore the read after the first save.
- **Decision**: ACCEPT — consistent with the existing duration pattern; window is negligible.

### F2 — Open "Moje instrumenty" card does not refresh after a new session
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Pattern Consistency
- **Location**: src/instruments/InstrumentsCard.tsx:46-66
- **Detail**: stats refresh on each opening, on retry and when an instrument is added, but not when a session is logged while the card stays open.
- **Fix**: none; plan specifies "reads fresh at every opening", same as MonthCard.
- **Decision**: ACCEPT — matches the planned MonthCard pattern (plan Phase 4 §1).
