import { newId } from './uuid.mjs';
import { parseScheduleRequest, scheduleInputs, describeSchedule } from './schedule-request.mjs';
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
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>'
};
const icon = name => { const span = node('span', undefined, 'hub-icon'); span.setAttribute('aria-hidden', 'true'); span.innerHTML = ICONS[name]; return span; };

export function initWorkspaceHub({ model, now, feedback }) {
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
  actions.append(undoButton, iconButton('palette', 'Themes', () => $('[data-open-appearance]').click()), iconButton('gear', 'Settings', () => openSheet('settings')));
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
  sheet('reminders', 'Reminders', remindersWidget);

  const aiPanel = $('#ai-panel');
  const aiTile = tile('ai', 'spark', 'Plan with AI', () => openSheet('ai'));
  sheet('ai', 'Plan with AI', aiPanel);

  const settingsPanel = $('#settings-panel');
  sheet('settings', 'Settings', settingsPanel);

  const upcoming = $('.workspace-upcoming'); upcoming?.classList.add('hub-card', 'hub-upcoming');
  const helper = $('.task-chat-launch');
  const themesTile = tile('themes', 'palette', 'Themes', () => $('[data-open-appearance]').click());
  themesTile.detail.textContent = 'Colours & wallpaper';

  left.append(...[productivity, nowWidget, freeWidget, tasksTile.button].filter(Boolean));
  right.append(...[upcoming, dayTile.button, remindersTile.button, aiTile.button, helper, themesTile.button].filter(Boolean));
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
  let pending = null;
  function showPlan(plan, text) {
    pending = plan; review.replaceChildren();
    const { dayText, count } = describeSchedule(plan);
    const card = node('div', undefined, 'hub-review-card');
    const title = node('input', undefined, 'hub-review-title'); title.value = plan.title; title.maxLength = 120; title.setAttribute('aria-label', 'Event title');
    title.addEventListener('input', () => { pending.title = title.value.trim() || plan.title; });
    const rows = node('dl', undefined, 'hub-review-rows');
    const row = (label, value) => { rows.append(node('dt', label), node('dd', value)); };
    if (dayText) row('Repeats', dayText);
    row('Time', `${plan.start} – ${plan.end}${plan.guessedLength ? ' (1 hour, change in the event)' : ''}`);
    const full = date => dateLabel(date, { year: 'numeric' });
    if (plan.recurring) row('Dates', `${full(plan.dates[0])} → ${full(plan.dates.at(-1))}`);
    else row('Date', full(plan.from));
    row('Category', plan.category);
    card.append(title, rows);
    const note = node('p', plan.recurring ? `Adds ${count} event${count === 1 ? '' : 's'} to your calendar.` : 'Adds one event to your calendar.', 'hub-review-note');
    if (plan.capped) note.textContent += ' Repeats are limited to one year, so it stops on the last date shown.';
    const error = node('p', '', 'hub-review-error'); error.setAttribute('role', 'alert');
    const add = node('button', plan.recurring ? `Add ${count} events` : 'Add event', 'hub-primary'); add.type = 'button';
    add.addEventListener('click', () => {
      try {
        model.saveActivities(scheduleInputs(pending, newId));
        closeSheet(reviewDialog); askInput.value = '';
        feedback(`Added “${pending.title}” to your calendar${plan.recurring ? ` (${count} days)` : ''}. Undo is at the top if you change your mind.`);
      } catch (problem) { error.textContent = problem.message || String(problem); }
    });
    const echo = node('p', `“${text}”`, 'hub-review-echo');
    review.append(echo, card, note, error, add);
    openSheet('add');
    setTimeout(() => add.focus(), 80);
  }
  function showQuestion(message, text) {
    review.replaceChildren(node('p', `“${text}”`, 'hub-review-echo'), node('p', message, 'hub-review-question'));
    const fix = node('button', 'Edit my request', 'hub-primary'); fix.type = 'button';
    fix.addEventListener('click', () => { closeSheet(reviewDialog); setTimeout(() => askInput.focus(), 240); });
    const ai = node('button', 'Ask the AI planner instead', 'secondary'); ai.type = 'button';
    ai.addEventListener('click', () => { const prompt = $('#ai-prompt'); if (prompt) prompt.value = text; openSheet('ai'); });
    review.append(fix, ai); openSheet('add');
  }
  ask.addEventListener('submit', event => {
    event.preventDefault();
    const text = askInput.value.trim(); if (!text) { askInput.focus(); return; }
    const plan = parseScheduleRequest(text, model.snapshot().settings);
    if (plan.clarification) showQuestion(plan.clarification, text); else showPlan(plan, text);
  });
  // The AI planner handles one-day suggestions; repeating requests go through the same review.
  $('#ai-form')?.addEventListener('submit', event => {
    const text = $('#ai-prompt').value.trim();
    const plan = parseScheduleRequest(text, model.snapshot().settings);
    if (!plan.clarification && plan.recurring) { event.preventDefault(); event.stopImmediatePropagation(); showPlan(plan, text); }
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
  return { render, openSheet };
}
