<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Log a practice session with the current-week view

**Plan**: context/changes/zapis-cwiczenia/plan.md   **Scope**: increment 1 (phases 1-4, full plan)   **Date**: 2026-10-11
**Round**: 1   **Verdict**: NEEDS_ATTENTION   **Findings**: 8

Review base: `246ca4d` (F-01 + S-01 in the stack), diff `246ca4d..HEAD` (7 commits).

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Plan adherence (summary)
Every planned item checks out as MATCH, each with `file:line` evidence. There is no MISSING, DRIFT or out-of-plan file: all 21 changed files under `src/` and `e2e/` map to a planned item.
- Migration v3 appends a `practices` store (keyPath `id`) with a non-unique `byDay` index on `day`. v1 and v2 are untouched, and the additive-only rule is documented (`src/storage/migrations.ts:11-13`, `:32-38`).
- `openDb` lifecycle (`src/storage/db.ts:35-80`):
  - `blocking` flags the connection, then closes it synchronously.
  - `terminated` flags the connection, which the browser has already closed.
  - The `VersionError` fallback matches only `name === 'VersionError'`. It retries once with no version and no `upgrade`, and keeps the same handlers.
- `createConnection` (`src/storage/connection.ts:92-118` in the diff) reopens after a close or a failed open, and a stale attempt cannot overwrite a newer one (`pending === attempt`). Both the profile and practice stores use it, so S-01 F2 is fixed once.
- Day key and week math use local date parts (`src/practice/week.ts:12-23`). The Warsaw test asserts `getTimezoneOffset() === -120` before it checks the key, so it cannot pass trivially in UTC. It ran and passed.
- 3-tap flow, collapsed optional fields, disabled-while-saving and the failure alert: `src/practice/LogPractice.tsx`. Week view semantics (a list named "Ten tydzień", per-day labels, "(dziś)", empty days neutral): `src/practice/WeekView.tsx`. Visibility rollover and reload after save: `src/profile/ProfileScreen.tsx`.
- Additions within planned files: constants such as `DEFAULT_DURATION`, `DURATION_MIN` and `DURATION_MAX`, an `instrument-empty` validation reason, extra copy constants, and extra tests. None are out of scope.

## Verdict rationale
All Automated criteria pass. One WARNING (F0) carries a FIX decision, so the increment goes back for a short fix round before it can be approved and archived. Evidence came from two read-only subagents (plan drift, safety and patterns) plus a direct read of the storage, domain and UI files.

## Success criteria (run locally in this worktree)
| Criterion | Command | Result |
|---|---|---|
| 1.1 / 2.1 / 3.1 / 4.1 unit tests | `pnpm exec vitest run --reporter=json` | PASS: 72/72 tests in 9 files, 0 failed |
| 4.2 e2e | `pnpm test:e2e` | PASS: 5/5 (practice, profile, offline, 2× installability) |
| 4.3 build | `pnpm build` | PASS: exit 0, SW precache 12 entries |
| typecheck (all phases) | `pnpm typecheck` (`tsc -b`) | PASS: exit 0 |
| lint (all phases) | `pnpm lint` | PASS: exit 0 |
| 3.4 manual: about 10 s on a phone, child-friendly targets | — | Pending. Diff evidence: every control is `min-h-14`, and the main button is `min-h-20` |
| 4.6 manual: airplane mode, today highlighted, empty days neutral | — | Pending. Diff evidence: `bg-amber-300` for music days and `bg-white/10` for empty days, with no red class; the offline e2e test covers the behaviour |

Architecture gate: `context/architecture/model.c4` does not exist, so the gate did not run. Single workspace package, so no cross-package exports to check. Not bug mode.

## Findings
### F0: A save after midnight in a session left open shows "Zapisane" but no highlighted day
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/profile/ProfileScreen.tsx:24 (`now` set at mount), :35-46 (week load keyed on `now`), :78-83 (`onSaved`)
- **Detail**: `now` refreshes only on `visibilitychange`. `add()` stamps `day` from its own clock. Suppose the app stays in the foreground across midnight and the student then logs a session:
  - In the same week, the music highlight lands on the cell after the "(dziś)" ring, because the ring is stale.
  - Across Sunday to Monday, `listWeek(oldNow)` does not include the new day, so the save is confirmed but no day is highlighted.

  This breaks the Phase 4 contract "after `onSaved`, today's cell becomes a Dzień z muzyką without a reload" and the plan's "Today rollover" intent.
