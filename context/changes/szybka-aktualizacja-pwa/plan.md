# Fast and reliable PWA updates — Implementation Plan

## Overview
An installed Grajek PWA on iPhone keeps showing an old build after a deploy,
because the running app never asks for a new service worker once it is loaded.
This change adds update checks on return to the foreground and on an interval,
and replaces the unconditional reload on activation with a guarded one: the app
reloads by itself only when no form holds unsaved input and no save is running;
otherwise it shows a discreet "Jest nowa wersja — odśwież" bar.

## Current State Analysis
- `vite.config.ts:18` — `registerType: 'autoUpdate'`, `injectRegister: false`,
  `strategies: 'generateSW'`. The plugin forces `skipWaiting` and `clientsClaim`
  (`node_modules/vite-plugin-pwa/dist/index.js:875-876`). The issue's stated cause
  (a waiting SW) is contradicted; see `frame.md`.
- `src/main.tsx:13-15` — `registerSW({ immediate: true })` once, PROD only. No
  `onRegisteredSW`, no `onNeedReload`; no `registration.update()` anywhere in `src/`.
- `virtual:pwa-register` autoUpdate branch reloads on the Workbox `activated`
  event when `isUpdate || isExternal`, or calls `onNeedReload` instead when given
  (`node_modules/vite-plugin-pwa/dist/client/build/register.js`).
- `firebase.json` — `no-cache` on `/`, `/index.html`, `/sw.js`, `/push-sw.js`,
  `/registerSW.js`, `/workbox-*.js`, `/manifest.webmanifest`; `/assets/**` immutable.
  Correct already; unchanged.
- Five forms keep local `saving` state: `src/profile/CreateProfileScreen.tsx:28`,
  `src/practice/LogPractice.tsx:64`, `src/instruments/AddInstrumentForm.tsx:40`,
  `src/practice-time/PracticeTimeCard.tsx:122`, `src/weekly-goal/WeeklyGoalCard.tsx:205`.
  There is no app-wide notion of "unsaved work".
- IndexedDB: `src/storage/db.ts:55-65` closes a connection on `blocking` and
  reports `onClose`; `src/storage/db.ts:72-77` reopens at the device version on
  `VersionError`; `src/storage/connection.ts:20-30` forgets a closed connection so
  the next call reopens. A reloaded page opens fresh; an old tab left open is
  released by `blocking`. Nothing to change there; covered by existing tests.
- `e2e/offline.spec.ts` proves the offline reload; `playwright.config.ts` serves
  `vite preview` on port 4173 (run e2e with `CI=1`).

## Desired End State
- When the installed app returns to the foreground (and every 15 minutes while
  visible and online), it asks the browser for a newer service worker.
- When a new version activates and the student is not mid-form or mid-save, the
  page reloads straight onto the new version.
- When the student is mid-form or mid-save, nothing is lost: a small bar
  "Jest nowa wersja" with an "Odśwież" button appears; the app also switches by
  itself on the next return to the foreground if nothing is unsaved then.
- Offline start, push and the IndexedDB data keep working after the reload.

### Key discoveries
- Activation policy is already immediate (`vite.config.ts:18`, plugin `index.js:875-876`).
- `registerSW` accepts `onRegisteredSW(swUrl, registration)` and `onNeedReload`
  (`register.js`), which is all the hook surface needed; no custom SW required.
- iOS standalone PWAs resume without navigation, so the browser's own
  navigation-time update check does not run (`frame.md`).

## What we're NOT doing
- No change to `vite.config.ts` activation settings, Workbox precache or
  `firebase.json` headers.
- No switch to `registerType: 'prompt'` or `injectManifest`.
- No IndexedDB schema or migration change.
- No server-side version endpoint; the SW script itself is the version signal.
- No fix for devices still on the current build before their next cold start
  (their old shell lacks the checks; this change reaches them at the next app
  launch, and every later update arrives on resume).

