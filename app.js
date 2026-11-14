import { newId } from './uuid.mjs';
import { createPlannerStore, PLANNER_KEY } from './planner-store.mjs';
import { initCalendar } from './calendar-ui.mjs';
import { minutes } from './calendar-store.mjs';
import { generatePlan, planningCapacity } from './scheduler.mjs';
import { zonedNow, dateLabel, dayNumber } from './clock.mjs';
import { upcomingReminders, isQuiet } from './reminders.mjs';
import { storage, isDemo } from './runtime.mjs';
import { seedDemo } from './demo.mjs';
import { timeLabel } from './calendar-view.mjs';
import { loadAccount } from './account-client.mjs';
import { initAssistant } from './assistant-ui.mjs';
import { wallToInstant } from './zoned-time.mjs';
import { initProductivity } from './productivity.mjs';
import { bindAccountAppearance } from './theme-ui.mjs';
import { initInterfaceMotion } from './interface-motion.mjs';

export async function startApp() {
  const $ = selector => document.querySelector(selector);
  const account = await loadAccount();
  if (account.user && account.document.state.settings.onboardingComplete !== true) { location.replace('onboarding.html'); return false; }
  if (isDemo) seedDemo(storage);
  const model = createPlannerStore(storage);
  if (account.user) bindAccountAppearance(model);
  const form = $('#activity-form');
  let calendar, assistant, productivity, original = null, placement = null, preview = null, saving = false, activeAlertKey = null;
  const displayedNotifications = new Map();
  const now = () => zonedNow(new Date(), model.snapshot().settings.timeZone);
  const field = name => form.elements.namedItem(name);
  const showError = (id, error) => { $(id).hidden = false; $(id).textContent = error.message || String(error); };
  function attempt(callback, errorId = '#planner-feedback') {
    try { callback(); if (errorId !== '#planner-feedback') $(errorId).hidden = true; return true; }
    catch (error) { showError(errorId, error); return false; }
  }
  function feedback(text) { $('#planner-feedback').textContent = text; }
  function configureForm() {
    const fixed = field('kind').value === 'fixed';
    $('#fixed-fields').hidden = !fixed; $('#fixed-fields').disabled = !fixed;
    $('#flexible-fields').hidden = fixed; $('#flexible-fields').disabled = fixed;
    for (const key of ['start', 'end']) field(key).required = fixed;
    field('duration').required = !fixed;
    field('repeatUntil').required = field('repeat').value !== 'none' && !original;
    field('repeatUntil').disabled = Boolean(original) || field('repeat').value === 'none';
  }
  function openActivity({ date = calendar.getSelectedDate(), item = null, start, end, title = '', kind = 'fixed' } = {}) {
    if (item?.sourceRoutine) { assistant.openSetup(); return; }
    if (item?.sourceImport) { feedback('Imported Google event. Edit it in Google Calendar, then sync in Settings.'); return; }
    form.reset(); original = null; placement = null;
    let source = item;
    if (item?.kind === 'task') {
      source = model.getTasks().find(task => task.id === item.taskId || task.id === item.id);
      placement = item.taskId ? { ...item, date } : null;
      if (!placement) for (const [day, entries] of Object.entries(model.snapshot().plans)) {
        const found = entries.find(entry => entry.kind === 'task' && entry.taskId === source?.id);
        if (found) { placement = { ...found, date: day }; break; }
      }
      kind = 'task';
    } else if (item) kind = 'fixed';
    const data = source ? { ...source, date: source.date || date, kind } : { kind, title, date, category: 'Study', priority: 'Medium', start: timeLabel(start ?? 9 * 60), end: timeLabel(end ?? Math.min(1439, (start ?? 9 * 60) + 60)), duration: 30, spent: 0, deadline: '', notes: '', repeat: 'none', repeatUntil: '', reminder: 'default', dstChoice: '' };
    if (source) original = { id: source.id, kind, date: source.date || date };
    for (const name of ['kind', 'title', 'date', 'category', 'priority', 'start', 'end', 'duration', 'spent', 'deadline', 'notes', 'repeat', 'repeatUntil', 'reminder']) if (data[name] !== undefined) field(name).value = data[name];
    field('deadlineAlertDate').value = source?.deadlineReminder?.date || '';
    field('deadlineAlertTime').value = source?.deadlineReminder?.time || '09:00';
    field('dstChoice').value = data.dstChoice || '';
    field('kind').disabled = Boolean(original); field('repeat').disabled = Boolean(original);
    $('#series-controls').hidden = !source?.seriesId;
    $('#activity-heading').textContent = original ? 'Edit activity' : 'Add activity';
    $('#complete-activity').hidden = !original; $('#delete-activity').hidden = !original;
    $('#complete-activity').textContent = source?.completed ? 'Reopen activity' : 'Complete activity';
    $('#lock-activity').hidden = !placement; $('#lock-activity').textContent = placement?.locked ? 'Unlock scheduled time' : 'Lock scheduled time';
    $('#unplan-activity').hidden = !placement;
    $('#activity-error').hidden = true; $('#activity-status').textContent = placement ? `Scheduled ${placement.date}, ${placement.start}–${placement.end}. Use a plan preview to move flexible work.` : '';
    configureForm(); $('#activity-dialog').showModal(); field('title').focus();
  }
  function renderTasks() {
    const tasks = model.getTasks(), filter = $('#task-filter').value;
    const visible = tasks.filter(task => filter === 'all' || (filter === 'completed' ? task.completed : !task.completed));
    const list = $('#task-list'); list.replaceChildren();
    $('#task-count').textContent = tasks.length; $('#task-count').setAttribute('aria-label', `${tasks.length} tasks`);
    $('#completion-summary').textContent = `${tasks.filter(task => task.completed).length} of ${tasks.length} completed`;
    $('#task-status').textContent = visible.length ? '' : 'No tasks here yet. Add one to start planning.';
    for (const task of visible) {
      const li = document.createElement('li'); if (task.completed) li.className = 'completed';
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = task.completed; check.dataset.taskId = task.id;
      check.setAttribute('aria-label', `Mark ${task.title} ${task.completed ? 'incomplete' : 'complete'}`);
      check.addEventListener('change', () => { attempt(() => model.toggle('task', task.id)); const replacement = [...list.querySelectorAll('input')].find(node => node.dataset.taskId === task.id); (replacement || $('#task-filter')).focus(); });
      const content = document.createElement('div'); content.className = 'task-content';
      const title = document.createElement('span'); title.className = 'task-title'; title.textContent = task.title;
      const detail = document.createElement('p'); detail.className = 'task-details'; detail.textContent = `${task.category} · ${task.duration - task.spent} min remaining · ${task.priority} priority${task.deadline ? ` · Due ${task.deadline}` : ''}${task.deadlineReminder && task.reminder !== 'off' ? ` · Deadline reminder ${task.deadlineReminder.date} at ${task.deadlineReminder.time}` : ''}`;
      content.append(title, detail); li.append(check, content);
      const actions = document.createElement('div'); actions.className = 'task-actions';
      for (const label of ['Edit', 'Delete']) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.textContent = label; button.setAttribute('aria-label', `${label} ${task.title}`);
        button.addEventListener('click', () => { if (label === 'Edit') openActivity({ date: calendar.getSelectedDate(), item: { ...task, kind: 'task' } }); else if (attempt(() => model.remove('task', task.id, task.date))) feedback('Task deleted. Undo is available.'); }); actions.append(button);
      }
      li.append(actions); list.append(li);
    }
  }
  function renderSummary() {
    if (!calendar) return;
    const currentTime = now(), date = calendar.getSelectedDate(), day = model.getDay(date);
    const events = model.getDay(currentTime.date).commitments.filter(item => !item.completed).sort((a, b) => minutes(a.start) - minutes(b.start));
    const current = events.find(item => minutes(item.start) <= currentTime.minute && minutes(item.end) > currentTime.minute);
    let next = events.find(item => minutes(item.start) > currentTime.minute);
    let nextDate = currentTime.date;
    if (!next) {
      const state = model.snapshot();
      for (const day of [...new Set([...Object.keys(state.days), ...Object.keys(state.plans)])].filter(key => key > currentTime.date).sort()) {
        const first = model.getDay(day).commitments.filter(item => !item.completed).sort((a, b) => minutes(a.start) - minutes(b.start))[0];
        if (first) { next = first; nextDate = day; break; }
      }
    }
    $('#dashboard-date').textContent = `${dateLabel(currentTime.date, { year: 'numeric' })} · ${model.snapshot().settings.timeZone}`;
    $('#now-heading').textContent = current?.title || 'A little breathing room';
    $('#now-detail').textContent = current ? `Until ${current.end}` : 'No activity scheduled right now.';
    $('#next-activity').textContent = next ? `Next: ${next.title} at ${next.start}${nextDate !== currentTime.date ? ` on ${dateLabel(nextDate)}` : ''}` : 'No upcoming activities scheduled.';
    $('#free-minutes').textContent = planningCapacity(day, model.snapshot().settings).free; $('#free-date').textContent = `${model.snapshot().settings.setupConfirmed ? 'Unbooked' : 'Estimate — finish availability setup'} on ${dateLabel(date)}`;
    productivity?.render();
    $('#undo-action').disabled = !model.snapshot().undo;
    const unplaced = $('#day-unscheduled'); unplaced.replaceChildren();
    for (const item of model.snapshot().unscheduled?.[date] || []) if (model.getTasks().some(task => task.id === item.taskId && !task.completed)) {
      const title = model.getTasks().find(task => task.id === item.taskId).title;
      const row = document.createElement('li'); row.textContent = `Last plan left ${title} unscheduled: ${item.reason} Generate a fresh preview after changing the day or task.`; unplaced.append(row);
    }
    renderReminders();
    assistant?.render();
  }
  function renderReminders() {
    const list = $('#reminder-list'); list.replaceChildren();
    const reminders = upcomingReminders(model, now());
    const settings = model.snapshot().settings;
    const fallback = storage.getItem('day-compass.open-page-fallback.v1') === 'true';
    $('#reminder-mode').textContent = settings.remindersEnabled && fallback ? 'Page-open reminders are enabled on this browser. Keep this page open and the computer awake, outside quiet hours.' : account.user && settings.backgroundReminders ? 'Background reminders are enabled for this account. Check Notifications for this device’s subscription and delivery status.' : settings.remindersEnabled ? 'Open-page alerts are enabled while this page remains open, outside quiet hours.' : 'Notifications are off for this planner. Enable background reminders on this device in Notifications.';
    $('#reminder-mode-help').textContent = !fallback && account.user && settings.backgroundReminders ? 'The server must stay running. Device permission and subscription are checked in Notifications; this list alone does not confirm delivery.' : 'Page-open reminders cannot run after the page closes and browser suspension may delay them. Times use your configured timezone.';
    const validKeys = new Set(reminders.map(item => item.key));
    if (activeAlertKey && !validKeys.has(activeAlertKey)) { $('#reminder-alert').textContent = ''; activeAlertKey = null; }
    for (const [key, notification] of displayedNotifications) if (!validKeys.has(key)) { notification.close(); displayedNotifications.delete(key); }
    for (const reminder of reminders.slice(0, 20)) { const li = document.createElement('li'), dueDate = new Date(Math.floor(reminder.due / 1440) * 86400000).toISOString().slice(0, 10); li.textContent = `${reminder.title}: activity ${reminder.date} at ${reminder.start} · reminder ${dueDate} at ${timeLabel(reminder.due % 1440)} (${reminder.lead} min before)`; list.append(li); }
    if (!reminders.length) { const li = document.createElement('li'); li.textContent = 'No upcoming reminders. Add an activity or apply a schedule to create them.'; list.append(li); }
  }
  function previewPlan() {
    const state = model.snapshot(), date = calendar.getSelectedDate();
    const day = model.getDay(date); day.commitments = day.commitments.filter(item => item.kind === 'fixed');
    const proposed = generatePlan({ date, day, tasks: state.tasks, existing: state.plans[date] || [], otherPlans: state.plans, settings: state.settings, now: now() });
    preview = { date, revision: state.revision, proposed };
    const body = $('#plan-preview'); body.replaceChildren();
    const heading = document.createElement('h3'); heading.textContent = dateLabel(date, { year: 'numeric' }); body.append(heading);
    const old = state.plans[date] || [];
    for (const entry of proposed.entries) {
      const li = document.createElement('p'); const previous = old.find(item => item.taskId && item.taskId === entry.taskId && item.kind === entry.kind);
      li.textContent = `${entry.start}–${entry.end} ${entry.title}${entry.locked ? ' [locked]' : ''}${entry.completed ? ' [completed]' : ''}${previous && (previous.start !== entry.start || previous.end !== entry.end) ? ` (was ${previous.start}–${previous.end})` : ''}${entry.reason ? ` — ${entry.reason}` : ''}`; body.append(li);
    }
    if (!proposed.entries.length) { const p = document.createElement('p'); p.textContent = 'No flexible tasks can be placed on this day.'; body.append(p); }
    for (const item of proposed.unscheduled) { const p = document.createElement('p'); p.textContent = `Not placed: ${item.title}. ${item.reason} Try another date, extend planning hours, or reduce the remaining duration if you have already done some work.`; body.append(p); }
    for (const warning of proposed.warnings) { const p = document.createElement('p'); p.textContent = warning; body.append(p); }
    $('#apply-plan').disabled = Boolean(proposed.warnings.length); $('#plan-error').hidden = true; $('#plan-dialog').showModal();
  }
  calendar = initCalendar(model, { onActivity: openActivity, onSelection: renderSummary, onHours: date => {
    const day = model.getDay(date); for (const name of ['start', 'end', 'color']) $('#hours-form').elements.namedItem(name).value = day[name]; $('#hours-error').hidden = true; $('#hours-dialog').showModal();
  } });
  model.subscribe(() => { renderTasks(); calendar.refresh(); renderSummary(); });
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $('#activity-dialog').addEventListener('close', () => $('#calendar-add').focus());
  for (const name of ['kind', 'repeat']) field(name).addEventListener('change', configureForm);
  form.addEventListener('submit', event => {
    event.preventDefault(); if (saving) return; saving = true; $('#save-activity').disabled = true;
    const data = {};
    for (const name of ['kind', 'title', 'category', 'priority', 'date', 'start', 'end', 'deadline', 'notes', 'repeat', 'repeatUntil', 'reminder']) data[name] = field(name).value;
    data.title = data.title.trim(); data.duration = Number(field('duration').value); data.spent = Number(field('spent').value); data.id = original?.id || newId(); data.locked = false;
    if (data.kind === 'task' && field('deadlineAlertDate').value) data.deadlineReminder = { date: field('deadlineAlertDate').value, time: field('deadlineAlertTime').value };
    if (!['default', 'off'].includes(data.reminder)) data.reminder = Number(data.reminder);
    data.dstChoice = field('dstChoice').value;
    if (attempt(() => { if (data.kind === 'fixed') { wallToInstant(data.date, data.start, model.snapshot().settings.timeZone, data.dstChoice); wallToInstant(data.date, data.end, model.snapshot().settings.timeZone, data.dstChoice); } model.saveActivity(data, original, field('scope').value); }, '#activity-error')) { calendar.selectDate(data.date); $('#activity-dialog').close(); feedback(data.kind === 'task' ? 'Task saved. Generate or replan your day to preview where it fits.' : 'Activity saved. Undo is available.'); }
    saving = false; $('#save-activity').disabled = false;
  });
  $('#complete-activity').addEventListener('click', () => { if (attempt(() => model.toggle(original.kind, original.id, original.date), '#activity-error')) $('#activity-dialog').close(); });
  $('#delete-activity').addEventListener('click', () => { if (attempt(() => model.remove(original.kind, original.id, original.date, field('scope').value), '#activity-error')) { $('#activity-dialog').close(); feedback('Activity deleted. Undo is available.'); } });
  $('#lock-activity').addEventListener('click', () => { if (attempt(() => model.lock(placement.date, placement.id), '#activity-error')) { $('#activity-dialog').close(); feedback('Scheduled-time lock updated.'); } });
  $('#unplan-activity').addEventListener('click', () => { if (attempt(() => model.unplan(placement.date, original.id), '#activity-error')) { $('#activity-dialog').close(); feedback('Task kept in your list and removed from this schedule. Choose another date and generate a new plan. Undo is available.'); } });
  $('#task-form').addEventListener('submit', event => { event.preventDefault(); const title = $('#task-title').value.trim(); if (!title) { $('#task-status').textContent = 'Enter a task title.'; return; } openActivity({ title, kind: 'task' }); $('#task-form').reset(); });
  $('#task-filter').addEventListener('change', renderTasks);
  $('#undo-action').addEventListener('click', () => { if (attempt(() => model.undo())) feedback('Last change undone.'); });
  for (const id of ['#generate-day', '#replan-day']) $(id).addEventListener('click', previewPlan);
  $('#apply-plan').addEventListener('click', () => { if (attempt(() => model.applyPlan(preview.date, preview.proposed, preview.revision), '#plan-error')) { $('#plan-dialog').close(); feedback('Plan applied. Undo is available.'); } });
  $('#open-planning-settings').addEventListener('click', () => { const settings = model.snapshot().settings; for (const [name, value] of Object.entries(settings)) { const input = $('#planning-form').elements.namedItem(name); if (!input) continue; if (typeof value === 'boolean') input.checked = value; else input.value = value; } $('#planning-error').hidden = true; $('#planning-dialog').showModal(); });
  $('#planning-form').addEventListener('submit', event => { event.preventDefault(); const settings = Object.fromEntries(new FormData(event.target)); for (const name of ['breakMinutes', 'reminderMinutes']) settings[name] = Number(settings[name]); settings.remindersEnabled = event.target.elements.namedItem('remindersEnabled').checked; if (attempt(() => model.saveSettings(settings), '#planning-error')) { $('#planning-dialog').close(); feedback('Preferences saved. Existing per-day hours remain; use Edit day hours to change them.'); } });
  $('#hours-form').addEventListener('submit', event => { event.preventDefault(); if (attempt(() => model.setHours(calendar.getSelectedDate(), Object.fromEntries(new FormData(event.target))), '#hours-error')) $('#hours-dialog').close(); });
  $('#enable-notifications').addEventListener('click', async () => { if (!('Notification' in window)) { $('#notification-status').textContent = 'Browser notifications are unavailable here. In-app reminders still work.'; return; } const permission = await Notification.requestPermission(); $('#notification-status').textContent = permission === 'granted' ? 'Permission granted. Enable reminders and save preferences to receive open-page alerts.' : 'Notifications not enabled. In-app reminders remain available.'; });
  async function tickReminders() {
    const settings = model.snapshot().settings, time = now();
    if (!settings.remindersEnabled || (account.user && settings.backgroundReminders && storage.getItem('day-compass.open-page-fallback.v1') !== 'true') || isQuiet(time.minute, settings)) return;
    const stamp = dayNumber(time.date) * 1440 + time.minute;
    const send = () => { for (const reminder of upcomingReminders(model, time).filter(item => item.due <= stamp && item.startStamp >= stamp)) {
      if (!model.claimReminder(reminder.key)) continue;
      $('#reminder-alert').textContent = `Reminder: ${reminder.title} starts at ${reminder.start}.`;
      activeAlertKey = reminder.key;
      if ('Notification' in window && Notification.permission === 'granted') { try { displayedNotifications.set(reminder.key, new Notification('Day Compass', { body: `${reminder.title} starts at ${reminder.start}`, tag: reminder.key })); } catch { /* In-app alert stays available. */ }
      }
    } };
    try { if (navigator.locks) await navigator.locks.request(`day-compass-reminders-${isDemo}`, send); else send(); }
    catch (error) { $('#reminder-alert').textContent = `Reminder delivery paused: ${error.message}`; }
  }
  setInterval(() => { renderSummary(); tickReminders(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderSummary(); tickReminders(); } });
  window.addEventListener('storage', event => { if (event.key === PLANNER_KEY && !isDemo) attempt(() => model.reload()); });
  if (isDemo) { $('#planner-mode').textContent = 'Sample demo. Data and preferences stay separate from your personal planner.'; $('#task-help').textContent = 'Sample data saves only in this demo session.'; }
  productivity = initProductivity({ model, storage, selectedDate: calendar.getSelectedDate });
  assistant = initAssistant({ model, account, calendar, openActivity, now });
  $('#open-reminder-settings').addEventListener('click', () => { $('[data-panel=settings]').click(); $('[data-settings-view=notifications]').click(); $('#settings-panel').scrollIntoView({ block: 'start' }); });
  if (account.user && new URLSearchParams(location.search).get('welcome') === '1') {
    const welcome = document.createElement('section'); welcome.className = 'welcome-connections'; welcome.setAttribute('aria-label', 'Optional calendar connection');
    welcome.innerHTML = '<div><strong>Your planner is ready.</strong><p>Want to bring your Google Calendar along?</p></div><a class="button secondary" href="dashboard.html#connections">Connect Google Calendar</a><button type="button" class="secondary">Not now</button>';
    welcome.querySelector('button').addEventListener('click', () => welcome.remove()); $('.dashboard-heading').after(welcome);
  }
  renderTasks(); renderSummary(); tickReminders(); initInterfaceMotion();
}
