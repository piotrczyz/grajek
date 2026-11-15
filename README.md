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
published on **Firebase Hosting** at https://grajek.web.app (Hosting site `grajek`
in project `grajek-app`).

The old address https://grajek-app.web.app (the project's default site `grajek-app`)
only redirects (301) to the same path on https://grajek.web.app, so old links keep
working. Its one file, `hosting/legacy/sw.js`, replaces the service worker an
earlier visit installed there: it clears that origin's caches, unregisters itself and
sends open windows to the new address. An app added to the home screen from the old
address, and push reminders turned on there, are tied to the old origin: add the app
again from https://grajek.web.app and turn reminders on again.

Publishing happens only in GitHub Actions (`.github/workflows/ci.yml`); there is
no local deploy. Both deploys run only after all checks (lint, typecheck, unit
tests, build, e2e) pass, and they publish the exact `dist/` those checks built:

- **Pull requests** from a branch of this repository get a Firebase preview
  channel on site `grajek`. The link is posted as a comment on the PR and updated on later
  pushes; a preview channel expires after 7 days. PRs from forks run the checks
  but get no preview.
- **Every push to `main`** (a merge) deploys the live site and the redirect on
  the old address.

`.firebaserc` selects the `grajek-app` project, and `firebase.json` serves `dist/`
on site `grajek` with an SPA rewrite to `index.html` and the cache headers listed
below, and `hosting/legacy/` with the redirect on site `grajek-app`. CI also
runs the notification backend tests on the emulators; it does not deploy the
Cloud Function (see [Notifications backend](#notifications-backend)).

After the first online visit the service worker precaches the whole app; a new
version is fetched in the background and takes over on the next launch.

### One-time setup

The deploy jobs need the repository secret `FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP`
(the JSON key of a service account that may deploy to Hosting). Create it in one
of two ways:

**(a) With the Firebase CLI.** Run `npx firebase-tools init hosting:github` in
this repository, pick project `grajek-app` and enter the repository
`piotrczyz/grajek`. It creates the service account and stores its key as the
secret `FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP`. Answer "no" when it asks to set up
a build script or to deploy on merge/PR, or delete the generated
`.github/workflows/firebase-hosting-*.yml` files before committing: `ci.yml`
already deploys, and those workflows would deploy a second time without the
checks.

**(b) By hand.**

1. In the Google Cloud console, open project `grajek-app`, go to **IAM & Admin >
   Service Accounts** and create a service account with the role
   **Firebase Hosting Admin**.
2. On that account, open **Keys > Add key > Create new key**, choose JSON and
   download it as `key.json`.
3. Store it as the secret:
   `gh secret set FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP -R piotrczyz/grajek < key.json`
   (or paste it under **Settings > Secrets and variables > Actions** on GitHub).
4. Delete the local `key.json`.

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
6. `npx firebase-tools deploy --only functions,firestore,hosting` (`hosting` covers both sites, the app and the redirect).
7. Check on a real Android phone (Chrome, app installed) and an iPhone with iOS 16.4+
   (app added to the home screen): "Włącz przypomnienia", then "Wyślij próbne
   powiadomienie" with the app closed; tapping the notification opens Grajek.

**iOS:** Web Push works only on iOS/iPadOS 16.4 or newer, and only in the app added
to the home screen. In Safari the panel shows a hint to add Grajek to the home screen.

**Before publication:** the app stores an anonymous device id and push subscription
on a server. Publishing waits for the answer on GDPR (RODO) and parental consent.

## Spike telemetry

The hidden "Zagraj i sprawdź" screen (`?spike=nuty`) sends one anonymous record per
finished attempt to the same `api` function, so the owner can tell a child's mistakes
from recognition mistakes across devices.

Endpoints (JSON, `Cache-Control: no-store`):

- `PUT /api/spike-nuty/attempts/{attemptId}` - the attempt record (at most 64 KiB);
  `attemptId` is a client-generated UUID v4, so a retry of a stored attempt answers
  204 and changes nothing.
- `PUT /api/spike-nuty/attempts/{attemptId}/feedback` - the answer to "Czy ocena się
  zgadza?" (at most 8 KiB); accepted only from the device that sent the attempt, a
  later answer replaces the earlier one.
- Each device may write 60 times per hour (attempts and feedback together); then
  `429` with `Retry-After`.

**What is stored** in Firestore `spikeNutyAttempts/{attemptId}`: the anonymous device
id, the app build, the user agent (as sent, at most 512 characters), whether the app
runs installed, the screen settings (melody, instrument, tempo, preparation, toggles),
the scores and counts, the note-by-note grading, the raw detected notes (pitch,
timing, clarity, level), the latency figures, whether the attempt ran to the end,
the feedback, and the server times `receivedAt` and `expireAt`. Every other field of
the request is dropped. The per-device counter lives in `spikeNutyRateLimits/{deviceId}`.

**What is not stored:** no audio, no profile name or profile data, no IP address, no
account. Clients cannot read or write either collection (Firestore rules deny all).

**Retention: 180 days.** Every attempt gets `expireAt` = receipt + 180 days, every
counter `expireAt` = end of its one-hour window + 1 day, and Firestore TTL deletes the
documents after that time (usually within a day). The TTL policies are declared in
`firestore.indexes.json` (`fieldOverrides` with `"ttl": true` on `expireAt` for both
collections) and are deployed with `npx firebase-tools deploy --only firestore:indexes`
(part of `--only firestore`). If the deploy does not create them, set them in the
Firebase console (Firestore, TTL) or with:

```sh
gcloud firestore fields ttls update expireAt --collection-group=spikeNutyAttempts --enable-ttl
gcloud firestore fields ttls update expireAt --collection-group=spikeNutyRateLimits --enable-ttl
```

**Going live is a manual owner step.** CI builds and tests the functions but never
deploys them, so the new routes exist only after the owner runs
`npx firebase-tools deploy --only functions,firestore`. PR previews call the live
`api` through the same `/api/**` rewrite, so until that deploy the app's sends fail
(silently) on previews too.
