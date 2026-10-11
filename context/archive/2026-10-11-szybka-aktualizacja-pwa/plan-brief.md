# Fast and reliable PWA updates — Plan Brief
Full plan: `plan.md` · frame: `frame.md` · request text: `change.md`

## What & why
An installed Grajek PWA on iPhone keeps an old build after a deploy. The app
must pick up new versions quickly, without losing what a student is typing.

## Starting point
`registerType: 'autoUpdate'` (skipWaiting + clientsClaim) is already on since
F-01 (`vite.config.ts:18`); the request's stated cause is wrong. The real gap:
the app registers the SW once (`src/main.tsx:14`) and never calls
`registration.update()`, and an iOS PWA resumed from the background does not
navigate, so no update is discovered. When one does activate, the plugin reloads
unconditionally.

## Desired end state
Update checks on foreground return and every 15 min; automatic reload when no
form has unsaved input or a save in flight; otherwise a "Jest nowa wersja —
Odśwież" bar, plus an automatic switch on the next foreground return.

## Complexity
LOW — one new self-contained module, a one-line wiring change, a hook call in
five forms and one small bar. No schema, contract, dependency or config change.
Skipped: rs-research (the surface is three files, read directly). rs-frame run
(the request stated a cause; the code contradicts it). Jev unavailable (no
Python on this machine), so both choices are my own.

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Area split | A1 pwa-update, one increment | Single area handed over | Orchestrator |
| Research step | Skipped | Surface fits three files read in full | Auto |
| Frame step | Run (lightweight, no subagents) | Request states a cause; `vite.config.ts:18` already has autoUpdate | Auto |
| Root cause | Missing update discovery on resume | No `update()` call in `src/`; iOS resume does not navigate | Frame |
| Activation policy | Keep autoUpdate as is | skipWaiting/clientsClaim already forced (`vite-plugin-pwa/dist/index.js:875-876`) | Frame |
| Takeover UX | Auto-reload when idle, bar when unsaved work exists | Fast in the common case, no data loss; prompt-only is slow, reload-while-hidden unreliable on iOS | Auto |
| Detecting unsaved work | Explicit `useUnsavedWork` hook in each form | DOM heuristics fail on React controlled inputs; five forms already track `saving` | Auto |
| "Unsaved" definition | save in flight, or a field changed since shown/last saved, or an entry panel open | Covers mid-typing and mid-save, as the request asks | Auto |
| Check triggers | `visibilitychange` to visible + 15 min interval while visible and online; 30 s throttle | Request asks for both; throttle avoids hammering `/sw.js` | Auto |
| Reload hook | Pass `onNeedReload` to `registerSW` | Only way to suppress the plugin's built-in reload (`register.js` auto branch) | Auto |
| IndexedDB after reload | No change | `blocking` close + `VersionError` reopen already handle it (`src/storage/db.ts:55-77`) | Auto |
| `firebase.json` headers | No change | `no-cache` already on every SW path | Auto |
| E2E | New `e2e/update.spec.ts` spying on `update()`; run with `CI=1` | Real-browser proof of the foreground check; port 4173 shared | Orchestrator + Auto |

## Scope
In: `src/pwa/**`, `src/main.tsx`, `src/App.tsx`, the five form components and
their tests, `e2e/update.spec.ts`.
Out: Workbox/precache config, headers, IndexedDB schema, a server version endpoint.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Guarded fast PWA updates | — | yes | A form not reporting unsaved work could lose input on reload |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | `src/pwa` lifecycle + registry, wired in `main.tsx`, unit tests | Throttle/timer logic in jsdom |
| 2 | 1 | Forms report unsaved work, update bar, e2e | Per-form "dirty" definitions |

## Open risks & assumptions
- Devices on the current build get this fix only at their next cold start;
  updates after that arrive on resume.
- The iPhone resume behaviour can only be verified on a device after deploy (Manual 2.4).

## Success criteria (summary)
Unit tests for the lifecycle, registry, bar and forms; lint, typecheck, build
(SW still has skipWaiting/clientsClaim); `CI=1 pnpm test:e2e` incl. the new
update spec and the offline spec.
