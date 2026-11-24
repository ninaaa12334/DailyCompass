import { newId } from './uuid.mjs';
import { parseSchedule, scheduleInputs, describeSchedule } from './schedule-request.mjs';
import { interpretPlanningRequest } from './planning-request.mjs';
import { reminderSound } from './reminder-banner.mjs';
import { buildCalendarFile, downloadCalendarFile } from './ics-export.mjs';
import { pushSupport, pushEnabled, enablePush, disablePush, testPush, startPushSync } from './push-cloud.mjs';
import { initGoogleCalendar } from './google-calendar.mjs';
import { holidayControls } from './holidays.mjs';
import { taskProductivity } from './productivity.mjs';
import { isDarkMode, toggleDarkMode } from './theme-ui.mjs';
import { dateLabel } from './clock.mjs';

// Calendar-centred workspace: the calendar fills the middle of the screen and every other
// feature is a tile around it that opens in a sheet. Existing widgets are moved (not copied),
// so all their behaviour and event handlers keep working.
const node = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
const ICONS = {
  tasks: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/></svg>',
  day: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>',
  calendars: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="m12 12 1.1 2.2 2.4.3-1.8 1.6.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.6 2.4-.3Z"/></svg>',
  bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3.5 13.8 9 19.5 11 13.8 13 12 18.5 10.2 13 4.5 11 10.2 9Z"/><path d="M19 3v3M17.5 4.5h3"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M5 17.5V7a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 7v6a2.5 2.5 0 0 1-2.5 2.5H9Z"/><path d="M9 9.5h6M9 12h4"/></svg>',
  palette: '<svg viewBox="0 0 24 24"><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.8-.9 1.4-1.9-.5-1.1.2-2.3 1.4-2.3H17a3.5 3.5 0 0 0 3.5-3.5c0-5.2-3.8-9.3-8.5-9.3Z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="7.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/></svg>',
  // Cog outline (Feather "settings" icon, MIT licence).
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  list: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13.5h4M7.5 16.5h7"/></svg>',
  expand: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>',
  shrink: '<svg viewBox="0 0 24 24"><path d="M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7"/></svg>',
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
    b.dataset.label = label; b.title = label; b.setAttribute('aria-label', label);
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
  // A little progress ring for today's tasks ("3/5 · Look at you go.") instead of the plain icon.
  const taskRing = node('span', undefined, 'task-ring'); taskRing.setAttribute('aria-hidden', 'true');
  taskRing.innerHTML = '<svg viewBox="0 0 44 44"><circle class="task-ring-track" cx="22" cy="22" r="18"/><circle class="task-ring-fill" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="0 100"/></svg><b>0/0</b>';
  tasksTile.button.querySelector('.hub-icon').replaceWith(taskRing);
  tasksTile.button.querySelector('.hub-tile-chevron').textContent = '✦'; tasksTile.button.querySelector('.hub-tile-chevron').classList.add('task-spark');
  const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
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
    <form class="reminder-add" data-reminder="add"><strong>＋ Add a reminder</strong><input name="what" maxlength="120" required placeholder="What should I remind you about?"><div class="reminder-add-row"><input name="date" type="date" required><input name="time" type="time" required><button type="submit" class="hub-primary">Add</button></div></form>
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
  { const form = control('add'), today = now().date; form.elements.date.value = today; form.elements.date.min = today;
    form.addEventListener('submit', event => {
      event.preventDefault();
      const what = form.elements.what.value.trim(), date = form.elements.date.value, time = form.elements.time.value;
      if (!what || !date || !time) return;
      try {
        model.saveActivities([{ kind: 'fixed', id: newId(), title: what.charAt(0).toUpperCase() + what.slice(1), category: 'Personal projects', priority: 'Medium', date, start: time, end: plus(time, 5), notes: '', repeat: 'none', repeatUntil: '', reminder: 0, completed: false, locked: false, isReminder: true }]);
        if (!model.getSettings().remindersEnabled) model.saveSettings({ remindersEnabled: true });
        feedback(`Reminder set for ${dateLabel(date)} at ${time}.`); form.reset(); form.elements.date.value = today;
      } catch (problem) { feedback(problem.message); }
    }); }
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
  const gcalTile = tile('gcal', 'calendars', 'Calendars & holidays', () => openSheet('gcal'));
  gcalTile.detail.textContent = 'Google Calendar, public holidays';
  // Like Google's "Other calendars": public holidays can be shown or hidden here (and in Settings).
  const holidayBox = node('div', undefined, 'gcal-holidays'); holidayBox.append(node('strong', 'Holidays'), holidayControls({ model, feedback }));
  sheet('gcal', 'Calendars', [gcal.element, holidayBox], gcal.onOpen);

  // ---------- Ideas: little things you're curious about (no dates, no pressure) ----------
  const ideasTile = tile('ideas', 'bulb', 'Ideas', () => openSheet('ideas'));
  const ideasBox = node('div', undefined, 'ideas-box');
  ideasBox.innerHTML = '<p class="ideas-intro">Little things you’re curious about. No dates, no deadlines — they don’t count as tasks. When you have free time, I’ll suggest one.</p><form class="ideas-add"><input name="idea" maxlength="300" autocomplete="off" required placeholder="How do black holes form?"><button type="submit" class="hub-primary">Add</button></form><ul class="ideas-list"></ul><p class="ideas-empty">No ideas yet. You can also type “idea: …” in the ask bar.</p>';
  const ideasForm = ideasBox.querySelector('form'), ideasList = ideasBox.querySelector('.ideas-list');
  function addIdea(text) {
    try { model.addIdea(text, newId(), now().date); return true; } catch (problem) { feedback(problem.message); return false; }
  }
  ideasForm.addEventListener('submit', event => { event.preventDefault(); if (addIdea(ideasForm.elements.idea.value)) { ideasForm.reset(); ideasForm.elements.idea.focus(); } });
  function remindAbout(idea) {
    closeSheet(sheets.get('ideas').dialog);
    openSheet('reminders');
    const form = controls.querySelector('[data-reminder=add]'); form.elements.what.value = idea.text; form.elements.time.focus();
  }
  function renderIdeas() {
    const ideas = model.getIdeas();
    ideasBox.querySelector('.ideas-empty').hidden = ideas.length > 0;
    ideasList.replaceChildren(...ideas.map(idea => {
      const li = node('li', undefined, 'idea-item'), text = node('span', idea.text, 'idea-text');
      const remind = node('button', '🔔', 'idea-action'); remind.type = 'button'; remind.title = 'Remind me about this at a set time'; remind.setAttribute('aria-label', `Set a reminder for: ${idea.text}`);
      remind.addEventListener('click', () => remindAbout(idea));
      const remove = node('button', '🗑', 'idea-action idea-delete'); remove.type = 'button'; remove.title = 'Delete this idea'; remove.setAttribute('aria-label', `Delete idea: ${idea.text}`);
      remove.addEventListener('click', () => { model.removeIdea(idea.id); feedback('Idea deleted. Undo is at the top.'); });
      li.append(text, remind, remove); return li;
    }));
    ideasTile.detail.textContent = ideas.length ? `${ideas.length} saved` : 'Things you’re curious about';
  }
  sheet('ideas', 'Ideas', ideasBox, () => setTimeout(() => ideasForm.elements.idea.focus(), 50));
  // A gentle nudge in "Space in your day": one idea per day, only when there is free time.
  const nudge = node('button', undefined, 'idea-nudge'); nudge.type = 'button'; nudge.hidden = true;
  nudge.addEventListener('click', () => openSheet('ideas'));
  freeWidget?.append(nudge);
  function renderNudge() {
    const ideas = model.getIdeas(), free = Number.parseFloat($('#free-minutes')?.textContent || '0');
    if (!ideas.length || !(free > 0)) { nudge.hidden = true; return; }
    const day = Number(now().date.replaceAll('-', '')), idea = ideas[day % ideas.length];
    nudge.hidden = false; nudge.replaceChildren(node('span', '💡', 'idea-nudge-icon'), node('span', `Free moment? Look into: ${idea.text}`));
  }

  left.append(...[productivity, nowWidget, freeWidget, tasksTile.button].filter(Boolean));
  // The right side is a slim column of icons; hovering shows the name. Upcoming opens in a sheet.
  const upcomingTile = tile('upcoming', 'day', 'Upcoming events', () => openSheet('upcoming'));
  upcomingTile.button.querySelector('.hub-icon').innerHTML = ICONS.list;
  right.classList.add('hub-rail-icons');
  right.append(...[upcomingTile.button, dayTile.button, remindersTile.button, ideasTile.button, gcalTile.button, aiTile.button, helper].filter(Boolean));
  if (helper) { helper.dataset.label = 'Task helper'; helper.title = 'Task helper'; }
  if (helper) { helper.classList.add('hub-tile', 'hub-tile-helper'); helper.replaceChildren(icon('chat'), Object.assign(node('span', undefined, 'hub-tile-text'), { innerHTML: '<strong>Task helper</strong><small class="hub-tile-detail">Turn a thought into a task</small>' }), node('span', '›', 'hub-tile-chevron')); }
  aiTile.detail.textContent = 'Suggestions for a day';
  center.append($('.calendar-widget'));
  // Make the calendar fill the screen (hides the left column); remembered on this device.
  const expand = node('button', undefined, 'hub-icon-button calendar-expand'); expand.type = 'button';
  const setWide = wide => { document.body.dataset.calendarWide = wide ? 'true' : 'false'; expand.replaceChildren(icon(wide ? 'shrink' : 'expand')); expand.title = wide ? 'Make the calendar smaller' : 'Make the calendar bigger'; expand.setAttribute('aria-label', expand.title); expand.setAttribute('aria-pressed', String(wide)); try { localStorage.setItem('day-compass.calendar-wide.v1', String(wide)); } catch {} };
  expand.addEventListener('click', () => setWide(document.body.dataset.calendarWide !== 'true'));
  center.querySelector('.calendar-header-actions')?.prepend(expand);
  let startWide = false; try { startWide = localStorage.getItem('day-compass.calendar-wide.v1') === 'true'; } catch {}
  setWide(startWide);

  // Phone: a swipeable row of chips gives quick access to the same tiles.
  const chips = node('nav', undefined, 'hub-chips'); chips.setAttribute('aria-label', 'Quick access');
  const chip = (label, handler, id) => { const b = node('button', label, 'hub-chip'); b.type = 'button'; if (id) b.id = id; b.addEventListener('click', handler); chips.append(b); return b; };
  const chipProgress = chip('0%', () => productivity?.click(), 'hub-chip-progress');
  const chipTasks = chip('Tasks', () => openSheet('tasks'));
  chip('Your day', () => openSheet('day'));
  chip('Upcoming', () => openSheet('upcoming'));
  chip('Reminders', () => openSheet('reminders'));
  chip('Ideas', () => openSheet('ideas'));
  chip('Google Calendar', () => openSheet('gcal'));
  chip('Plan with AI', () => openSheet('ai'));
  if (helper) chip('Task helper', () => helper.click());
  // On phones the upcoming list lives in a sheet; on wider screens it stays in the right rail.
  sheet('upcoming', 'Upcoming events', upcoming);

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
      if (plan.reminderOnly) row('Remind me at', plan.start);
      else row('Time', `${plan.start} – ${plan.end}${plan.guessedLength ? ' (1 hour, change in the event)' : ''}`);
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
        model.saveActivities(keep.flatMap(plan => scheduleInputs(plan, newId).map(input => plan.reminderOnly ? { ...input, isReminder: true, reminder: 0 } : input)));
        if (keep.some(plan => plan.reminderOnly) && !model.getSettings().remindersEnabled) model.saveSettings({ remindersEnabled: true });
        closeSheet(reviewDialog); askInput.value = ''; const prompt = $('#ai-prompt'); if (prompt && askedFrom === 'ai') prompt.value = '';
        feedback(`Added “${pending[0].title}” to your calendar${count > 1 ? ` (${count} days)` : ''}. Undo is at the top if you change your mind.`);
      } catch (problem) { error.textContent = problem.message || String(problem); }
    });
    if (plans[0].reminderOnly) { add.textContent = count === 1 ? 'Add reminder' : `Add ${count} reminders`; note.textContent = count === 1 ? 'You’ll get a reminder at that time.' : `You’ll get ${count} reminders.`; }
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
  const isReminderRequest = text => /^\s*(please\s+)?(remind me|reminder)\b/i.test(text);
  const plus = (time, m) => { const t = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + m; return `${String(Math.floor(Math.min(t, 1439) / 60)).padStart(2, '0')}:${String(Math.min(t, 1439) % 60).padStart(2, '0')}`; };
  function handle(text, from) {
    // "idea: how do black holes form" or "I wonder why the sky is blue" goes to Ideas, not the calendar.
    const idea = text.match(/^\s*(?:idea|💡)\s*[:\-–]?\s+(.+)$/iu)?.[1] || (/^\s*i wonder\b/i.test(text) ? text.trim() : '');
    if (idea && from === 'bar') { if (addIdea(idea.charAt(0).toUpperCase() + idea.slice(1))) { askInput.value = ''; feedback('Saved to Ideas 💡'); } return; }
    lastText = text; askedFrom = from;
    // Reminders are short, so late ones (e.g. 11:30pm) don't get a guessed hour that runs past midnight.
    const result = parseSchedule(isReminderRequest(text) && !/\bfor\s+\d/i.test(text) ? `${text} for 5 minutes` : text, model.getSettings());
    if (result.clarification) { showQuestion(isReminderRequest(text) && /What time/.test(result.clarification) ? 'When should I remind you? For example “remind me to go to the shop at 5pm” or “… tomorrow at 9am”.' : result.clarification, text); return; }
    if (isReminderRequest(text)) {
      // Keep the person's own words as the title: "remind me to go to the shop at 5" -> "Go to the shop".
      const words = text.replace(/^\s*(please\s+)?(remind me|reminder)\s*(to|about|that)?\s*/i, '').replace(/\s+(on|at|by|tomorrow|today|tonight|this|next|in|every)\b.*$/i, '').replace(/[.!]+$/, '').trim();
      const title = words && result.plans.length === 1 ? words.charAt(0).toUpperCase() + words.slice(1, 80) : null;
      result.plans = result.plans.map(plan => ({ ...plan, title: title || plan.title, reminderOnly: true, end: plus(plan.start, 5), guessedLength: false }));
    }
    showPlans(result.plans, text);
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
    const todayTasks = taskProductivity(model.getPlanning(), now().date, 'day'), done = todayTasks.done, total = todayTasks.total;
    taskRing.querySelector('b').textContent = `${done}/${total}`;
    taskRing.querySelector('.task-ring-fill').setAttribute('stroke-dasharray', `${total ? Math.round(done / total * 100) : 0} 100`);
    const title = tasksTile.button.querySelector('.hub-tile-text strong');
    if (!total) { title.textContent = 'Tasks'; tasksTile.detail.textContent = tasks.length ? `${active.length} to do` : 'Nothing yet — add one'; }
    else if (done === total) { title.textContent = 'All done!'; tasksTile.detail.textContent = `Every task for today is finished. 🎉`; }
    else if (done === 0) { title.textContent = 'Ready when you are.'; tasksTile.detail.textContent = `${WORDS[total] || total} little step${total === 1 ? '' : 's'} today.`; }
    else { title.textContent = 'Look at you go.'; tasksTile.detail.textContent = `${WORDS[done] || done} little win${done === 1 ? '' : 's'}. All yours.`; }
    tasksTile.button.setAttribute('aria-label', `Tasks: ${done} of ${total} done today. ${title.textContent}`);
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
  model.subscribe(() => requestAnimationFrame(() => { renderIdeas(); renderNudge(); }));
  new MutationObserver(renderNudge).observe($('#free-minutes') || document.createElement('i'), { childList: true, characterData: true, subtree: true });
  renderIdeas(); renderNudge();
  model.subscribe(() => requestAnimationFrame(render));
  for (const id of ['#day-capacity', '#reminder-list', '#mini-productivity-percent', '#planner-mode']) { const el = $(id); if (el) new MutationObserver(render).observe(el, { childList: true, characterData: true, subtree: true }); }
  render();
  if (gcal.openAfterConnect) setTimeout(() => openSheet('gcal'), 300);
  return { render, openSheet };
}
