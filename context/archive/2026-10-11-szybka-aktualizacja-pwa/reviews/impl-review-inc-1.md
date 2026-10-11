<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Fast and reliable PWA updates

**Plan**: context/changes/szybka-aktualizacja-pwa/plan.md   **Scope**: increment 1 (phases 1-2, full plan)   **Date**: 2026-10-11
**Round**: 1   **Verdict**: APPROVED   **Findings**: 6

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Architecture gate: `context/architecture/model.c4` absent, so the gate does not apply. Not bug mode.

## Success criteria (run locally, 2026-10-11)
| # | Command | Result |
|---|---|---|
| 1.1 / 2.1 | `pnpm exec vitest run --reporter=json` (full suite, includes `src/pwa`) | PASS: 341/341 tests, 102 suites, 0 failed |
| 1.2 / 2.2 | `pnpm lint`, `pnpm typecheck` | PASS: both exit 0 |
| 1.3 | `pnpm build`, then grep `dist/sw.js` | PASS: build OK; `self.skipWaiting()` and `clientsClaim()` present |
| 2.3 | `CI=1 pnpm test:e2e` | PASS: 14/14, incl. `e2e/update.spec.ts` and `e2e/offline.spec.ts` |
| 2.4 | Manual: installed iPhone PWA resumed after a deploy | PENDING: `manual-pending` guard; needs a device after deploy |

## Plan correction (premise)
`plan.md` (Current State, Key discoveries, What we're NOT doing), `frame.md` and
`plan-brief.md` (Starting point, "Activation policy" row) state that the plugin
already forces `skipWaiting`/`clientsClaim`. For this config that is wrong:
`node_modules/vite-plugin-pwa/dist/index.js:874-877` sets them only when
`injectRegister` is `'auto'`/unset **and** `registerType` is `'autoUpdate'`, and
`vite.config.ts` has `injectRegister: false`. So on `main` a new SW waits until
every tab closes, which is the cause the original request named. The implementer
added both flags explicitly (`vite.config.ts:52-56`; Consult agreed per the
orchestrator). Without them `onNeedReload` would never fire and the guarded-reload
design would do nothing. Criterion 1.3 ("still contains") passes because of that edit.

How the documents are handled: the `plan.md` body is locked once the change is
implementing, and `context/` files fall outside the review's prose-fix scope. The
planning documents stay as written, and this section is the authoritative
correction. It travels with them into the archive. rs-archive should carry the
`adaptation` guard into its record.

## Findings
### F1 — Plan premise wrong; activation flags added to vite.config.ts
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: vite.config.ts:52-56; plan.md "What we're NOT doing", bullet 1
- **Detail**: Contradicts "No change to vite.config.ts activation settings", but the premise behind that bullet is false (see Plan correction). The edit is minimal, carries an accurate comment, and is required for the plan's own end state. What users get: a new version takes over at once instead of after every tab closes, which is the requested outcome.
- **Fix**: none in code; the correction is recorded above.
- **Decision**: ACCEPT. Consult-agreed adaptation, needed to reach the plan's goal; `adaptation` guard raised.

### F2 — Out-of-plan file
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Scope Discipline
- **Location**: vite.config.ts
- **Detail**: Not in the plan's "In" scope. Only the two workbox flags and a comment were added. Precache, `importScripts`, `firebase.json` headers and `playwright.config.ts` are unchanged.
- **Fix**: none.
- **Decision**: ACCEPT. Same cause as F1; `out-of-plan-files` guard raised.

### F3 — Dynamic import of the register module has no rejection handler
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/pwa/updates.ts:43
- **Detail**: `void import('virtual:pwa-register').then(...)` has no `.catch`, so a failed chunk load would show up as an unhandled rejection. The chunk (`dist/assets/virtual_pwa-register-*.js`) comes from the same build and matches the precache glob, so it can only fail when the page itself could not have loaded. The result (no SW registration) would be the same with a catch.
- **Fix**: optional follow-up: append `.catch(() => {})`.
- **Decision**: ACCEPT. Very unlikely, and no difference in behaviour.

### F4 — Pending update retried only on foreground return
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: src/pwa/updates.ts:110-117, 130-133
- **Detail**: If the blocking form closes while the app stays visible, the bar stays until the student taps "Odśwież" or the app next returns to the foreground. This is the planned behaviour (Desired End State, bullet 3). The registry's exported `subscribe` belongs to the planned contract and is not yet used in production.
- **Fix**: none.
- **Decision**: ACCEPT. Matches the plan.

### F5 — Panel forms block a reload for as long as they are open
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: src/practice/LogPractice.tsx:68, src/instruments/AddInstrumentForm.tsx:44, src/practice-time/PracticeTimeCard.tsx:126
- **Detail**: These call `useUnsavedWork(true)` while mounted, which the plan allows ("an expandable entry panel is open"). Each panel unmounts on save and on cancel, so the blocker always clears; checked against the parents (ProfileScreen, InstrumentsCard, PracticeTimeCard). The profile and weekly-goal forms use field-change checks instead. Components outside the planned five (e.g. the notifications panel) do not report, and none of them holds typed input.
- **Fix**: none.
- **Decision**: ACCEPT. Within the plan's definition, and on the safe side.

### F6 — Extra exports and deps beyond the contract
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Pattern Consistency
- **Location**: src/pwa/index.ts:1-12, src/pwa/updates.ts:28-36, 83
- **Detail**: Adds `holdUnsavedWork`, `AppUpdateDeps`, the copy constants, `now`/`clearInterval` deps and a stop function returned by `registerAppUpdates`. All of them serve testability, and the barrel follows `src/storage/index.ts`. The large `App.tsx` diff is a fragment wrapper plus the banner; the rest is re-indentation (checked with `git diff -w`).
- **Fix**: none.
- **Decision**: ACCEPT. Supports the plan's "everything injectable" requirement.
