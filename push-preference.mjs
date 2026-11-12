// A durable opt-in per account/browser, separate from disposable session caches.
// This contains no subscription endpoint, keys, or schedule data.
export function pushPreference(userId, store = localStorage) {
  const key = `day-compass.push-choice.v1.${userId}`;
  return {
    get() { try { return store.getItem(key); } catch { return null; } },
    set(enabled) { store.setItem(key, enabled ? 'enabled' : 'disabled'); }
  };
}
