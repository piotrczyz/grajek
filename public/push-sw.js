/*
 * Push handlers for the Grajek service worker (roadmap F-02).
 *
 * Plain JS, not bundled: the generated Workbox SW pulls it in with
 * importScripts (vite.config.ts, workbox.importScripts). The server sends a
 * JSON payload `{ title, body, tag }`.
 */

const DEFAULT_TITLE = 'Grajek';

function parsePayload(data) {
  if (!data) {
    return {};
  }
  try {
    const parsed = data.json();
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePayload(event.data);
  const title =
    typeof payload.title === 'string' && payload.title ? payload.title : DEFAULT_TITLE;
  const options = {
    icon: new URL('pwa-192x192.png', self.registration.scope).href,
    lang: 'pl',
  };
  if (typeof payload.body === 'string') {
    options.body = payload.body;
  }
  if (typeof payload.tag === 'string') {
    options.tag = payload.tag;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url.startsWith(scope));
      if (open) {
        return open.focus();
      }
      return self.clients.openWindow(scope);
    }),
  );
});
