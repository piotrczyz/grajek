<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Telemetry and accuracy feedback for "Zagraj i sprawdź"

**Plan**: context/changes/telemetria-zagraj-i-sprawdz/plan.md   **Scope**: increment 2 (phases 4-6)   **Date**: 2026-11-15
**Round**: 1   **Verdict**: APPROVED   **Findings**: 4

Base: `feat/telemetria-zagraj-i-sprawdz/1` (stacked increment); diff `git diff feat/telemetria-zagraj-i-sprawdz/1...HEAD`, 23 files, +1323/-17.

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Plan classification
- In plan and diff: `src/spike-nuty/logic/segment.ts(+test)`, `results.ts(+test)`, `vite.config.ts`, `src/vite-env.d.ts`, `telemetry/record.ts(+test)`, `telemetry/api.ts`, `telemetry/queue.ts(+test)`, `telemetry/settings.ts(+test)`, `SpikeScreen.tsx(+test)`, `copy.ts(+test)`, `src/spike-nuty/README.md` — all MATCH.
- In diff, not in plan: `logic/compare.test.ts`, `logic/quantize.test.ts`, `logic/timing.test.ts`, `staffModel.test.ts` (fixtures gain `meanClarity`/`meanLevelDb`, forced by the new `NoteEvent` fields) — see F4.
- In plan, not in diff: none.
- Contract check: `record.test.ts` runs the server's real `parseAttempt` on the built record; every numeric field is clamped/rounded (`record.ts` `clampInt`, `nullableInt`, `finite`), `NoteKind` keys equal the server status enum (`copy.ts:60-68`). Feedback body (`SpikeScreen.tsx:386-407`) matches `parseFeedback` (empty `misjudged` on Tak, trimmed comment ≤500, `regraded` vs the sent `autoLatency`).
- Queue rules (`queue.ts`) match the plan: keys, cap 20 oldest dropped, FIFO one at a time, 2xx remove, network/5xx/429 keep and stop, other 4xx drop, feedback 404 tries capped at 5, single flush via shared promise released in `finally`, corrupt storage reset, storage errors swallowed; opt-out clears the queue (`settings.ts`).
- Screen: `ended` set by timer vs Stop button; one record per `attemptId` guarded by `seenAttemptsRef` before async work (survives StrictMode and re-grading, `SpikeScreen.tsx:358-381`); flush on mount and on `online` with cleanup; feedback hidden when sending is off; notice and switch outside the result conditional.
- Architecture: no `context/architecture/model.c4`; gate not applicable. No cross-package imports.

## Success criteria
| Criterion | Command | Result |
|---|---|---|
| 4.1 / 5.1 / 6.1 | `pnpm exec vitest run --reporter=json` | PASS — 593/593 tests (queue 18, record 9, settings 3, SpikeScreen 14, segment 12, results 7, copy 5) |
| 4.2 / 6.2 | `pnpm typecheck` | PASS (exit 0) |
| 5.2 / 6.2 | `pnpm lint` | PASS (exit 0) |
| 6.3 | `pnpm build` | PASS (exit 0) |
| 6.4 | `pnpm test:e2e` (Playwright, local browser cache) | PASS — 17 passed |
| 6.5 | Manual: phone attempt lands in `spikeNutyAttempts`, Nie updates it | pending (needs deployed functions) — diff evidence: enqueue/flush wiring and feedback UI present |
| 6.6 | Manual: offline attempt stored after reconnect | pending — diff evidence: localStorage queue + `online` auto-flush |

## Findings
### F1 — Transport has no request timeout
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/spike-nuty/telemetry/api.ts:9-17, src/spike-nuty/telemetry/queue.ts:126-135
- **Detail**: `fetch` has no `AbortController` timeout. A request that never settles keeps `running` set, so later `flush()` calls in the same session return the hung promise. The item stays in localStorage and is sent on the next page load; the browser's network stack fails stalled connections eventually.
- **Fix**: optional — abort after ~30 s in `put()`.
- **Decision**: ACCEPT — no data loss, bounded to one session of a throwaway spike.

### F2 — `regraded` only tracks `autoLatency`
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: src/spike-nuty/SpikeScreen.tsx:404
- **Detail**: `regraded` compares only `autoLatency` with the sent value, exactly as the plan's send rules say; the plan names `autoLatency` as the only setting toggleable on the result view.
- **Fix**: none.
- **Decision**: ACCEPT — matches plan "Client send and retry rules".

### F3 — Record carries full user agent and the shared device id
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/spike-nuty/telemetry/record.ts (device.userAgent ≤512), src/spike-nuty/SpikeScreen.tsx:373
- **Detail**: The record sends the user agent (truncated to 512) and the anonymous id from `getOrCreateDeviceId()`, which the push registry also uses. Both are deliberate: plan-brief "User agent is stored as sent (pseudonymous technical data, explicitly requested)" and the plan's Current State naming `getOrCreateDeviceId()` as the id source. No name, profile or audio field exists in the record type.
- **Fix**: none.
- **Decision**: ACCEPT — recorded trade-off (plan-brief, Risks).

### F4 — Four test fixture files touched outside the plan
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Scope Discipline
- **Location**: src/spike-nuty/logic/compare.test.ts, quantize.test.ts, timing.test.ts, src/spike-nuty/staffModel.test.ts
- **Detail**: Each adds `meanClarity`/`meanLevelDb` to `NoteEvent` fixtures (2-8 lines), required by the planned type change; no behaviour change.
- **Fix**: none.
- **Decision**: ACCEPT — mechanical consequence of Phase 4 item 1; recorded as `out-of-plan-files`.
