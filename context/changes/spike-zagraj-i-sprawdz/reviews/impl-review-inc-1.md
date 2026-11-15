<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Spike "Zagraj i sprawdź"

**Plan**: context/changes/spike-zagraj-i-sprawdz/plan.md   **Scope**: increment 1 (phases 1-2)   **Date**: 2026-11-15
**Round**: 1   **Verdict**: APPROVED   **Findings**: 3

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Scope
Base `main`. Diff: 12 files under `src/spike-nuty/logic/` (pitch, melodies, segment,
quantize, compare, index barrel, and their tests) plus `change.md`/`plan.md` progress.
All of them are in the plan, with no unplanned files and nothing missing for phases 1-2.
Contracts were spot-checked against the plan: the three melodies match note for note
(`melodies.ts:42,48,54`), `DEFAULT_SEGMENT_OPTIONS` matches (`segment.ts:31-36`),
`DEFAULT_COMPARE_OPTIONS` matches (`compare.ts:14-18`), and the score and pitch-only
formulas match (`compare.ts:120-121`), with n=0 guarded. The barrel re-exports every
public symbol. Imports use `.ts` suffixes and `import type`, and the tests use
`describe`/`it`, consistent with `src/practice/`. There is no `context/architecture/`,
so the architecture gate does not apply.

## Success criteria (run locally)
| Criterion | Command | Result |
|---|---|---|
| 1.1, 1.2, 2.1-2.3 | `pnpm vitest run src/spike-nuty/logic` | PASS: 5 files, 41 tests |
| 1.3, 2.4 | `pnpm lint`; `pnpm typecheck` | PASS (exit 0 / exit 0) |
| Full suite | `pnpm vitest run --reporter=json` | PASS: 511/511 tests, 0 failed |
| Build | `pnpm build` | PASS (exit 0) |

Phases 1-2 have no Manual rows.

## Findings
### F1: Frame step can be 0 or NaN for degenerate timestamps
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/spike-nuty/logic/segment.ts:80-86
- **Detail**: `frameStepMs` returns the median frame gap. Duplicate timestamps give 0, so a
  dropout never closes a note. A NaN `timeMs` gives NaN. Frames come from a ~20 ms poller
  in increment 2, so this cannot happen in the spike.
- **Fix**: fall back to 20 ms when the step is not finite and positive.
- **Decision**: ACCEPT. The input is unreachable in the spike, and the plan rules out production hardening.

### F2: `eighthMs` does not validate bpm
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/spike-nuty/logic/quantize.ts:7-9
- **Detail**: bpm 0, a negative bpm or NaN gives Infinity, a negative value or NaN, and
  `quantize` then silently returns wrong results or `[]`. The tempo comes from a slider
  limited to 60-100 (plan phase 3).
- **Fix**: validate bpm at the caller in increment 2.
- **Decision**: ACCEPT. The UI bounds the input, and the code is throwaway spike code.

### F3: Median recomputed on every voiced frame
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/spike-nuty/logic/segment.ts:75-78
- **Detail**: `medianMidi` re-sorts the note's frames on each frame, which is O(k² log k)
  per note. That is negligible for recordings a few seconds long.
- **Fix**: cache the median if long takes are ever needed.
- **Decision**: ACCEPT. The cost is negligible at spike scale.

## Notes
The design point is noted, not flagged: the onset tolerance is 0 eighths, so a
performance shifted by a constant one eighth grades every note yellow. This is the
deliberate brief row "Rhythm correct", and the device test will show whether it is too
strict.
