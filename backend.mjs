// True when the Node account server answers on this site. Static hosting (e.g. Vercel)
// has no /api, so accounts are unavailable there and the planner runs in browser-only mode.
export const backendReachable = fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' })
  .then(response => (response.headers.get('content-type') || '').includes('application/json'))
  .catch(() => false);
