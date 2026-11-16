import { dayNumber } from './clock.mjs';
import { activityVisual } from './activity-visuals.mjs';

// iPhone-style reminder banners shown inside the page. They need no notification permission,
// so they work on every link (including plain http). Snoozes survive a page refresh.
const SNOOZE_KEY = 'day-compass.snoozed-reminders.v1';
const SOUND_KEY = 'day-compass.reminder-sound.v1';
const SNOOZE_MINUTES = 5;

function readJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writeJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Snooze still works until refresh. */ } }

export const reminderSound = {
  enabled: () => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } },
  set: on => { try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch {} }
};

// A soft two-note chime made in the browser (no audio file). Browsers only allow sound after
// the person has interacted with the page, so the audio is unlocked on the first tap or key press.
let audio = null;
function unlockAudio() {
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch { audio = null; }
}
addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
addEventListener('keydown', unlockAudio, { once: true, capture: true });
export function playChime() {
  if (!reminderSound.enabled() || !audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  for (const [index, frequency] of [[0, 880], [1, 1318.5]]) {
    const osc = audio.createOscillator(), gain = audio.createGain(), start = now + index * 0.16;
    osc.type = 'sine'; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
    osc.connect(gain).connect(audio.destination); osc.start(start); osc.stop(start + 0.65);
  }
}

export function initReminderBanner({ model, now, openActivity, openTasks }) {
  const host = document.createElement('div');
  host.className = 'reminder-stack'; host.setAttribute('aria-live', 'assertive'); host.setAttribute('aria-label', 'Reminders');
  // A manual popover sits in the browser's top layer, so banners appear even above an open sheet.
  const layered = typeof host.showPopover === 'function';
  if (layered) host.setAttribute('popover', 'manual');
  document.body.append(host);
  // An open sheet (modal dialog) freezes everything outside it, so banners move inside the
  // top-most open sheet while it is open and back to the page when it closes.
  const raise = () => {
    const sheet = [...document.querySelectorAll('dialog[open]')].filter(dialog => dialog.matches(':modal')).at(-1) || document.body;
    if (host.parentElement !== sheet) {
      if (layered && host.matches(':popover-open')) { try { host.hidePopover(); } catch {} }
      sheet.append(host);
      if (sheet !== document.body) sheet.addEventListener('close', () => { if (host.parentElement === sheet) { if (layered && host.matches(':popover-open')) { try { host.hidePopover(); } catch {} } document.body.append(host); if (host.children.length) raise(); } }, { once: true });
    }
    if (!layered) return;
    try { if (host.matches(':popover-open')) host.hidePopover(); host.showPopover(); } catch {}
  };
  new MutationObserver(() => { if (host.children.length) requestAnimationFrame(raise); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  const lower = () => { if (layered && !host.children.length) { try { host.hidePopover(); } catch {} } };
  const shown = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function describe(reminder) {
    if (reminder.body) return { heading: reminder.title, body: reminder.body, icon: '🔔' }; // already worded (cloud notification)
    const time = now(), stamp = dayNumber(time.date) * 1440 + time.minute;
    if (reminder.key.startsWith('deadline|')) return { heading: reminder.title.replace(/^Deadline: /, ''), body: 'Deadline reminder', icon: '⏰' };
    const left = reminder.startStamp - stamp;
    const when = left <= 0 ? 'Starting now' : left < 60 ? `Starts in ${left} min · ${reminder.start}` : left < 1440 ? `Starts in ${Math.floor(left / 60)} h${left % 60 ? ` ${left % 60} min` : ''} · ${reminder.start}` : `Starts ${reminder.start} on ${reminder.date}`;
    const item = findItem(reminder);
    return { heading: reminder.title, body: when, icon: item ? activityVisual(item).icon : '🔔' };
  }
  function findItem(reminder) {
    if (reminder.key.startsWith('deadline|')) return null;
    const id = reminder.key.split('|')[0];
    try { return model.getDay(reminder.date).commitments.find(item => item.id === id || item.taskId === id) || null; } catch { return null; }
  }
  function dismiss(key, how = 'dismiss') {
    const card = shown.get(key); if (!card) return;
    shown.delete(key);
    const gone = () => { card.remove(); lower(); };
    if (reduced.matches) { gone(); return; }
    card.dataset.leaving = how;
    card.addEventListener('animationend', gone, { once: true });
    setTimeout(gone, 500);
  }
  function snooze(reminder) {
    const list = readJSON(SNOOZE_KEY, []).filter(entry => entry.key !== reminder.key);
    list.push({ ...reminder, until: Date.now() + SNOOZE_MINUTES * 60000 });
    writeJSON(SNOOZE_KEY, list); dismiss(reminder.key, 'snooze');
  }
  function open(reminder) {
    dismiss(reminder.key);
    if (reminder.key.startsWith('deadline|')) { const id = reminder.key.split('|')[1], task = model.getTasks().find(t => t.id === id); if (task) openActivity({ date: task.date || reminder.date, item: { ...task, kind: 'task' } }); else openTasks?.(); return; }
    const item = findItem(reminder); if (item) openActivity({ date: reminder.date, item });
  }

  function show(reminder, { sound = true } = {}) {
    if (shown.has(reminder.key)) return;
    const info = describe(reminder);
    const card = document.createElement('article'); card.className = 'reminder-banner'; card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-label', `Reminder: ${info.heading}`);
    card.innerHTML = '<div class="reminder-banner-top"><span class="reminder-banner-icon" aria-hidden="true"></span><span class="reminder-banner-app">Day Compass</span><span class="reminder-banner-when">now</span></div><strong class="reminder-banner-title"></strong><p class="reminder-banner-body"></p><div class="reminder-banner-actions"><button type="button" data-act="snooze">Snooze 5 min</button><button type="button" data-act="open">Open</button><button type="button" data-act="dismiss">Dismiss</button></div>';
    card.querySelector('.reminder-banner-icon').textContent = info.icon;
    card.querySelector('.reminder-banner-title').textContent = info.heading;
    card.querySelector('.reminder-banner-body').textContent = info.body;
    card.querySelector('[data-act=snooze]').addEventListener('click', () => snooze(reminder));
    card.querySelector('[data-act=open]').addEventListener('click', () => open(reminder));
    card.querySelector('[data-act=dismiss]').addEventListener('click', () => dismiss(reminder.key));
    // Swipe up (or sideways) to dismiss, like on a phone.
    let startY = null, startX = null;
    card.addEventListener('pointerdown', event => { if (event.target.closest('button')) return; startY = event.clientY; startX = event.clientX; card.setPointerCapture(event.pointerId); card.style.transition = 'none'; });
    card.addEventListener('pointermove', event => { if (startY === null) return; const dy = Math.min(0, event.clientY - startY), dx = event.clientX - startX; card.style.transform = `translate(${dx}px, ${dy}px)`; card.style.opacity = String(1 - Math.min(0.7, (Math.abs(dx) + Math.abs(dy)) / 260)); });
    const end = event => { if (startY === null) return; const dy = event.clientY - startY, dx = event.clientX - startX; startY = null; card.style.transition = ''; if (dy < -40 || Math.abs(dx) > 90) { card.style.transform = ''; card.style.opacity = ''; dismiss(reminder.key, dy < -40 ? 'dismiss' : 'swipe'); } else { card.style.transform = ''; card.style.opacity = ''; } };
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
    host.prepend(card); shown.set(reminder.key, card); raise();
    while (host.children.length > 3) { const last = host.lastElementChild; shown.forEach((value, key) => { if (value === last) shown.delete(key); }); last.remove(); }
    if (sound) playChime();
  }

  // Bring back snoozed reminders whose time has come; drop ones for events that no longer exist.
  function tick(validKeys) {
    const list = readJSON(SNOOZE_KEY, []), keep = [];
    for (const entry of list) {
      if (validKeys && !validKeys.has(entry.key) && !entry.key.startsWith('test|')) continue;
      if (entry.until <= Date.now()) { const { until, ...reminder } = entry; show(reminder); } else keep.push(entry);
    }
    if (keep.length !== list.length) writeJSON(SNOOZE_KEY, keep);
  }
  function forget(validKeys) { for (const key of [...shown.keys()]) if (!validKeys.has(key) && !key.startsWith('test|')) dismiss(key); }
  function test() {
    const time = now(), stamp = dayNumber(time.date) * 1440 + time.minute;
    const startStamp = stamp + 10, start = `${String(Math.floor(((time.minute + 10) % 1440) / 60)).padStart(2, '0')}:${String((time.minute + 10) % 60).padStart(2, '0')}`;
    show({ key: `test|${Date.now()}`, title: 'Test reminder', date: time.date, start, startStamp, due: stamp, lead: 10 });
  }
  return { show, dismiss, tick, forget, test };
}
