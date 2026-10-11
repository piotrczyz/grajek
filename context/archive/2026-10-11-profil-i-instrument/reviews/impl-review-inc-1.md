<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Student profile with name and instrument

**Plan**: context/changes/profil-i-instrument/plan.md   **Scope**: increment 1 (phases 1-3, full plan)   **Date**: 2026-10-11
**Round**: 1   **Verdict**: APPROVED   **Findings**: 6

Diff reviewed: `f20ecf5..HEAD`. The branch is stacked on F-01 (`szkielet-aplikacji-offline`), and F-01's code is out of scope. The diff touches 12 code files with about 710 changed lines, so two read-only evidence passes ran alongside the local checks: one for plan drift, one for safety, quality and patterns.

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
| 1.1 / 2.1 | `pnpm exec vitest run --reporter=json` | PASS: 29/29 tests in 4 files (App 8, profileStore 11, db 6, persist 4) |
| 1.2 / 2.2 | `pnpm typecheck` (`tsc -b`) | PASS, exit 0 |
| 1.3 / 2.3 | `pnpm lint` | PASS, exit 0 |
| 2.4 | `pnpm build` | PASS, exit 0 (generateSW, 12 precache entries) |
| 3.1 | `CI=1 pnpm test:e2e` | PASS: 4/4 (installability x2, offline, profile) |
| 2.5 | Manual: the create screen fits a phone viewport and the buttons are easy to tap | Pending. Diff evidence: 2-column grid, `min-h-14` buttons, `overflow-y-auto` on main (`src/profile/CreateProfileScreen.tsx:75`, `src/App.tsx:40`) |
| 3.2 | Manual: on a real phone, close and reopen the app | Pending. Automated proxy: `e2e/profile.spec.ts:19-32` |

The architecture gate is not applicable: there is no `context/architecture/model.c4`. This is not a bug-mode change.

## Plan adherence
Every planned item matches the code:
- Migration v2 is appended, v1 is untouched, and v2 carries the S-02/S-09 comment (`src/storage/migrations.ts:21-27`).
- The storage tests are updated, including a real v1 to v2 upgrade (`src/storage/db.test.ts:14-19,62-85`).
- The profile module provides the `ProfileStore` types, `createIndexedDbProfileStore`, `validateProfileInput` and a typed `ProfileError`. `create` writes both stores in one readwrite transaction (`src/profile/profileStore.ts:12-35,50-71,111-141`).
- The instrument presets are in `src/profile/instruments.ts:7-16`.
- The create screen (`src/profile/CreateProfileScreen.tsx`) keeps the h1 and the greeting. It has the planned label text, the instrument radiogroup, the "Inny" text field and the retry message.
- The profile screen shows the name and the instrument.
- `App({ store? })` has loading, create and profile states, and renders an empty `main` while loading.
- The App tests cover every planned case, plus a retry after a failed load.
- The e2e spec covers a reload and an offline reload.

Three additions are not in the plan but stay in scope:
- `src/profile/copy.ts` holds the shared `GREETING` and `RETRY_MESSAGE`.
- `instrumentIcon()` gives "Inny" instruments a fallback icon.
- `App` has a load-failed state with a retry button.

All three are small and consistent with the plan's rule that a failed load shows a retry message. They raise no guard beyond this note.

## Findings
### F1: When a profile already exists, the save error offers a retry that can never succeed
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/profile/CreateProfileScreen.tsx:39-44; src/profile/profileStore.ts:134-135
- **Detail**: A profile can already exist when the user saves, for example one created in a second tab while this tab sat on the form. `create` then throws `ProfileError('exists')`, the form shows the generic retry message, and pressing "Gotowe" again fails the same way. Reloading the app fixes it, because `load` then finds the profile. Reaching this state needs two first-launch windows open at once.
- **Fix**: on a `ProfileError` with code `exists`, call `store.load()` and pass the result to `onCreated`.
- **Decision**: ACCEPT. The trigger is rare, a reload fixes it and no data is lost. Fold the fix into the next change that touches the create flow.

### F2: The cached long-lived connection has no `versionchange` or `terminated` handling
- **Severity**: OBSERVATION
- **Impact**: MEDIUM
- **Dimension**: Safety & Quality
- **Location**: src/profile/profileStore.ts:84-95; src/storage/db.ts:26 (F-01)
- **Detail**: The store keeps one connection open for the whole page lifetime. Two problems follow:
  - A future migration (v3) opened in another tab would be blocked by a tab that still holds a v2 connection.
  - If the browser terminates the connection, it stays cached until the page reloads.

  Neither affects users today: v2 is the only upgrade, and the app never opened v1 at runtime.
- **Fix**: add `blocking` and `terminated` handlers in `openDb` that close the connection and clear the store's cache.
- **Decision**: ACCEPT. The fix belongs to the storage contract (F-01 code) and only matters from the next migration on. The slice that appends v3 should add it.

### F3: `role="radio"` buttons do not support arrow-key navigation
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Pattern Consistency
- **Location**: src/profile/CreateProfileScreen.tsx:75-92
- **Detail**: The instrument group uses `role="radiogroup"` and `role="radio"` with `aria-checked`, but every option is its own tab stop and the arrow keys do nothing. The ARIA radio pattern expects one tab stop with arrow-key movement. Users can still choose by touch, or with Tab plus Enter or Space.
- **Fix**: use a roving tabindex with arrow keys, or visually styled native radio inputs.
- **Decision**: ACCEPT. The audience is touch-first (NFR Czytelność) and keyboard selection still works. This is accessibility polish, not a defect against FR-001.

### F4: The disabled "Gotowe" button gives no reason, and the loading state is silent
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/profile/CreateProfileScreen.tsx:120-124; src/App.tsx (loading `main`)
- **Detail**: `validateProfileInput` returns reasons, but the screen never shows them. The empty loading frame has no `aria-busy`.
- **Decision**: ACCEPT. Both behaviours follow the plan: "Gotowe" stays disabled until both fields are valid, and an empty `main` renders while loading (plan, Critical Implementation Details; brief, row "Loading state").

### F5: `onCreated` runs inside the save's `try` block
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/profile/CreateProfileScreen.tsx:40
- **Detail**: If the parent's handler threw, the screen would report a failed save even though the save succeeded. Today `onCreated` is a plain `setState` and cannot throw in practice.
- **Decision**: ACCEPT. The risk is theoretical with the current parent.

### F6: Atomicity is only tested indirectly, and the e2e `getByText('Gitara')` locator is unscoped
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Success Criteria
- **Location**: src/profile/profileStore.test.ts:81; e2e/profile.spec.ts
- **Detail**: No dedicated test asserts that an instrument row never exists without a profile. The second-create test covers it indirectly by checking that exactly one instrument row remains. The e2e text locator may match several elements once S-09 lists more than one instrument.
- **Decision**: ACCEPT. The existing assertion does exercise the abort path, and the locator is fine for this slice.
