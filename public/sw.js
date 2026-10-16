// The app's service worker: Angular's (offline caching, updates) plus OS push notifications.
// Two workers can't share a scope, so this one loads Angular's and adds push on top.
// Registered in app.config.ts; production builds only (ng serve doesn't emit ngsw-worker.js).
importScripts('./ngsw-worker.js');

// Pushes come from the send-push Supabase Edge Function (supabase/functions/send-push) as Web Push
// messages shaped { data: { title, body, link, tag } }. Angular's worker ignores them (it only shows
// payloads with a `notification` key), so they're shown exactly once, here.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = (event.data && event.data.json().data) || {};
  } catch (e) {
    return;
  }
  if (!data.title) return;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || undefined, // the same notification never shows twice
      data: { link: data.link || '/dashboard' },
    })
  );
});

// Open (or focus) the app on the notification's page
self.addEventListener('notificationclick', (event) => {
  // Angular's worker handles clicks on its own notifications; ours are the ones carrying `link`
  const link = event.notification.data && event.notification.data.link;
  if (!link) return;
  event.notification.close();
  const url = new URL(link, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        return open.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : self.clients.openWindow(url)));
      }
      return self.clients.openWindow(url);
    })
  );
});