## Implementation Approach
A new `src/pwa/` module owns the update lifecycle. `registerAppUpdates()` wraps
`registerSW`: in `onRegisteredSW` it starts update checks (foreground via
`visibilitychange`, plus an interval that runs only while visible and online,
both throttled and never overlapping); in `onNeedReload` it asks a reload gate.
The gate reloads immediately when the "unsaved work" registry is empty, else it
marks an update as pending, which the UI shows as a bar and which is retried on
the next foreground return. Forms report unsaved work through one small hook.

Alternatives: (a) prompt-only mode (always ask) is slower and the student may
never tap; (b) reload only while hidden is unreliable on iOS, which freezes
hidden pages; (c) a DOM heuristic for dirty inputs fails for React controlled
inputs, whose value attribute tracks state. A guarded auto-reload with a
fallback bar is fast in the common case and safe in the rare one.

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Guarded fast PWA updates | 1-2 | — | yes | in-progress | — |

## Critical Implementation Details
- The gate must be the only reload path: pass `onNeedReload` so the plugin's
  built-in `window.location.reload()` never runs.
- `registration.update()` rejects when offline or when the SW script 404s;
  swallow those errors (no unhandled rejection, no UI).
- Throttle checks (at most one per 30 s; skip while one is in flight) so rapid
  app switching does not hammer `/sw.js`.
- Everything must be injectable (registerSW, document, timers, reload,
  `navigator.onLine`) so Vitest (jsdom) can drive it without a real SW.
- The registry counts blockers by token, so two forms dirty at once and one
  saving does not clear the other.

## Phase 1: Update checks and reload gate
### Overview
The update lifecycle as pure, unit-tested logic, wired into `main.tsx`.

### Required changes
#### 1. Unsaved-work registry
- **File**: `src/pwa/unsavedWork.ts`
- **Goal**: an app-wide count of "work in progress that a reload would lose",
  with subscribe for UI and a React hook for forms.
- **Contract**: `hasUnsavedWork(): boolean`; `subscribe(listener): unsubscribe`;
  `useUnsavedWork(active: boolean): void` (registers a blocker while `active`,
  releases on `false` and on unmount).

#### 2. Update lifecycle
- **File**: `src/pwa/updates.ts`
- **Goal**: register the SW, check for updates on foreground and on an interval,
  and decide reload vs pending when a new version activates.
- **Contract**: `registerAppUpdates(deps?)` where deps default to the real
  `registerSW`, `document`, `window.setInterval`, `location.reload`,
  `navigator.onLine`; constants `UPDATE_CHECK_INTERVAL_MS = 15 * 60_000`,
  `MIN_CHECK_GAP_MS = 30_000`. Exposes `isUpdatePending()`,
  `subscribeUpdatePending(listener)`, `applyUpdate()` (reloads now). On
  activation: no unsaved work → reload; else pending = true. On each foreground
  return with pending and no unsaved work → reload.

#### 3. Public surface
- **File**: `src/pwa/index.ts`
- **Goal**: re-export the registry, the lifecycle and (phase 2) the bar.

#### 4. Wiring
- **File**: `src/main.tsx`
- **Goal**: replace `registerSW({ immediate: true })` with
  `registerAppUpdates()` (still PROD only); update the comment.

#### 5. Unit tests
- **File**: `src/pwa/updates.test.ts`, `src/pwa/unsavedWork.test.ts`
- **Goal**: with a fake `registerSW` and registration: `update()` called on
  `visibilitychange` to visible, not when hidden, throttled, skipped offline,
  called by the interval; errors from `update()` swallowed; activation reloads
  when idle, sets pending when blocked, reloads on the next foreground return
  once unblocked; `applyUpdate()` reloads; registry counts overlapping blockers.

### Success criteria
#### Automated
- `pnpm test src/pwa` passes, covering the cases listed under Unit tests
- `pnpm lint && pnpm typecheck` pass
- `pnpm build` succeeds and `dist/sw.js` still contains `skipWaiting` and `clientsClaim`
#### Manual
- None

## Phase 2: Forms report unsaved work, update bar, e2e
### Overview
Every form tells the gate when a reload would lose input; the app shows the
fallback bar; an e2e proves the foreground check in a real browser.

