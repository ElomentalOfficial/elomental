// Elomental's service worker: only the Daily reminder (src/reminders.ts, Edge Function
// send-reminders). It caches nothing and handles no requests: the app works as it did without it.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || 'Elomental';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: './icon-192.png',
      badge: './favicon-48.png',
      tag: 'daily-reminder',
      data: { url: data.url || './' },
    }),
  );
});

// A tap: an open tab is told (main.ts decides, so a game in progress is never thrown away) and
// brought forward; with none open, the game opens at the Daily.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((open) => {
      const tab = open.find((client) => new URL(client.url).origin === self.location.origin && 'focus' in client);
      if (!tab) return self.clients.openWindow(url);
      tab.postMessage({ type: 'open-daily' });
      return tab.focus();
    }),
  );
});
