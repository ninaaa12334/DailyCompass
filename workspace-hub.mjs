import { newId } from './uuid.mjs';
import { parseSchedule, scheduleInputs, describeSchedule } from './schedule-request.mjs';
import { interpretPlanningRequest } from './planning-request.mjs';
import { reminderSound } from './reminder-banner.mjs';
import { buildCalendarFile, downloadCalendarFile } from './ics-export.mjs';
import { pushSupport, pushEnabled, enablePush, disablePush, testPush, startPushSync } from './push-cloud.mjs';
import { initGoogleCalendar } from './google-calendar.mjs';
import { holidayControls } from './holidays.mjs';
import { isDarkMode, toggleDarkMode } from './theme-ui.mjs';
import { dateLabel } from './clock.mjs';

// Calendar-centred workspace: the calendar fills the middle of the screen and every other
// feature is a tile around it that opens in a sheet. Existing widgets are moved (not copied),
// so all their behaviour and event handlers keep working.
const node = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
const ICONS = {
  tasks: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/></svg>',
  day: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3.5 13.8 9 19.5 11 13.8 13 12 18.5 10.2 13 4.5 11 10.2 9Z"/><path d="M19 3v3M17.5 4.5h3"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M5 17.5V7a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 7v6a2.5 2.5 0 0 1-2.5 2.5H9Z"/><path d="M9 9.5h6M9 12h4"/></svg>',
  palette: '<svg viewBox="0 0 24 24"><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.8-.9 1.4-1.9-.5-1.1.2-2.3 1.4-2.3H17a3.5 3.5 0 0 0 3.5-3.5c0-5.2-3.8-9.3-8.5-9.3Z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="7.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/></svg>',
  // Cog outline (Feather "settings" icon, MIT licence).
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>'
};
const icon = name => { const span = node('span', undefined, 'hub-icon'); span.setAttribute('aria-hidden', 'true'); span.innerHTML = ICONS[name]; return span; };