### Required changes
#### 1. Forms
- **File**: `src/profile/CreateProfileScreen.tsx`, `src/practice/LogPractice.tsx`,
  `src/instruments/AddInstrumentForm.tsx`, `src/practice-time/PracticeTimeCard.tsx`,
  `src/weekly-goal/WeeklyGoalCard.tsx`
- **Goal**: call `useUnsavedWork(...)` with "a save is in flight, or the student
  has changed a field since the form appeared or was last saved, or an
  expandable entry panel is open" (e.g. `LogPractice` while its panel is open).
- **Contract**: no prop or behaviour change besides the hook call.

#### 2. Update bar
- **File**: `src/pwa/UpdateBanner.tsx`, `src/pwa/copy.ts`
- **Goal**: a small, non-modal bar shown while an update is pending: text
  `Jest nowa wersja` and a button `Odśwież` that calls `applyUpdate()`. Fixed at
  the bottom, respects `env(safe-area-inset-bottom)`, `role="status"`.
- **Contract**: `UpdateBanner` with no required props (reads the pending state
  via `useSyncExternalStore`); Polish copy constants in `copy.ts`.

#### 3. Mount
- **File**: `src/App.tsx`
- **Goal**: render `<UpdateBanner />` once, outside the screen switch so it
  shows on every screen.

#### 4. Tests
- **File**: `src/pwa/UpdateBanner.test.tsx`, plus one case in each form's existing
  test file where one exists (`src/practice/LogPractice.test.tsx`,
  `src/instruments/InstrumentsCard.test.tsx`, `src/practice-time/PracticeTimeCard.test.tsx`,
  `src/weekly-goal/WeeklyGoalCard.test.tsx`, `src/App.test.tsx` for the profile form)
- **Goal**: bar hidden when no update pending, visible with the copy when
  pending, button triggers reload; typing into a form makes `hasUnsavedWork()`
  true and a successful save makes it false again.
- **File**: `e2e/update.spec.ts`
- **Goal**: in the production build, spy on `ServiceWorkerRegistration.prototype.update`
  via `addInitScript`, wait for the SW to control the page, simulate the page
  going hidden then visible, and assert `update()` was called.

### Success criteria
#### Automated
- `pnpm test` passes (full suite, including the new bar and form cases)
- `pnpm lint && pnpm typecheck` pass
- `CI=1 pnpm test:e2e` passes, including `e2e/update.spec.ts` and the existing `e2e/offline.spec.ts`
#### Manual
- After a deploy, an installed iPhone PWA resumed from the background switches to the new version within a few seconds without losing a half-filled form

## Testing Strategy
Vitest (jsdom) drives the lifecycle through injected fakes (no real SW in
jsdom). Form tests assert the registry state through `hasUnsavedWork()`.
Playwright on `vite preview` checks the real registration in Chromium. The
iPhone resume path can only be eyeballed on a device after deploy (Manual 2.4).

## References
- `context/changes/szybka-aktualizacja-pwa/frame.md`
- `vite.config.ts:16-58`, `src/main.tsx`, `firebase.json`
- `node_modules/vite-plugin-pwa/dist/client/build/register.js`
- `src/storage/db.ts`, `src/storage/connection.ts`
- Archive: `context/archive/2026-10-11-szkielet-aplikacji-offline/`

## Progress

### Phase 1: Update checks and reload gate
#### Automated
- [x] 1.1 `pnpm test src/pwa` passes, covering the cases listed under Unit tests — 89fc628
- [x] 1.2 `pnpm lint && pnpm typecheck` pass — 89fc628
- [x] 1.3 `pnpm build` succeeds and `dist/sw.js` still contains `skipWaiting` and `clientsClaim` — 89fc628

### Phase 2: Forms report unsaved work, update bar, e2e
#### Automated
- [x] 2.1 `pnpm test` passes (full suite, including the new bar and form cases)
- [x] 2.2 `pnpm lint && pnpm typecheck` pass
- [x] 2.3 `CI=1 pnpm test:e2e` passes, including `e2e/update.spec.ts` and the existing `e2e/offline.spec.ts`
#### Manual
- [ ] 2.4 After a deploy, an installed iPhone PWA resumed from the background switches to the new version within a few seconds without losing a half-filled form
