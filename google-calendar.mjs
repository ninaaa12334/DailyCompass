import { cloud } from './cloud.mjs';
import { PUSH_SERVICE } from './push-cloud.mjs';
import { zonedNow, dateLabel } from './clock.mjs';
import { addDays, timeLabel } from './calendar-view.mjs';

// Google Calendar (read-only) for signed-in accounts. The Cloudflare service holds the Google
// connection; this file shows the controls and copies events into the planner as busy time.
const node = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
const PAST_DAYS = 7, FUTURE_DAYS = 120, AUTO_SYNC = 30 * 60000;

async function call(path, method = 'GET') {
  const sb = await cloud(), { data } = await sb.auth.getSession(), token = data.session?.access_token;
  if (!token) throw Object.assign(new Error('Please sign in again.'), { status: 401 });
  const response = await fetch(`${PUSH_SERVICE}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || `Google Calendar answered ${response.status}.`), { status: response.status });
  return body;
}

// Google events → the planner's imported-event format (shown as read-only busy time).
export function toImports(events, timeZone) {
  const items = [];
  for (const e of events) {
    const a = zonedNow(new Date(e.start), timeZone), b = zonedNow(new Date(e.end), timeZone);
    const end = b.date > a.date ? '24:00' : timeLabel(b.minute);
    if (end !== '24:00' && b.minute <= a.minute) continue;
    items.push({ id: `gcal-${e.calendarId}-${e.id}`, googleId: e.id, calendarId: e.calendarId, title: e.title, date: a.date, start: timeLabel(a.minute), end, sourceStart: e.start, sourceEnd: e.end });
  }
  return items;
}

export function initGoogleCalendar({ model, account, feedback }) {
  const root = node('div', undefined, 'gcal');
  const status = node('p', '', 'gcal-status'), list = node('div', undefined, 'gcal-list'), actions = node('div', undefined, 'gcal-actions'), note = node('p', '', 'fine-print gcal-note');
  root.append(status, list, actions, note);
  let state = { connected: false, email: '', calendars: [], lastSync: 0, busy: false, error: '' };
  const button = (label, handler, primary) => { const b = node('button', label, primary ? 'hub-primary' : 'secondary'); b.type = 'button'; b.addEventListener('click', handler); return b; };

  function chosen() { const ids = model.getSettings().googleCalendars; return Array.isArray(ids) && ids.length ? ids : state.calendars.filter(c => c.primary).map(c => c.id); }
  function render() {
    list.replaceChildren(); actions.replaceChildren(); root.querySelectorAll('.gcal-details').forEach(el => el.remove());
    if (!account.user) { status.textContent = 'Sign in to connect your Google Calendar.'; note.textContent = ''; return; }
    if (state.busy) { status.textContent = 'Working…'; }
    else if (state.error) status.textContent = state.error;
    else if (!state.connected) status.textContent = 'Show your Google Calendar events in Day Compass, so you can plan around them.';
    else status.textContent = `Connected to ${state.email || 'your Google account'}.${state.lastSync ? ` Last updated ${new Date(state.lastSync).toLocaleTimeString()}.` : ''}`;
    if (!state.connected) {
      actions.append(button('Connect Google Calendar', connect, true));
      note.textContent = 'Read-only: Day Compass never changes your Google Calendar. Google may say “Google hasn’t verified this app” — choose Advanced → Go to Day Compass (unsafe) to continue. That only means Google hasn’t reviewed this small app.';
      return;
    }
    const picked = new Set(chosen());
    if (state.calendars.length) {
      list.append(node('strong', 'Show these calendars'));
      for (const c of state.calendars) {
        const label = node('label', undefined, 'gcal-calendar'), box = node('input'); box.type = 'checkbox'; box.checked = picked.has(c.id);
        const dot = node('span', undefined, 'gcal-dot'); dot.style.background = c.color || 'var(--accent)';
        box.addEventListener('change', () => { const next = new Set(chosen()); box.checked ? next.add(c.id) : next.delete(c.id); try { model.saveSettings({ googleCalendars: [...next] }); } catch (e) { feedback(e.message); } sync(); });
        label.append(box, dot, node('span', c.name + (c.primary ? ' (main)' : '')));
        list.append(label);
      }
    }
    // What the last update brought in, so it's clear why something is or isn't shown.
    if (state.stats && Object.keys(state.stats).length) {
      const box = node('details', undefined, 'gcal-details'); box.append(node('summary', 'What was brought in'));
      for (const [id, s] of Object.entries(state.stats)) {
        const name = state.calendars.find(c => c.id === id)?.name || id;
        const skipped = [s.allDay && `${s.allDay} all-day`, s.cancelled && `${s.cancelled} cancelled`, s.declined && `${s.declined} you declined`].filter(Boolean).join(', ');
        box.append(node('p', `${name}: ${s.added} event${s.added === 1 ? '' : 's'} added${skipped ? ` (skipped ${skipped})` : ''}.`));
      }
      const zone = model.getSettings().timeZone, now = Date.now();
      const next = (model.snapshot().imports || []).filter(i => Date.parse(i.sourceStart) > now).sort((a, b) => Date.parse(a.sourceStart) - Date.parse(b.sourceStart)).slice(0, 8);
      if (next.length) { const ul = node('ul'); for (const i of next) ul.append(node('li', `${dateLabel(i.date)} ${i.start}–${i.end} · ${i.title}`)); box.append(node('strong', 'Next events'), ul); }
      else box.append(node('p', 'No upcoming Google events were found in the chosen calendars.'));
      list.after(box);
    }
    actions.append(button('Update now', () => sync(true), true), button('Disconnect', disconnect));
    note.textContent = `Events from the last ${PAST_DAYS} days to ${FUTURE_DAYS} days ahead appear as busy time in your calendar. Edit them in Google Calendar; changes show up here within about 30 minutes, or press Update now.`;
  }

  async function refreshStatus() {
    if (!account.user) return render();
    try { const s = await call('/google/status'); state.connected = s.connected; state.email = s.email; state.error = ''; if (s.connected && !state.calendars.length) state.calendars = (await call('/google/calendars')).calendars; }
    catch (e) { state.error = e.message; }
    render();
  }
  async function connect() {
    state.busy = true; render();
    try { const { url } = await call('/google/start', 'POST'); location.assign(url); }
    catch (e) { state.busy = false; state.error = e.message; render(); }
  }
  async function disconnect() {
    if (!confirm('Disconnect Google Calendar? Its events will be removed from Day Compass.')) return;
    state.busy = true; render();
    try { await call('/google/link', 'DELETE'); model.setImports([]); state = { ...state, connected: false, email: '', calendars: [], busy: false, error: '' }; feedback('Google Calendar disconnected.'); }
    catch (e) { state.busy = false; state.error = e.message; }
    render();
  }
  let syncing = null;
  async function sync(loud = false) {
    if (!account.user || !state.connected || syncing) return syncing;
    syncing = (async () => {
      const ids = chosen(), zone = model.getSettings().timeZone, today = zonedNow(new Date(), zone).date;
      try {
        let items = [];
        if (ids.length) {
          const query = new URLSearchParams({ calendars: ids.join(','), timeMin: new Date(`${addDays(today, -PAST_DAYS)}T00:00:00Z`).toISOString(), timeMax: new Date(`${addDays(today, FUTURE_DAYS)}T23:59:59Z`).toISOString() });
          const result = await call(`/google/events?${query}`);
          items = toImports(result.events, zone); state.stats = result.stats || {};
        }
        const current = JSON.stringify(model.snapshot().imports || []);
        if (JSON.stringify(items) !== current) model.setImports(items);
        state.lastSync = Date.now(); state.error = '';
        if (loud) feedback(`Google Calendar updated: ${items.length} event${items.length === 1 ? '' : 's'}.`);
      } catch (e) { state.error = e.message; if (e.status === 401 || e.status === 404) state.connected = false; if (loud) feedback(e.message); }
      finally { syncing = null; render(); }
    })();
    return syncing;
  }

  // Coming back from Google's permission screen.
  const params = new URLSearchParams(location.search), result = params.get('calendar');
  if (result) {
    params.delete('calendar'); const reason = params.get('reason'); params.delete('reason');
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
    if (result === 'error') feedback(reason || 'Google Calendar didn’t connect. Please try again.');
  }
  refreshStatus().then(async () => {
    if (!state.connected) return;
    if (result === 'connected') { feedback('Google Calendar connected. Adding your events…'); await sync(true); }
    else sync();
  });
  setInterval(() => { if (!document.hidden) sync(); }, AUTO_SYNC);
  render();
  return { element: root, onOpen: refreshStatus, openAfterConnect: result === 'connected' || result === 'error', isConnected: () => state.connected };
}
