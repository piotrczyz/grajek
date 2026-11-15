<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Spike "Zagraj i sprawdź" — increment 2 (screen with recording at ?spike=nuty)

**Plan**: context/changes/spike-zagraj-i-sprawdz/plan.md   **Scope**: increment 2 (phases 3-5)   **Date**: 2026-11-15
**Round**: 1   **Verdict**: APPROVED   **Findings**: 6

Diff: `git diff feat/spike-zagraj-i-sprawdz/1...HEAD` (stacked on increment 1). Code part: 18 files,
~1150 changed lines (two read-only evidence passes, plan drift and safety/quality, then decided here).

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success criteria (run locally in the worktree)
| Row | Command | Result |
|---|---|---|
| 3.1, 4.1, 5.1 | `vitest run --reporter=json` (full suite) | PASS: 160 files, 527 tests, 0 failed; spike files: route 2, SpikeScreen 5, staffModel 4, mic 5, logic 41 |
| 3.2, 4.2, 5.2 | `pnpm lint`, `pnpm typecheck`, `pnpm build` | PASS (exit 0); build warns only on the >500 kB lazy `SpikeScreen-*.js` chunk (745.8 kB, 397 kB gzip) |
| 3.3, 5.4 | grep the entry script of `dist/index.html` (`assets/index-CU2sGjmJ.js`) | PASS: 0 × `Zagraj i sprawdź`, 0 × `Bravura`; `Zagraj i sprawdź` found in `dist/assets/SpikeScreen-DxzsqAwh.js` |
| 5.3 | `pnpm test:e2e` | PASS: 17 passed (existing suite unchanged) |

Manual rows 3.4, 4.3, 4.4, 5.5, 5.6 are `[ ]`; diff evidence exists for each (unchanged `<App>` branch
`src/main.tsx:34-40`; beat marker and count-in `SpikeScreen.tsx:262-277`; Polish mic messages
`copy.ts:29-32`; grading pipeline `SpikeScreen.tsx:79-83`; event table with octave/twelfth columns
`copy.ts:46`). They go to the product owner's iPhone test (`manual-pending`).

Plan drift (all phases 3-5): every planned file and contract is present and matches
(`isSpikeRoute`, `createMetronome`, `openMic`/`MicError`, `createPitchTracker`, `<Staff>`, defaults
Klarnet B♭ / 60 BPM / toggles off, AudioContext + `getUserMedia` reached synchronously in the tap,
voice processing off, one-bar count-in with accent, auto-stop one bar after the melody, 80 ms click
ignore windows, teardown on stop and unmount, colours `#16a34a`/`#ca8a04`/`#dc2626`, soft voice,
2 or 4 bars per system by width, README with `## Werdykt`). No architecture model
(`context/architecture/` absent), so the boundary gate did not apply. No cross-package imports.

## Findings

### F1 — Lazy screen wrapper in its own file (out of plan)
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Scope Discipline
- **Location**: src/spike-nuty/lazy.ts:5
- **Detail**: The plan put `React.lazy(() => import(...))` inline in `src/main.tsx`; it lives in `lazy.ts` so `main.tsx` stays component-free for the react-refresh lint rule. The dynamic import is still the only path to the spike code, and the entry chunk is clean (3.3/5.4 PASS). Also additive, not in the contract: `latencyMs` on the pitch tracker (`audio/pitchTracker.ts`), shown in diagnostics; `createAudioContext()` in `audio/mic.ts` for test mocking; `toStaffBars` in `staffModel.ts` for wrapping.
- **Fix**: none.
- **Decision**: ACCEPT — same behaviour as planned; recorded as `out-of-plan-files` / `adaptation` guards.

### F2 — The lazy spike chunk is precached for every user
- **Severity**: OBSERVATION
- **Impact**: MEDIUM
- **Dimension**: Safety & Quality
- **Location**: vite.config.ts:47 (unchanged), dist/assets/SpikeScreen-*.js (745.8 kB)
- **Detail**: The chunk is under Workbox's 2 MiB limit, so the service worker of every installed app downloads it once (precache 15 entries, 1042.9 KiB), though only `?spike=nuty` executes it.
- **Fix**: none in this spike; a full feature would exclude or split it.
- **Decision**: ACCEPT — deliberate trade-off, plan-brief Key decisions row "Precache: leave Workbox config unchanged" and plan Performance Notes.

### F3 — Stop during the permission prompt yields a 0 % result; a late mic rejection can tear down a newer session
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/spike-nuty/SpikeScreen.tsx:101-108, 125-129
- **Detail**: Stop while `phase === 'starting'` commits an empty recording (`segment([])`) and shows a 0 % score. If the user then starts again before the first `openMic` rejects, the first call's `catch` runs `teardown()` on the second session. On the target device the iOS permission sheet is modal, so neither path is practically reachable during the owner's test.
- **Fix**: in `catch`, act only when `sessionRef.current === session`; in `stop`, skip `setRecording` unless recording had started.
- **Decision**: ACCEPT — plan "What we're NOT doing": no production hardening of the throwaway spike.

### F4 — Error mid-start and stream-source failure are not cleaned up
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/spike-nuty/SpikeScreen.tsx:137-148; src/spike-nuty/audio/mic.ts (`createMediaStreamSource` after `getUserMedia`)
- **Detail**: If `createMetronome`/`createPitchTracker` threw, the mic would stay open with the screen on "starting" until Stop; if `createMediaStreamSource` threw, the tracks would not be stopped. Neither call throws on a running context in practice. `ctx.resume()` rejection is only awaited after `openMic`.
- **Fix**: wrap the post-mic setup in the same try/catch and stop tracks on a failed source.
- **Decision**: ACCEPT — no production hardening (plan scope); Stop recovers.

### F5 — Scheduled clicks and the AudioContext outlive stop/unmount
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/spike-nuty/audio/metronome.ts:98-103; src/spike-nuty/SpikeScreen.tsx:97, 158-163
- **Detail**: `stop()` clears timers but not the at most one source scheduled within the 120 ms look-ahead; after a suspend/resume it can sound during the next count-in (negative time, dropped by quantize, no pitch). The context is suspended, never closed; the spike screen only unmounts on page leave.
- **Fix**: keep scheduled sources and `stop()` them; `close()` the context on unmount.
- **Decision**: ACCEPT — no effect on the measured take; spike scope.

### F6 — Conventions: no `index.ts` barrel, JSX indentation, untested audio timing
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Pattern Consistency
- **Location**: src/main.tsx:10-11; src/spike-nuty/SpikeScreen.tsx:167-168; src/spike-nuty/audio/metronome.ts, pitchTracker.ts
- **Detail**: `main.tsx` imports `spike-nuty/lazy.ts` and `route.ts` directly (other features go through `index.ts`); the plan lists no barrel for the screen folder, and the two small modules keep the main chunk minimal. `<main>` is not indented inside the new wrapper `div` (lint passes). Metronome scheduling and tracker time base have no unit tests; the plan's Testing Strategy covers them by the manual iPhone test.
- **Fix**: none.
- **Decision**: ACCEPT — matches the plan's file list and testing strategy; cosmetic otherwise.