- **Fix**: In `onSaved`, also call `setNow(new Date())`, so the week and "today" are recomputed at save time. Add an App test with an injected clock/practice store that crosses Sunday→Monday between mount and save, and assert that today's item is labelled Dzień z muzyką.
- **Decision**: FIX. A one-line, unambiguous fix to a planned contract.

### F1: Panel opened before the last duration loads preselects 15
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/profile/ProfileScreen.tsx:48-61, src/practice/LogPractice.tsx:43
- **Detail**: `LogPractice` copies `initialDuration` into state once. If the student taps "Zagrałem!" before `lastDuration()` resolves (a few ms on IndexedDB), the panel preselects the default 15 instead of the last value. The 3-tap budget still holds and the save stays correct.
- **Fix**: Optional. Key the panel on `lastDuration`, or disable the button until the load settles.
- **Decision**: ACCEPT. The window is negligible and the tap budget is unaffected.

### F2: "Latest" duration is ordered by day, then by createdAt
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: src/practice/practiceStore.ts:117-126
- **Detail**: `lastDuration` takes the highest `day`, then the highest `createdAt` within that day. After a time-zone change, a session with a later day but an earlier absolute time would win. This matches the stable-day choice recorded in the brief (Record schema, Consult).
- **Fix**: None needed.
- **Decision**: ACCEPT. Consistent with the brief's Key decision "Record schema".

### F3: An S-01 tab without the handler can delay the first v3 upgrade
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/storage/db.ts:55-80; plan Migration Notes
- **Detail**: No `blocked` handling beyond the default wait. This is documented under "What we're NOT doing" and Migration Notes. The `autoUpdate` service worker reloads old tabs on their next start.
- **Fix**: None.
- **Decision**: ACCEPT. A deliberate, documented trade-off (brief, Open risks).

### F4: Migration version collision with parallel slices F-02 / S-07
- **Severity**: OBSERVATION
- **Impact**: MEDIUM
- **Dimension**: Architecture
- **Location**: src/storage/migrations.ts:32-38, src/storage/db.test.ts (version 3 assertions)
- **Detail**: The version equals the list length. Whichever of F-02 / S-07 merges after this change must rebase, append after v3 and update the version assertions. This is recorded in the plan's Migration Notes and the brief ("Parallel migrations").
- **Fix**: None in this increment. Respect the merge order.
- **Decision**: ACCEPT. A recorded Orchestrator decision; flagged here so the merge order is not missed.

### F5: "Anuluj" stays enabled while a save is in flight
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/practice/LogPractice.tsx:149
- **Detail**: Cancelling during the few milliseconds of `store.add` closes the panel. A successful save still confirms, and a failed one is silent, but nothing was saved in that case.
- **Fix**: Optional. Add `disabled={saving}` on the cancel button. The F0 fix round may include it at no extra cost.
- **Decision**: ACCEPT. The window is negligible and no data is lost or corrupted.

### F6: Focus is lost when the panel opens and closes; the radiogroups have no arrow-key navigation
- **Severity**: OBSERVATION
- **Impact**: MEDIUM
- **Dimension**: Pattern Consistency
- **Location**: src/profile/ProfileScreen.tsx:72-95, src/practice/LogPractice.tsx:73-86, :117-130
- **Detail**: Mounting and unmounting the panel drops focus to `<body>`. The `role="radio"` buttons are tab stops without roving tabindex, which is the same pattern as `CreateProfileScreen`. The emoji group can be un-selected.
- **Fix**: Handle keyboard and screen-reader access app-wide in its own change.
- **Decision**: ACCEPT. Consistent with the existing S-01 pattern and not in the plan's scope. The target is touch.

### F7: `crypto.randomUUID` requires a secure context
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/practice/practiceStore.ts:102
- **Detail**: Unavailable over plain-http LAN dev URLs.
- **Fix**: None.
- **Decision**: DISMISS. The app is an HTTPS PWA: its service worker already requires a secure context. The unit and e2e suites pass (`localhost` is secure).
