import { useAccount, clearAccountCache, isDemo } from './runtime.mjs';
let expectedUser = null;
export async function api(path, method = 'GET', data) {
  const response = await fetch(`/api/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(expectedUser ? { 'X-Compass-User': expectedUser } : {}) }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(path === 'ai/preview' ? 55000 : 30000) });
  const body = await response.json().catch(() => ({ error: 'Backend unavailable. Start the Node server with npm start.' }));
  if (!response.ok) throw Object.assign(new Error(body.error || `Request failed (${response.status})`), { status: response.status });
  return body;
}
export async function loadAccount() {
  if (isDemo) return { user: null, features: {}, demo: true };
  let session;
  try { session = await api('session'); } catch { return { user: null, features: {}, unavailable: true }; }
  if (session.user) { expectedUser = session.user.id; const doc = await api('planner'); useAccount(session.user.id, doc.state); session.document = doc; }
  return session;
}
export function connectAccount(model, session, status) {
  let version = session.document?.version || 0, dirty = false, sending = null, applying = false, conflict = false;
  const message = text => status.textContent = text;
  async function flush() {
    if (!session.user) return;
    if (sending) { await sending; if (dirty) return flush(); return; }
    if (conflict) throw new Error('Sync conflict. Export a backup, then reload the server copy.');
    if (!dirty) return;
    const snapshot = model.snapshot(); dirty = false;
    sending = (async () => {
      try { const doc = await api('planner', 'PUT', { state: snapshot, version }); version = doc.version; message(`Saved privately to your account at ${new Date().toLocaleTimeString()}.`); }
      catch (error) { dirty = true; conflict = error.status === 409; message(`${error.message} Your unsynced changes remain in this tab. Download a backup before reloading.`); throw error; }
      finally { sending = null; }
    })();
    await sending; if (dirty) return flush();
  }
  model.subscribe(() => { if (session.user && !applying) { dirty = true; message('Saving private account changes…'); flush().catch(() => {}); } });
  async function replace(doc) { version = doc.version; applying = true; try { model.replaceSnapshot(doc.state); dirty = false; conflict = false; } finally { applying = false; } message('Private planner is up to date.'); }
  setInterval(async () => {
    if (!session.user || document.hidden || conflict) return;
    try { if (dirty) await flush(); else if (!sending) { const doc = await api('planner'); if (!dirty && !sending && doc.version !== version) await replace(doc); } } catch (error) { message(`Sync paused: ${error.message}`); }
  }, 15000);
  window.addEventListener('beforeunload', event => { if (dirty || sending) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('offline', () => message(session.user ? 'Offline. Changes in this tab will sync when the server is reachable.' : 'Offline. Local changes still save in this browser; online services are unavailable.'));
  window.addEventListener('online', () => { if (session.user) flush().catch(() => {}); else message('Online. Your local planner stays saved in this browser.'); });
  return { flush, replace, async logout() { await flush(); await api('logout', 'POST'); clearAccountCache(); try { if (session.user?.provider === 'clerk') { const { signOutClerk } = await import('./clerk-client.mjs'); await signOutClerk(); } } finally { location.reload(); } } };
}
