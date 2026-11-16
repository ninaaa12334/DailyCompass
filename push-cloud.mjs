import { wallToInstant } from './zoned-time.mjs';
import { zonedNow, dateLabel } from './clock.mjs';
import { addDays } from './calendar-view.mjs';
import { isQuiet } from './reminders.mjs';
import { deadlineReminders } from './deadline-reminders.mjs';

// Real notifications that arrive even when Day Compass is closed, on any device that turns them on.
// The free Cloudflare push service (push-worker/) stores this device's push address and its upcoming
// reminder times + titles, and sends each one when it's due. Nothing else from the planner leaves the device.
export const PUSH_SERVICE = 'https://day-compass-push.day-compass-push.workers.dev';
const STATE_KEY = 'day-compass.cloud-push.v1';
const DAYS_AHEAD = 60, MAX = 1000;

const readState = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY)) || null; } catch { return null; } };
const writeState = value => { try { value ? localStorage.setItem(STATE_KEY, JSON.stringify(value)) : localStorage.removeItem(STATE_KEY); } catch {} };
const decodeKey = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)), c => c.charCodeAt(0));
const sameKey = (a, b) => a && b && a.byteLength === b.byteLength && new Uint8Array(a).every((v, i) => v === b[i]);

async function call(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${PUSH_SERVICE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `The notification service answered ${response.status}.`), { status: response.status });
  return data;
}

// Can this browser receive notifications while the site is closed? If not, say why in plain words.
export function pushSupport() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!window.isSecureContext) return { ok: false, reason: 'Notifications need a secure (https) link. Open https://daily-compass1.vercel.app to turn them on.' };
  if (ios && !standalone) return { ok: false, reason: 'On iPhone/iPad: tap Share → Add to Home Screen, open Day Compass from the Home Screen, then turn this on.' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { ok: false, reason: 'This browser can’t receive notifications. Try Chrome, Edge, Firefox or Safari.' };
  if (Notification.permission === 'denied') return { ok: false, reason: 'Notifications are blocked for this site. Allow them in the browser’s site settings (the icon left of the address), then try again.' };
  return { ok: true };
}
export const pushEnabled = () => Boolean(readState()?.deviceId);

// The reminders this device should get over the next 60 days, as exact moments in time.
export function collectReminders(model, now = Date.now()) {
  const settings = model.getSettings(), zone = settings.timeZone, today = zonedNow(new Date(now), zone).date, list = [];
  const add = (key, due, title, body) => { if (due < now - 60000) return; if (isQuiet(zonedNow(new Date(due), zone).minute, settings)) return; list.push({ key, due, title, body }); };
  for (let offset = 0; offset < DAYS_AHEAD; offset++) {
    const date = addDays(today, offset);
    for (const item of model.getDay(date).commitments) {
      if (item.kind === 'break' || item.completed || item.reminder === 'off') continue;
      const lead = item.reminder === 'default' || item.reminder === undefined ? settings.reminderMinutes : Number(item.reminder);
      let start; try { start = wallToInstant(date, item.start, zone, item.dstChoice || 'earlier'); } catch { continue; }
      const when = lead === 0 ? `Starting now · ${item.start}` : `Starts at ${item.start} · in ${lead >= 60 && lead % 60 === 0 ? `${lead / 60} h` : `${lead} min`}`;
      add(`${item.id}|${date}|${item.start}|${lead}`, start - lead * 60000, item.title, offset > 0 && lead >= 1440 ? `${dateLabel(date)} at ${item.start}` : when);
    }
  }
  for (const r of deadlineReminders(model.getPlanning())) {
    let due; try { due = wallToInstant(r.date, r.start, zone, 'earlier'); } catch { continue; }
    add(r.key, due, r.title.replace(/^Deadline: /, ''), 'Deadline reminder');
  }
  return list.sort((a, b) => a.due - b.due).slice(0, MAX);
}

export async function enablePush(model) {
  const support = pushSupport(); if (!support.ok) throw new Error(support.reason);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications weren’t allowed. You can allow them later in the browser’s site settings.');
  const registration = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
  const { publicKey } = await call('/vapid'), key = decodeKey(publicKey);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options?.applicationServerKey, key)) { await subscription.unsubscribe(); subscription = null; }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const device = await call('/devices', { method: 'POST', body: { subscription: subscription.toJSON() } });
  writeState({ deviceId: device.deviceId, token: device.token, since: Date.now() });
  return syncPush(model);
}

export async function disablePush() {
  const state = readState(); writeState(null);
  if (state) { try { await call(`/devices/${state.deviceId}`, { method: 'DELETE', token: state.token }); } catch {} }
  try { const registration = await navigator.serviceWorker?.getRegistration(); await (await registration?.pushManager.getSubscription())?.unsubscribe(); } catch {}
}

export async function testPush() {
  const state = readState(); if (!state) throw new Error('Turn notifications on first.');
  try { return await call(`/devices/${state.deviceId}/test`, { method: 'POST', token: state.token }); }
  catch (error) { if (error.status === 401 || error.status === 410) writeState(null); throw error; }
}

let lastSent = '';
export async function syncPush(model) {
  const state = readState(); if (!state) return { saved: 0 };
  const reminders = collectReminders(model), signature = JSON.stringify(reminders);
  if (signature === lastSent) return { saved: reminders.length, unchanged: true };
  try { const result = await call(`/devices/${state.deviceId}/reminders`, { method: 'PUT', token: state.token, body: { reminders } }); lastSent = signature; return result; }
  catch (error) { if (error.status === 401) writeState(null); throw error; }
}

// Keeps the service's copy up to date: shortly after any change, when the page opens, and every few hours.
export function startPushSync(model, onStatus = () => {}) {
  let timer;
  const run = () => { clearTimeout(timer); timer = setTimeout(() => { if (pushEnabled()) syncPush(model).then(r => onStatus(r), e => onStatus({ error: e.message })); }, 2500); };
  model.subscribe(run); run();
  setInterval(() => { lastSent = ''; run(); }, 6 * 3600000);
  return run;
}
