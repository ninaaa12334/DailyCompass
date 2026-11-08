// Deliberately no schedule cache: private account data is fetched only after authentication.
self.addEventListener('push', event => {
  let payload;
  try { payload = event.data.json(); } catch { return; }
  event.waitUntil(self.registration.showNotification(payload.title || 'Day Compass', { body: payload.body, tag: payload.tag, data: { url: payload.url, key: payload.key } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/dashboard.html', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    const existing = windows.find(window => new URL(window.url).origin === target.origin);
    if (existing) { await existing.navigate(target.href); return existing.focus(); }
    return clients.openWindow(target.href);
  }));
});
