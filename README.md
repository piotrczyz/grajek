# Grajek

Grajek is a mobile-first progressive web app (PWA) for music-school students
aged 7-13: a practice log that installs to the phone's home screen (Android and
iOS) and works without internet. All practice data stays on the device; the
only server part is an anonymous registry for push notifications (see
[Notifications backend](#notifications-backend)).

This repository currently holds the app skeleton: a Polish welcome screen, the
on-device storage contract (`src/storage/`), the offline-capable static build and
anonymous push registration with a test notification (`src/push/`, `functions/`).

## Prerequisites

- Node.js 22.12 or newer (`.nvmrc` pins 24)
- pnpm (the version is pinned in `package.json` `packageManager`; `corepack enable` picks it up)

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Dev server | `pnpm dev` |
| Build (static output in `dist/`) | `pnpm build` |
| Preview the production build | `pnpm preview` |
| Unit tests (Vitest) | `pnpm test` |
| E2E tests (Playwright, mobile Chromium) | `pnpm test:e2e` |
| Lint / typecheck | `pnpm lint && pnpm typecheck` |
| Regenerate icons from `public/icon.svg` | `pnpm generate-pwa-assets` |

The first `pnpm test:e2e` on a machine needs the browser:
`pnpm exec playwright install chromium`. E2E runs against `pnpm build && pnpm preview`
on port 4173, because the service worker exists only in the production build.

## Publishing

The app is a static site plus one small Cloud Function for notifications (see
[Notifications backend](#notifications-backend) for its go-live steps). It is
published on **Firebase Hosting**, project `grajek-app`, at https://grajek-app.web.app.

1. Run `pnpm build` (static output in `dist/`).
2. Once per machine, log in: `npx firebase-tools login`.
3. Deploy: `npx firebase-tools deploy --only hosting`.

`firebase-tools` is not a project dependency; `npx` fetches it on demand.
`.firebaserc` selects the `grajek-app` project, and `firebase.json` serves `dist/`
with an SPA rewrite to `index.html` and the cache headers listed below. CI only
checks and builds (and runs the backend tests on the emulators); it does not deploy.

After the first online visit the service worker precaches the whole app; a new
version is fetched in the background and takes over on the next launch.

### Other static hosts

The build is host-agnostic, so `dist/` also works on any other static host:

1. Upload the contents of `dist/`. It works at the domain root or under any
   sub-path (for example `https://example.org/grajek/`): asset URLs, `start_url`
   and `scope` are relative.
2. Serve it over **HTTPS**. Service workers, offline use and installation only
   work on HTTPS (or `localhost`).
3. Set cache headers (the same rules `firebase.json` applies):
   - **No caching** (`Cache-Control: no-cache`) for `index.html`, `sw.js`, `push-sw.js`,
     `registerSW.js` (if present), `workbox-*.js` and `manifest.webmanifest`, so
     students receive updates.
   - **Long caching** (`Cache-Control: public, max-age=31536000, immutable`) for
     `assets/`, whose file names carry a content hash.
4. Serve `manifest.webmanifest` as `application/manifest+json` (most hosts do).

## Project layout

- `src/App.tsx` - welcome screen
- `src/storage/` - IndexedDB contract: `openDb()`, ordered `migrations`,
  `requestPersistentStorage()`. Change the schema only by appending a migration.
- `public/` - icon source (`icon.svg`) and generated PNG icons
- `src/push/` - notifications: anonymous device id, subscribe/unsubscribe, test
  notification, the "Powiadomienia" panel
- `public/push-sw.js` - push and notification-tap handlers, imported by the generated service worker
- `functions/` - the notification backend (Cloud Function + Firestore), its own pnpm package
- `e2e/` - Playwright tests (offline reload, installability, notifications panel)

## Notifications backend

Architecture in three lines:

1. The phone creates a random device id (IndexedDB) and a standard Web Push subscription (VAPID); no name, no account, no Firebase SDK in the app.
2. It sends only those to the Cloud Function `api` (region `europe-central2`, same-origin through the Hosting rewrite `/api/**`), which keeps them in Firestore `devices/{deviceId}`; Firestore rules deny every client access.
3. The function sends pushes with `web-push`; the service worker shows them and opens Grajek on tap.

Endpoints: `PUT /api/devices/{id}` (register, idempotent), `DELETE /api/devices/{id}`,
`POST /api/devices/{id}/test` (one test notification, at most once a minute).

### Run it locally

Prerequisites: everything above, plus a **JDK 21** for the Firestore emulator
(`java -version`). The Functions and Hosting emulators do not need Java.

| Task | Command |
|---|---|
| Install the backend | `pnpm --dir functions install --frozen-lockfile` |
| Build / typecheck | `pnpm --dir functions build`, `pnpm --dir functions typecheck` |
| Unit tests (no emulator, no Java) | `pnpm --dir functions test` |
| Emulator tests (Functions + Firestore) | `pnpm --dir functions test:emulators` |
| Start the emulators (Functions, Firestore, Hosting) | `pnpm --dir functions emulators` |

Every emulator script uses the offline demo project `demo-grajek`, which can never
reach real cloud resources. On the emulator the function records pushes instead of
sending them (`PUSH_SENDER=log` in `functions/.env.demo-grajek`), and
`functions/.secret.local` is created from `functions/.secret.local.example` when missing.
With the emulators running, `pnpm dev` proxies `/api` to the Functions emulator;
the Hosting emulator (port 5000) serves the last `pnpm build`.

### VAPID keys

Generate one key pair: `pnpm --dir functions exec web-push generate-vapid-keys`.

- Public key: `VITE_VAPID_PUBLIC_KEY` in `.env.local` (see `.env.example`); it is built into the app. Without it the notifications panel is hidden.
- Private key: `VAPID_PRIVATE_KEY=...` in `functions/.secret.local` (gitignored) for real sends from the emulator; in Firebase it is a secret (below). Never commit it.

### Go live (manual steps for the project owner)

The agent that built this did not deploy anything or change any cloud setting.

1. Link billing (the **Blaze** plan) on `grajek-app`; Cloud Functions require it.
2. Create the Firestore database in `europe-central2`.
3. `npx firebase-tools functions:secrets:set VAPID_PRIVATE_KEY` (paste the private key).
4. Put the public key and a contact in `functions/.env.grajek-app`:
   `VAPID_PUBLIC_KEY=...` and `VAPID_SUBJECT=mailto:you@example.com` (or answer the prompt on the first deploy).
5. Build the app with the public key: `VITE_VAPID_PUBLIC_KEY=... pnpm build`.
6. `npx firebase-tools deploy --only functions,firestore,hosting`.
7. Check on a real Android phone (Chrome, app installed) and an iPhone with iOS 16.4+
   (app added to the home screen): "Włącz przypomnienia", then "Wyślij próbne
   powiadomienie" with the app closed; tapping the notification opens Grajek.

**iOS:** Web Push works only on iOS/iPadOS 16.4 or newer, and only in the app added
to the home screen. In Safari the panel shows a hint to add Grajek to the home screen.

**Before publication:** the app stores an anonymous device id and push subscription
on a server. Publishing waits for the answer on GDPR (RODO) and parental consent.