export function initWorkspaceHub({ model, now, feedback, account, banner }) {
  const $ = selector => document.querySelector(selector);
  const main = $('#planner');
  if (!main || !$('.calendar-widget')) return null;
  // Moving elements resets scroll positions; remember where the calendar was showing.
  const scroller = $('#week-view'), scrollTop = scroller?.scrollTop || 0;
  document.body.classList.add('hub-layout');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- Sheets (iOS-style) ----------
  const sheets = new Map();
  function sheet(key, title, content, onOpen) {
    const dialog = node('dialog', undefined, 'hub-sheet'); dialog.id = `sheet-${key}`; dialog.setAttribute('aria-labelledby', `sheet-${key}-title`);
    const head = node('div', undefined, 'hub-sheet-head'), grabber = node('span', undefined, 'hub-sheet-grabber'), heading = node('h2', title), done = node('button', 'Done', 'hub-sheet-done');
    grabber.setAttribute('aria-hidden', 'true'); heading.id = `sheet-${key}-title`; done.type = 'button';
    done.addEventListener('click', () => closeSheet(dialog));
    head.append(grabber, heading, done);
    const body = node('div', undefined, 'hub-sheet-body'); body.append(...[content].flat());
    dialog.append(head, body); document.body.append(dialog);
    dialog.addEventListener('click', event => { if (event.target === dialog) closeSheet(dialog); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeSheet(dialog); });
    sheets.set(key, { dialog, onOpen });
    return dialog;
  }
  function openSheet(key) {
    const entry = sheets.get(key); if (!entry) return;
    for (const [other, { dialog }] of sheets) if (other !== key && dialog.open) dialog.close();
    if (!entry.dialog.open) { entry.dialog.classList.remove('closing'); entry.dialog.showModal(); }
    entry.onOpen?.();
  }
  function closeSheet(dialog) {
    if (!dialog.open || dialog.classList.contains('closing')) return;
    if (reduced.matches) { dialog.close(); return; }
    dialog.classList.add('closing');
    setTimeout(() => { dialog.classList.remove('closing'); dialog.close(); }, 220);
  }

  // ---------- Top bar ----------
  const top = node('header', undefined, 'hub-top');
  const brand = node('a', undefined, 'hub-brand'); brand.href = 'index.html'; brand.setAttribute('aria-label', 'Day Compass home');
  brand.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17"/><path d="m31 13-5 13-13 9 9-15Z"/></svg>';
  const titles = node('div', undefined, 'hub-titles');
  const today = node('strong', '', 'hub-today'), mode = node('small', '', 'hub-mode');
  titles.append(today, mode);
  const ask = node('form', undefined, 'hub-ask'); ask.setAttribute('role', 'search'); ask.setAttribute('aria-label', 'Add to your calendar');
  const askIcon = icon('spark'); askIcon.classList.add('hub-ask-spark');
  const askInput = node('input'); askInput.name = 'request'; askInput.autocomplete = 'off'; askInput.maxLength = 300;
  askInput.placeholder = 'Ask: “school every weekday 8–2 until June 20”'; askInput.setAttribute('aria-label', 'Tell Day Compass what to add to your calendar');
  const askSend = node('button', undefined, 'hub-ask-send'); askSend.type = 'submit'; askSend.setAttribute('aria-label', 'Add to calendar'); askSend.append(icon('send'));
  ask.append(askIcon, askInput, askSend);
  const actions = node('div', undefined, 'hub-actions');
  const iconButton = (name, label, handler) => { const b = node('button', undefined, 'hub-icon-button'); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.append(icon(name)); b.addEventListener('click', handler); return b; };
  const undo = $('#undo-action');
  const undoButton = iconButton('undo', 'Undo last change', () => undo.click());
  const syncUndo = () => { undoButton.disabled = undo.disabled; };
  new MutationObserver(syncUndo).observe(undo, { attributes: true, attributeFilter: ['disabled'] }); syncUndo();
  // Dark mode on/off for whichever theme is chosen.
  const darkButton = iconButton('moon', 'Dark mode', () => { try { toggleDarkMode(); } catch { feedback('Couldn’t change dark mode. Check browser storage permissions.'); } });
  const syncDarkButton = () => { const on = isDarkMode(); darkButton.replaceChildren(icon(on ? 'sun' : 'moon')); darkButton.setAttribute('aria-label', on ? 'Light mode' : 'Dark mode'); darkButton.title = on ? 'Light mode' : 'Dark mode'; darkButton.setAttribute('aria-pressed', String(on)); };
  document.addEventListener('appearance-changed', syncDarkButton); syncDarkButton();
  new MutationObserver(syncDarkButton).observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
  actions.append(undoButton, darkButton, iconButton('palette', 'Themes', () => $('[data-open-appearance]').click()), iconButton('gear', 'Settings', () => openSheet('settings')));
  top.append(brand, titles, ask, actions);

  // ---------- Rails ----------
  const left = node('aside', undefined, 'hub-rail hub-left'); left.setAttribute('aria-label', 'Your day at a glance');
  const right = node('aside', undefined, 'hub-rail hub-right'); right.setAttribute('aria-label', 'More tools');
  const center = node('section', undefined, 'hub-center');
  const tile = (key, iconName, label, onClick) => {
    const b = node('button', undefined, `hub-tile hub-tile-${key}`); b.type = 'button'; b.setAttribute('aria-haspopup', 'dialog');
    const text = node('span', undefined, 'hub-tile-text'), name = node('strong', label), detail = node('small', '', 'hub-tile-detail');
    text.append(name, detail); b.append(icon(iconName), text, node('span', '›', 'hub-tile-chevron'));
    b.addEventListener('click', onClick); return { button: b, detail };
  };

  // Productivity: reuse the existing ring button + dialog.
  const productivity = $('#productivity-toggle'); productivity?.classList.add('hub-tile');
  $('#productivity-dialog')?.classList.add('hub-sheet', 'hub-sheet-legacy');
  const nowWidget = $('.now-widget'), freeWidget = $('.free-widget');
  nowWidget?.classList.add('hub-card'); freeWidget?.classList.add('hub-card');

  const tasksWidget = $('.tasks-widget');
  const tasksTile = tile('tasks', 'tasks', 'Tasks', () => openSheet('tasks'));
  const taskPreview = node('ul', undefined, 'hub-task-preview'); tasksTile.button.querySelector('.hub-tile-text').append(taskPreview);
  sheet('tasks', 'Tasks & deadlines', tasksWidget, () => setTimeout(() => $('#task-title')?.focus(), 60));

  const timeline = $('.timeline-widget');
  const dayTile = tile('day', 'day', 'Your day', () => openSheet('day'));
  sheet('day', 'Your day', timeline);
  $('.day-details')?.remove();

  const remindersWidget = $('.reminders-widget');
  const remindersTile = tile('reminders', 'bell', 'Reminders', () => openSheet('reminders'));
  // One switch does everything: the in-page banner and real notifications on this device.
  const controls = node('div', undefined, 'reminder-controls');
  controls.innerHTML = `
    <label class="hub-switch"><span><strong>Reminders</strong><small data-reminder-status></small></span><input type="checkbox" role="switch" data-reminder="on"></label>
    <label class="hub-row"><span><strong>Remind me</strong></span><select data-reminder="lead"><option value="0">When it starts</option><option value="5">5 min before</option><option value="10">10 min before</option><option value="15">15 min before</option><option value="30">30 min before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></label>
    <label class="hub-switch"><span><strong>Sound</strong></span><input type="checkbox" role="switch" data-reminder="sound"></label>
    <details class="reminder-more"><summary>More options</summary><div class="reminder-more-body">
      <button type="button" class="secondary" data-reminder="test">Send a test reminder</button>
      <button type="button" class="secondary" data-reminder="more">Quiet hours &amp; other settings</button>
      <button type="button" class="secondary" data-reminder="export">Add my events to my phone’s calendar</button>
    </div></details>`;
  const control = name => controls.querySelector(`[data-reminder=${name}]`);
  const leadText = minutes => minutes === 0 ? 'when each event starts' : minutes === 1440 ? '1 day before each event' : minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'} before each event` : `${minutes} min before each event`;
  let note = '';
  function syncControls() {
    const settings = model.getSettings(), on = Boolean(settings.remindersEnabled), support = pushSupport();
    control('on').checked = on;
    control('sound').checked = reminderSound.enabled();
    const lead = String(settings.reminderMinutes);
    if (![...control('lead').options].some(option => option.value === lead)) control('lead').append(Object.assign(node('option', `${lead} min before`), { value: lead }));
    control('lead').value = lead;
    control('lead').closest('label').hidden = !on; control('sound').closest('label').hidden = !on;
    controls.querySelector('[data-reminder-status]').textContent = note || (!on ? 'Off'
      : pushEnabled() ? `You’ll get a notification ${leadText(settings.reminderMinutes)}, even when Day Compass is closed.`
      : support.ok ? `On while Day Compass is open, ${leadText(settings.reminderMinutes)}.`
      : `On while Day Compass is open. ${support.reason}`);
  }
  control('on').addEventListener('change', async event => {
    const turnOn = event.target.checked; event.target.disabled = true; note = '';
    try {
      model.saveSettings({ remindersEnabled: turnOn });
      if (turnOn && pushSupport().ok && !pushEnabled()) {
        note = 'Turning on… allow notifications if your browser asks.'; syncControls();
        try { await enablePush(model); note = ''; } catch { note = 'Notifications weren’t allowed, so reminders only show while Day Compass is open.'; }
      }
      if (!turnOn && pushEnabled()) await disablePush();
      feedback(turnOn ? 'Reminders are on.' : 'Reminders are off.');
    } catch (problem) { feedback(problem.message); }
    event.target.disabled = false; syncControls();
  });
  control('sound').addEventListener('change', event => { reminderSound.set(event.target.checked); });
  control('lead').addEventListener('change', event => { try { model.saveSettings({ reminderMinutes: Number(event.target.value) }); } catch (problem) { feedback(problem.message); syncControls(); } });
  control('test').addEventListener('click', async event => {
    if (!pushEnabled()) { banner?.test(); return; }
    event.target.disabled = true;
    try { const result = await testPush(); feedback(result.sent ? 'Test sent. Switch to another tab to see it as a notification.' : 'The notification didn’t go through. Try turning Reminders off and on.'); }
    catch (problem) { feedback(problem.message); }
    event.target.disabled = false;
  });
  control('more').addEventListener('click', () => $('#open-reminder-settings')?.click());
  control('export').addEventListener('click', () => {
    try {
      const { text, count } = buildCalendarFile(model.snapshot(), { fromDate: now().date });
      if (!count) { feedback('There are no upcoming events to add yet.'); return; }
      downloadCalendarFile(text);
      feedback(`Saved a calendar file with ${count} event${count === 1 ? '' : 's'}. Open it on your phone to add them with their reminders.`);
    } catch (problem) { feedback(`Could not create the calendar file: ${problem.message}`); }
  });
  startPushSync(model, () => syncControls());
  remindersWidget.prepend(controls);
  sheet('reminders', 'Reminders', remindersWidget, syncControls);
  model.subscribe(syncControls); syncControls();

  const aiPanel = $('#ai-panel');
  const aiTile = tile('ai', 'spark', 'Plan with AI', () => openSheet('ai'));
  sheet('ai', 'Plan with AI', aiPanel);

  const settingsPanel = $('#settings-panel');
  sheet('settings', 'Settings', settingsPanel);

  const upcoming = $('.workspace-upcoming'); upcoming?.classList.add('hub-card', 'hub-upcoming');
  const helper = $('.task-chat-launch');
  // Themes live in the 🎨 button at the top, so there's no tile for them here.
  // Google Calendar (read-only), connected with the person's Google account.
  const gcal = initGoogleCalendar({ model, account, feedback });
  const gcalTile = tile('gcal', 'day', 'Calendars & holidays', () => openSheet('gcal'));
  gcalTile.detail.textContent = 'Google Calendar, public holidays';
  // Like Google's "Other calendars": public holidays can be shown or hidden here (and in Settings).
  const holidayBox = node('div', undefined, 'gcal-holidays'); holidayBox.append(node('strong', 'Holidays'), holidayControls({ model, feedback }));
  sheet('gcal', 'Calendars', [gcal.element, holidayBox], gcal.onOpen);

  left.append(...[productivity, nowWidget, freeWidget, tasksTile.button].filter(Boolean));
  right.append(...[upcoming, dayTile.button, remindersTile.button, gcalTile.button, aiTile.button, helper].filter(Boolean));
  if (helper) { helper.classList.add('hub-tile', 'hub-tile-helper'); helper.replaceChildren(icon('chat'), Object.assign(node('span', undefined, 'hub-tile-text'), { innerHTML: '<strong>Task helper</strong><small class="hub-tile-detail">Turn a thought into a task</small>' }), node('span', '›', 'hub-tile-chevron')); }
  aiTile.detail.textContent = 'Suggestions for a day';
  center.append($('.calendar-widget'));

  // Phone: a swipeable row of chips gives quick access to the same tiles.
  const chips = node('nav', undefined, 'hub-chips'); chips.setAttribute('aria-label', 'Quick access');
  const chip = (label, handler, id) => { const b = node('button', label, 'hub-chip'); b.type = 'button'; if (id) b.id = id; b.addEventListener('click', handler); chips.append(b); return b; };
  const chipProgress = chip('0%', () => productivity?.click(), 'hub-chip-progress');
  const chipTasks = chip('Tasks', () => openSheet('tasks'));
  chip('Your day', () => openSheet('day'));
  chip('Upcoming', () => openSheet('upcoming'));
  chip('Reminders', () => openSheet('reminders'));
  chip('Google Calendar', () => openSheet('gcal'));
  chip('Plan with AI', () => openSheet('ai'));
  if (helper) chip('Task helper', () => helper.click());
  // On phones the upcoming list lives in a sheet; on wider screens it stays in the right rail.
  const upcomingHome = node('div'); sheet('upcoming', 'Upcoming', upcomingHome, () => { if (matchMedia('(max-width: 1199px)').matches) upcomingHome.append(upcoming); });
  sheets.get('upcoming').dialog.addEventListener('close', () => right.prepend(upcoming));

  const hub = node('div', undefined, 'hub');
  hub.append(top, chips, left, center, right);
  main.append(hub);
  if (scroller) scroller.scrollTop = scrollTop;

  // Status messages (saving, sync, errors) appear as a small toast instead of taking up space.
  const toast = node('div', undefined, 'hub-toast'); toast.setAttribute('aria-live', 'polite');
  for (const id of ['#planner-feedback', '#sync-status']) { const el = $(id); if (el) toast.append(el); }
  document.body.append(toast);
  let toastTimer;
  new MutationObserver(() => {
    const text = [...toast.children].map(el => el.textContent.trim()).filter(Boolean).join(' · ');
    toast.dataset.show = text ? 'true' : 'false'; clearTimeout(toastTimer);
    if (text) toastTimer = setTimeout(() => { toast.dataset.show = 'false'; }, 4200);
  }).observe(toast, { subtree: true, childList: true, characterData: true });

  // The old tab code hides whole sections; in this layout everything stays mounted.
  for (const el of [$('.dashboard-grid'), remindersWidget, aiPanel, settingsPanel, $('.workspace-summary')]) {
    if (!el) continue;
    el.hidden = false;
    new MutationObserver(() => { if (el.hidden) el.hidden = false; }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
  }
  document.querySelectorAll('.assistant-tabs [data-panel]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.panel === 'settings') openSheet('settings');
    else if (button.dataset.panel === 'ai') openSheet('ai');
  }));
  sheets.get('settings').onOpen = () => { const tab = document.querySelector('.assistant-tabs [data-panel=settings]'); if (tab && !sheets.get('settings').busy) { sheets.get('settings').busy = true; tab.click(); sheets.get('settings').busy = false; } };

  // ---------- Ask bar: add events to the calendar from a sentence ----------
  const review = node('div', undefined, 'hub-review');
  const reviewDialog = sheet('add', 'Add to calendar', review);
  const aiConfigured = Boolean(account?.user && account?.features?.ai);
  let pending = [], lastText = '', askedFrom = 'bar';
  function showPlans(plans, text) {
    pending = plans.map(plan => ({ ...plan })); review.replaceChildren();
    const full = date => dateLabel(date, { year: 'numeric' });
    const title = node('input', undefined, 'hub-review-title'); title.value = plans[0].title; title.maxLength = 120; title.setAttribute('aria-label', 'Event title');
    title.addEventListener('input', () => { for (const plan of pending) plan.title = title.value.trim() || plans[0].title; });
    const card = node('div', undefined, 'hub-review-card'); card.append(title);
    for (const plan of plans) {
      const { dayText } = describeSchedule(plan);
      const rows = node('dl', undefined, 'hub-review-rows');
      const row = (label, value) => { rows.append(node('dt', label), node('dd', value)); };
      if (dayText) row(plans.length > 1 ? 'Days' : 'Repeats', dayText.replace(/^Every /, plans.length > 1 ? '' : 'Every '));
      row('Time', `${plan.start} – ${plan.end}${plan.guessedLength ? ' (1 hour, change in the event)' : ''}`);
      if (!plan.recurring) row('Date', full(plan.from));
      card.append(rows);
    }
    const dates = plans.flatMap(plan => plan.dates).sort();
    const info = node('dl', undefined, 'hub-review-rows hub-review-shared');
    if (plans[0].recurring) info.append(node('dt', 'Dates'), node('dd', `${full(dates[0])} → ${full(dates.at(-1))}`));
    info.append(node('dt', 'Category'), node('dd', plans[0].category));
    card.append(info);
    // Fixed events can't overlap, so find days where something is already booked at that time.
    const toMin = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    const clashes = [];
    for (const plan of plans) for (const date of plan.dates) {
      const hit = model.getDay(date).commitments.find(item => !item.sourceRoutine && !item.sourceImport && toMin(item.start) < toMin(plan.end) && toMin(item.end) > toMin(plan.start));
      if (hit) clashes.push({ date, hit });
    }
    const clashDates = new Set(clashes.map(clash => clash.date));
    const count = dates.length - clashDates.size;
    const note = node('p', count === 1 ? 'Adds one event to your calendar.' : `Adds ${count} events to your calendar.`, 'hub-review-note');
    let warning = null;
    if (clashes.length) {
      warning = node('div', undefined, 'hub-review-clash');
      warning.append(node('strong', `${clashDates.size} day${clashDates.size === 1 ? '' : 's'} already ${clashDates.size === 1 ? 'has' : 'have'} something at this time`));
      const list = node('ul');
      for (const { date, hit } of clashes.slice(0, 3)) list.append(node('li', `${dateLabel(date)} · ${hit.title} ${hit.start}–${hit.end}`));
      if (clashes.length > 3) list.append(node('li', `and ${clashes.length - 3} more`));
      warning.append(list, node('p', count ? 'Those days will be skipped. Everything else is added as normal.' : 'Every day clashes, so nothing can be added. Try a different time.'));
    }
    if (plans.some(plan => plan.capped)) note.textContent += ' Repeats are limited to three years, so it stops on the last date shown.';
    const error = node('p', '', 'hub-review-error'); error.setAttribute('role', 'alert');
    const add = node('button', count === 1 ? 'Add event' : `Add ${count} events${clashDates.size ? `, skip ${clashDates.size}` : ''}`, 'hub-primary'); add.type = 'button';
    add.disabled = count === 0;
    add.addEventListener('click', () => {
      try {
        const keep = pending.map(plan => ({ ...plan, dates: plan.dates.filter(date => !clashDates.has(date)) })).filter(plan => plan.dates.length);
        model.saveActivities(keep.flatMap(plan => scheduleInputs(plan, newId)));
        closeSheet(reviewDialog); askInput.value = ''; const prompt = $('#ai-prompt'); if (prompt && askedFrom === 'ai') prompt.value = '';
        feedback(`Added “${pending[0].title}” to your calendar${count > 1 ? ` (${count} days)` : ''}. Undo is at the top if you change your mind.`);
      } catch (problem) { error.textContent = problem.message || String(problem); }
    });
    review.append(...[node('p', `“${text}”`, 'hub-review-echo'), card, note, warning, error, add].filter(Boolean));
    openSheet('add');
    setTimeout(() => add.focus(), 80);
  }
  function showQuestion(message, text) {
    review.replaceChildren(node('p', `“${text}”`, 'hub-review-echo'), node('p', message, 'hub-review-question'));
    const fix = node('button', 'Edit my request', 'hub-primary'); fix.type = 'button';
    fix.addEventListener('click', () => {
      if (askedFrom === 'ai') { openSheet('ai'); setTimeout(() => $('#ai-prompt')?.focus(), 240); }
      else { closeSheet(reviewDialog); askInput.value = text; setTimeout(() => askInput.focus(), 240); }
    });
    review.append(fix);
    if (aiConfigured && askedFrom === 'bar') {
      const ai = node('button', 'Ask the AI planner instead', 'secondary'); ai.type = 'button';
      ai.addEventListener('click', () => { const prompt = $('#ai-prompt'); if (prompt) prompt.value = text; openSheet('ai'); });
      review.append(ai);
    }
    openSheet('add');
  }
  function handle(text, from) {
    lastText = text; askedFrom = from;
    const result = parseSchedule(text, model.getSettings());
    if (result.clarification) showQuestion(result.clarification, text); else showPlans(result.plans, text);
  }
  ask.addEventListener('submit', event => {
    event.preventDefault();
    const text = askInput.value.trim(); if (!text) { askInput.focus(); return; }
    handle(text, 'bar');
  });
  // "Plan with AI": requests to put things in the calendar always go through the same review.
  // Only one-day suggestion requests reach the paid AI planner, and only when it is configured.
  $('#ai-form')?.addEventListener('submit', event => {
    const text = $('#ai-prompt').value.trim(); if (!text) return;
    const result = parseSchedule(text, model.getSettings());
    const repeating = result.plans?.some(plan => plan.recurring) || interpretPlanningRequest(text, model.getSettings()).action === 'routines';
    if (!aiConfigured || repeating) { event.preventDefault(); event.stopImmediatePropagation(); handle(text, 'ai'); }
  }, { capture: true });

  // ---------- Live tile details ----------
  function render() {
    const tasks = model.getTasks(), active = tasks.filter(task => !task.completed);
    tasksTile.detail.textContent = tasks.length ? `${active.length} to do · ${tasks.length - active.length} done` : 'Nothing yet — add one';
    taskPreview.replaceChildren(...active.slice(0, 3).map(task => node('li', task.title)));
    chipTasks.textContent = `Tasks · ${active.length}`;
    const percent = $('#mini-productivity-percent')?.textContent || '0%';
    chipProgress.textContent = `◔ ${percent}`;
    const capacity = $('#day-capacity')?.textContent.trim();
    dayTile.detail.textContent = capacity || 'Hours, timeline & unplaced work';
    const reminders = $('#reminder-list')?.children.length || 0;
    remindersTile.detail.textContent = reminders ? `${reminders} coming up` : 'Notification settings';
    const current = now();
    today.textContent = dateLabel(current.date);
    mode.textContent = $('#planner-mode')?.textContent || '';
  }
  model.subscribe(() => requestAnimationFrame(render));
  for (const id of ['#day-capacity', '#reminder-list', '#mini-productivity-percent', '#planner-mode']) { const el = $(id); if (el) new MutationObserver(render).observe(el, { childList: true, characterData: true, subtree: true }); }
  render();
  if (gcal.openAfterConnect) setTimeout(() => openSheet('gcal'), 300);
  return { render, openSheet };
}
