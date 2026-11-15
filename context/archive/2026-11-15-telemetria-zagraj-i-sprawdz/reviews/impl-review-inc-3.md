<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Telemetry and accuracy feedback for "Zagraj i sprawdź" — increment 3 (Owner stats and export, A3)

**Plan**: context/changes/telemetria-zagraj-i-sprawdz/plan.md   **Scope**: increment 3 (phases 7-9)   **Date**: 2026-11-15
**Round**: 1   **Verdict**: APPROVED   **Findings**: 4

Base: `feat/telemetria-zagraj-i-sprawdz/1` (stacked; `git diff feat/telemetria-zagraj-i-sprawdz/1...HEAD`).
16 changed files outside `context/`, all named in phases 7-9 (no out-of-plan files, nothing missing).
Increment 2 (phases 4-6) runs on its own branch; its unchecked rows are expected here and out of scope.

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success criteria (run locally)
| Row | Command | Result |
|---|---|---|
| 7.1, 8.1 | `pnpm --dir functions test` | PASS — 12 files, 238 tests |
| 8.2 | `pnpm --dir functions build && pnpm --dir functions typecheck` | PASS — both exit 0 |
| 9.1 | functions emulator suite (`vitest -c vitest.emulator.config.ts` under `firebase emulators:exec --only functions,firestore`, temporary config copy on ports 5301/8381 with `FUNCTIONS_EMULATOR_HOST`, removed afterwards) | PASS — 4 files, 20 tests |
| 9.2 | `node functions/scripts/spike-nuty-stats.mjs --help` | PASS — exit 0 |
| 9.3 (Manual) | curl against the live stats route after the owner sets the secret and deploys | pending — `manual-pending` |

No `context/architecture/model.c4`: architecture gate not applicable. Not bug mode.

## Evidence summary
- Stats (`functions/src/spike-nuty/stats.ts:103-185`): shape matches the plan; histogram 10 buckets with 100 in the last (`:117`); rates over notes with a played pitch (`:120-123`); `deviceClass` ios/android/desktop/other (`:62-73`); `agreesPercent` null with no answers.
- CSV (`functions/src/spike-nuty/export.ts`): RFC 4180 quoting incl. CR/LF, CRLF line ends; formula prefix covers `= + - @ TAB CR` on every string cell (`:239-250`); numbers unprefixed.
- Admin handler (`functions/src/spike-nuty/admin-handler.ts`): SHA-256 + `timingSafeEqual` (`:96-99`); 503 on empty secret, 401 on missing/wrong key, 405 with `Allow`, strict `YYYY-MM-DD` parse with round-trip, inclusive `to`, ≤366 days, `Cache-Control: no-store`, `onError` + 500; only validated dates reach `Content-Disposition`.
- Repository `listAttempts` (`repository.ts:130-139`): range + `orderBy` on the single field `receivedAt` (no composite index needed); Timestamps converted to Date.
- Wiring: router sends `/spike-nuty/(stats|export)` (with or without `/api`) to the admin handler before the ingest pattern; `defineSecret('SPIKE_NUTY_ADMIN_KEY')` added to `api` secrets (`index.ts:40`, `:89`); `ensure-secret-local.mjs` appends only missing keys.
- README "Owner statistics": curl and script examples, bold manual secret step before `deploy --only functions`, rotation.

## Findings
### F1 — Exactly 10 000 matching attempts are reported as truncated
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: functions/src/spike-nuty/admin-handler.ts:146-147
- **Detail**: `listAttempts(..., MAX_DOCUMENTS)` then `truncated = docs.length >= MAX_DOCUMENTS`; a range with exactly 10 000 attempts gets a false `truncated: true`. Matches the plan's wording ("at most 10 000 read, `truncated: true` when hit"); the only consequence is the owner asking for a shorter range.
- **Fix**: read `MAX_DOCUMENTS + 1`, flag `>`, slice to the cap.
- **Decision**: ACCEPT — follows the plan's contract; harmless at spike scale.

### F2 — Script stays silent on a truncated CSV export
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: functions/scripts/spike-nuty-stats.mjs:88-94
- **Detail**: `export --format csv > file` ignores the `X-Truncated` header, so truncation is invisible in that flow (JSON carries `truncated` in the body; README documents the header).
- **Fix**: warn on stderr when `X-Truncated: true`.
- **Decision**: ACCEPT — convenience only; documented behaviour.

### F3 — Admin secret is not trimmed
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: functions/src/spike-nuty/admin-handler.ts:103-110
- **Detail**: a secret stored with a trailing newline (e.g. piped into `functions:secrets:set`) would never match; a whitespace-only secret counts as configured. The README flow (interactive paste) avoids it.
- **Fix**: trim the secret value before the empty check and the compare.
- **Decision**: ACCEPT — operational edge case; fixable by re-setting the secret.

### F4 — 405/503 answered before the key check
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: functions/src/spike-nuty/admin-handler.ts:118-125
- **Detail**: an unauthenticated caller can learn whether the secret is configured. The plan defines the 503 answer; nothing else leaks.
- **Fix**: none needed.
- **Decision**: ACCEPT — plan contract (Owner endpoints), negligible exposure.

## Owner notes (for the PR)
- Deploying functions after this merge requires `SPIKE_NUTY_ADMIN_KEY` to exist in Secret Manager first; otherwise the deploy of `api` fails. CI deploys Hosting only.
