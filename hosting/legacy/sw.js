/*
 * Self-destroying service worker for the legacy site grajek-app.web.app.
 *
 * The app moved to https://grajek.web.app. Every other path on the old site is
 * a 301 redirect (firebase.json), but a browser rejects a redirected worker
 * script, so an install from the old address would keep serving its precache.
 * This worker replaces it on the next update check: it clears Cache Storage,
 * unregisters itself and sends each open window to the same path on the new
 * address. No fetch handler: once it is gone, the network (and its 301)
 * answers every request.
 *
 * Plain JS, no imports.
 */

const NEW_ORIGIN = 'https://grajek.web.app';

self.addEventListener('install', () => {
  self.skipWaiting();
});

async function clearCaches() {
  const keys = await self.caches.keys();
  await Promise.allSettled(keys.map((key) => self.caches.delete(key)));
}

async function moveWindows() {
  const windows = await self.clients.matchAll({ type: 'window' });
  await Promise.all(
    windows.map((client) =>
      attempt(() => {
        const url = new URL(client.url);
        return client.navigate(NEW_ORIGIN + url.pathname + url.search + url.hash);
      }),
    ),
  );
}

/** Runs a step and swallows its failure, sync or async. */
function attempt(step) {
  return Promise.resolve()
    .then(step)
    .catch(() => undefined);
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Each step runs even when an earlier one fails.
      await attempt(clearCaches);
      await attempt(() => self.registration.unregister());
      await attempt(moveWindows);
    })(),
  );
});
