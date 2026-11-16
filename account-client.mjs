import { useAccount, clearAccountCache, isDemo } from './runtime.mjs';
import { currentUser, loadPlanner, savePlanner, signOut } from './cloud.mjs';
import { createPlannerStore } from './planner-store.mjs';
let expectedUser = null;
export async function api(path, method = 'GET', data) {
  const response = await fetch(`/api/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(expectedUser ? { 'X-Compass-User': expectedUser } : {}) }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(path === 'ai/preview' ? 55000 : 30000) });
  const body = await response.json().catch(() => ({ error: 'Backend unavailable. Start the Node server with npm start.' }));
  if (!response.ok) throw Object.assign(new Error(body.error || `Request failed (${response.status})`), { status: response.status });
  return body;
}

// Unsaved account changes are kept on this device (localStorage survives refresh, closing the tab
// and signing out/in) until the server confirms them. They're stored without the undo copy to stay small.
const pendingKey = id => `day-compass.pending-account-changes.${id}`;
export function readPending(id) { try { return JSON.parse(localStorage.getItem(pendingKey(id))) || null; } catch { return null; } }
function writePending(id, value) { try { if (value) localStorage.setItem(pendingKey(id), JSON.stringify(value)); else localStorage.removeItem(pendingKey(id)); return true; } catch { return false; } }

// A fresh planner for a brand-new account (it then goes through the welcome setup).
function newPlannerState() {
  const memory = new Map(), store = createPlannerStore({ getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) });
  const state = store.snapshot(); state.settings.onboardingComplete = false;
  try { state.settings.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
  return state;
}
// Accounts live in Supabase, so they work on every link and device.
export async function loadAccount() {
  if (isDemo) return { user: null, features: {}, demo: true };
  let user;
  try { user = await currentUser(); } catch { return { user: null, features: {}, unavailable: true }; }
  if (!user) return { user: null, features: {}, cloud: true };
  const session = { user: { id: user.id, name: user.email, provider: 'cloud' }, features: {}, cloud: true };
  {
    let row;
    try { row = await loadPlanner(user.id); } catch (error) { return { user: null, features: {}, unavailable: true, cloudError: error.message }; }
    const doc = row ? { state: row.state, version: row.version } : { state: newPlannerState(), version: 0 };
    const pending = readPending(user.id);
    let state = doc.state;
    // Changes that never reached the server: if nobody else saved since, continue from them; otherwise ask.
    if (pending?.state && pending.baseVersion === doc.version) { state = pending.state; session.pending = { kind: 'restored', savedAt: pending.savedAt }; }
    else if (pending?.state) session.pending = { kind: 'conflict', savedAt: pending.savedAt };
    useAccount(session.user.id, state); session.document = doc;
  }
  return session;
}

// Plain-language reason for a failed save.
function reason(error) {
  if (error.status === 401) return 'You’re signed out. Sign in again and your changes will be saved.';
  if (error.network) return 'Can’t reach the account service. Check your internet connection.';
  if (error.status === 413) return 'Your planner is too large to save in one go.';
  if (!error.status || error.name === 'TimeoutError' || /fetch|network|Backend unavailable/i.test(error.message)) return 'Can’t reach the Day Compass server. Is it running?';
  return error.message;
}

export function connectAccount(model, session, status) {
  let version = session.document?.version || 0, dirty = false, sending = null, applying = false, conflict = false, failures = 0, retryTimer = null;
  const userId = session.user?.id;
  const message = text => status.textContent = text;

  // A warning that stays on screen until saving works again (the short toast is easy to miss).
  const bar = document.createElement('div'); bar.className = 'sync-warning'; bar.setAttribute('role', 'alert'); bar.hidden = true;
  bar.innerHTML = '<span class="sync-warning-icon" aria-hidden="true">!</span><div class="sync-warning-text"><strong></strong><p></p></div><div class="sync-warning-actions"></div>';
  document.body.append(bar);
  function warn(title, text, actions = []) {
    bar.querySelector('strong').textContent = title; bar.querySelector('p').textContent = text;
    const box = bar.querySelector('.sync-warning-actions'); box.replaceChildren();
    for (const [label, handler, primary] of actions) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (!primary) b.className = 'secondary'; b.addEventListener('click', handler); box.append(b); }
    bar.hidden = false;
  }
  const clearWarning = () => { bar.hidden = true; };

  function keepLocally() {
    if (!userId) return true;
    const snapshot = model.snapshot(); snapshot.undo = null;
    return writePending(userId, { state: snapshot, baseVersion: version, savedAt: Date.now() });
  }
  function scheduleRetry() {
    clearTimeout(retryTimer);
    const delay = Math.min(60000, 5000 * 2 ** Math.min(failures - 1, 4));
    retryTimer = setTimeout(() => flush().catch(() => {}), delay);
  }

  async function flush() {
    if (!session.user) return;
    if (sending) { await sending; if (dirty) return flush(); return; }
    if (conflict || !dirty) return;
    const snapshot = model.snapshot(); dirty = false;
    sending = (async () => {
      try {
        const doc = await savePlanner(snapshot, version); version = doc.version;
        failures = 0; clearTimeout(retryTimer);
        if (!dirty) { writePending(userId, null); clearWarning(); }
        message(`Saved to your account at ${new Date().toLocaleTimeString()}.`);
      } catch (error) {
        dirty = true; failures++;
        if (error.status === 409) { conflict = true; await offerConflict(); }
        else {
          warn('Not saved yet', `${reason(error)} Your changes are kept on this device and will be saved automatically.`, [['Try again', () => { failures = 0; flush().catch(() => {}); }, true]]);
          if (error.status !== 401) scheduleRetry();
        }
        throw error;
      } finally { sending = null; }
    })();
    await sending; if (dirty && !conflict && failures === 0) return flush();
  }

  // Someone else (another device or tab) saved first. Let the person choose instead of losing either version.
  async function offerConflict(savedAt) {
    const when = savedAt ? ` from ${new Date(savedAt).toLocaleString()}` : '';
    warn('Your planner changed on another device', `You have changes${when} that weren’t saved here. Which version do you want to keep?`, [
      ['Keep my changes', async () => { try { const doc = await latest(); version = doc.version; conflict = false; dirty = true; failures = 0; await flush(); } catch {} }, true],
      ['Use the saved version', async () => { try { await replace(await latest()); writePending(userId, null); clearWarning(); } catch (error) { message(reason(error)); } }]
    ]);
  }

  model.subscribe(() => {
    if (!session.user || applying) return;
    dirty = true; keepLocally(); message('Saving private account changes…');
    flush().catch(() => {});
  });
  const latest = async () => { const row = await loadPlanner(userId); return row ? { state: row.state, version: row.version } : { state: model.snapshot(), version: 0 }; };
  async function replace(doc) { version = doc.version; applying = true; try { model.replaceSnapshot(doc.state); dirty = false; conflict = false; } finally { applying = false; } message('Private planner is up to date.'); }

  // What happened before this page loaded.
  if (session.pending?.kind === 'restored') {
    dirty = true; message('Restoring changes that weren’t saved last time…');
    flush().then(() => message('Restored and saved the changes from last time.')).catch(() => {});
  } else if (session.pending?.kind === 'conflict') {
    conflict = true; offerConflict(session.pending.savedAt);
    // Show the device's unsaved version first so "Keep my changes" keeps what the person sees.
    const pending = readPending(userId);
    if (pending?.state) { applying = true; try { model.replaceSnapshot({ ...pending.state, undo: null }); } catch {} finally { applying = false; } }
  }

  setInterval(async () => {
    if (!session.user || document.hidden || conflict) return;
    try { if (dirty) await flush(); else if (!sending) { const doc = await latest(); if (!dirty && !sending && doc.version !== version && doc.version !== 0) await replace(doc); } } catch (error) { message(`Sync paused: ${reason(error)}`); }
  }, 15000);
  // Changes are kept on this device, so leaving the page is only risky if that couldn't be stored.
  window.addEventListener('beforeunload', event => { if ((dirty || sending) && !keepLocally()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('offline', () => message(session.user ? 'Offline. Changes are kept on this device and will save when the server is reachable.' : 'Offline. Local changes still save in this browser; online services are unavailable.'));
  window.addEventListener('online', () => { if (session.user) { failures = 0; flush().catch(() => {}); } else message('Online. Your local planner stays saved in this browser.'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && session.user && dirty && !conflict) { failures = 0; flush().catch(() => {}); } });
  return { flush, replace, async logout() { await flush(); await signOut(); clearAccountCache(); location.reload(); } };
}
