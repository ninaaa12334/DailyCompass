// Deliberately no schedule cache: private account data is fetched only after authentication.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(clients.claim()));
async function reportReceipt(key, phase) {
  if (!/^[a-f0-9]{64}$/.test(key || '')) return;
  try { await fetch('/api/push/receipt', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, phase }), signal: AbortSignal.timeout(5000) }); } catch { /* Receipt failure must not prevent notification display. */ }
}
self.addEventListener('push', event => {
  let payload;
  try { payload = event.data.json(); } catch { return; }
  event.waitUntil((async () => {
    const received = reportReceipt(payload.key, 'received');
    try { await self.registration.showNotification(payload.title || 'Day Compass', { body: payload.body, tag: payload.tag, data: { url: payload.url, key: payload.key } }); await reportReceipt(payload.key, 'display-requested'); }
    catch { await reportReceipt(payload.key, 'display-failed'); }
    await received;
  })());
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
