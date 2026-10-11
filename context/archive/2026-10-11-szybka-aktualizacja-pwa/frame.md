# Frame Brief: Stale app version on iPhone after a deploy

## Reported observation
After a new version is deployed, a user on iPhone (Safari / installed PWA) still
sees the old app: the F-01 welcome screen instead of the profile form.

## Initial framing (preserved)
- Stated cause or approach: the service worker serves the old precache, and the
  new version takes control only after every tab is closed (the "waiting" SW).
- Proposed direction: vite-plugin-pwa `registerType: 'autoUpdate'` (skipWaiting +
  clientsClaim) with a safe reload when the new SW takes control (not while the
  student is filling a form or saving; or a discreet "Jest nowa wersja —
  odśwież" prompt), update checks on `visibilitychange` and periodically; keep
  offline, keep the `firebase.json` no-cache headers, keep IndexedDB reopen safe.
- Narrowing source: evidence only (direct reads of config, plugin output and
  registration code; no subagents needed, the surface is three files).

## Dimension map
1. SW activation policy: does a new SW wait for all clients to close? (framing
   assumes yes)
2. Update discovery: when does the browser fetch `sw.js` and notice a new build?
   (framing silent)
3. HTTP caching of the SW scripts and the shell (framing assumes fine)
4. Page takeover after activation: does the open page reload onto the new
   build? (framing assumes no)

## Hypothesis investigation
| Hypothesis | Evidence | Verdict |
|---|---|---|
| (initial framing) new SW waits until all tabs close | `vite.config.ts:18` already has `registerType: 'autoUpdate'` since F-01 (`git show 8235e62:vite.config.ts`, line 18); the plugin then forces `workbox.skipWaiting = true` and `workbox.clientsClaim = true` (`node_modules/vite-plugin-pwa/dist/index.js:875-876`) | NONE |
| Update is never discovered while the installed PWA is resumed from the background | `src/main.tsx:14` calls `registerSW({ immediate: true })` once per page load; nothing in `src/` calls `registration.update()` (grep). An iOS standalone PWA is resumed, not re-navigated, so the browser's navigation-time SW check never runs until the app process is killed | STRONG |
| SW scripts or shell cached by HTTP | `firebase.json` sends `Cache-Control: no-cache` for `/`, `/index.html`, `/sw.js`, `/push-sw.js`, `/registerSW.js`, `/workbox-*.js`, `/manifest.webmanifest` | NONE |
| Page not taken over after activation | `virtual:pwa-register` in autoUpdate mode reloads on the Workbox `activated` event with `isUpdate`/`isExternal` (`node_modules/vite-plugin-pwa/dist/client/build/register.js`, `auto` branch) — takeover works, but the reload is unconditional and can wipe a half-filled form | WEAK (as a staleness cause); real as a data-loss risk |

## Narrowing signals
- `registerType: 'autoUpdate'` present on the default branch and in the F-01
  commit 8235e62: excludes dimension 1, so a waiting SW is not the cause.
- `no-cache` on every SW-related path in `firebase.json`: excludes dimension 3.
- No update polling anywhere (`grep -rn "update()" src` finds none for the
  registration): dimension 2 is the only path with positive evidence.

## Cross-system convention
The usual remedy for long-lived installed PWAs (iOS in particular) is to call
`ServiceWorkerRegistration.update()` on return to the foreground and on an
interval, then hand the page over to the new build at a safe moment. The leading
hypothesis matches that convention. No prior occurrence in
`context/archive/**` (F-01 `szkielet-aplikacji-offline` introduced autoUpdate and
never revisited update discovery).

## Reframed (or confirmed) problem statement
> The real problem to plan is: the running app never asks for a new service
> worker after it was first loaded, so an iPhone PWA resumed from the
> background keeps the old build until iOS kills it; and when an update does
> activate, the reload is unconditional.

The activation policy (skipWaiting + clientsClaim) is already in place and needs
no change. The plan is about update discovery (foreground + periodic checks) and
a guarded takeover (no reload over unsaved input or an in-flight save).

## Key decisions
| Decision | Choice | Why | Source |
|---|---|---|---|
| Leading hypothesis | Missing update discovery on resume | Only dimension with positive evidence (`src/main.tsx:14`, no `update()` call) | Auto |
| Stated cause | Rejected | `vite.config.ts:18` + plugin `index.js:875-876` | Auto |

## Confidence
HIGH

## What changes for rs-plan
Do not re-add autoUpdate; plan explicit update checks (visibilitychange,
interval) and replace the plugin's unconditional reload with a guarded one.
Note that devices still on the current build pick up this fix only on their
next cold start; every update after that arrives on resume.

## References
- `vite.config.ts:16-58`, `src/main.tsx:12-15`, `firebase.json` headers
- `node_modules/vite-plugin-pwa/dist/index.js:875-876`,
  `node_modules/vite-plugin-pwa/dist/client/build/register.js`
- `src/storage/db.ts:44-84`, `src/storage/connection.ts:14-32` (reopen path)
