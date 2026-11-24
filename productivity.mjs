import { addDays, weekDates } from './calendar-view.mjs';
import { planningCapacity } from './scheduler.mjs';
import { dateLabel } from './clock.mjs';

// Count each task once, even if it is both due and scheduled in the period.
// This is task completion, not a measure of time worked or personal worth.
export function taskProductivity(state, date, period = 'day') {
  let start = date, end = date;
  if (period === 'week') [start, , , , , , end] = weekDates(date);
  if (period === 'month') {
    start = `${date.slice(0, 7)}-01`;
    const next = new Date(`${start}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
    end = addDays(next.toISOString().slice(0, 10), -1);
  }
  const inRange = value => value && value >= start && value <= end;
  const scheduled = new Set(Object.entries(state.plans).filter(([day]) => inRange(day)).flatMap(([, entries]) => entries.filter(e => e.kind === 'task').map(e => e.taskId)));
  const everScheduled = new Set(Object.values(state.plans).flatMap(entries => entries.filter(e => e.kind === 'task').map(e => e.taskId)));
  const scheduledBefore = new Set(Object.entries(state.plans).filter(([day]) => day < start).flatMap(([, entries]) => entries.filter(e => e.kind === 'task').map(e => e.taskId)));
  const tasks = state.tasks.filter(t => {
    const belongs = inRange(t.date) || inRange(t.deadline) || scheduled.has(t.id);
    const overdue = t.deadline ? t.deadline < start : t.date && t.date < start;
    const undated = !t.date && !t.deadline && !everScheduled.has(t.id);
    return belongs || (!t.completed && (overdue || undated || scheduledBefore.has(t.id)));
  });
  const done = tasks.filter(t => t.completed).length;
  // Rounding must never show 100% while even one task is still unchecked.
  const percent = tasks.length ? (done === tasks.length ? 100 : Math.min(99, Math.round(done / tasks.length * 100))) : 0;
  return { start, end, total: tasks.length, done, percent };
}

// Productivity is what you actually got done: finished tasks, plus events and classes once their time
// has passed. Plans still ahead and reminders don't count. It's the share of your usable planning hours
// filled with finished things, averaged over every day in the period, so one busy day in a quiet week
// scores lower than a full week.
const toMin = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export function busyProductivity(getDay, settings, date, period = 'day', { now = null, tasks = [], scheduledTaskIds = new Set() } = {}) {
  let start = date, end = date;
  if (period === 'week') [start, , , , , , end] = weekDates(date);
  if (period === 'month') { start = `${date.slice(0, 7)}-01`; const next = new Date(`${start}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1); end = addDays(next.toISOString().slice(0, 10), -1); }
  let ratio = 0, days = 0, doneMinutes = 0, tasksDone = 0, busiest = null;
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const info = getDay(day), capacity = planningCapacity(info, settings);
    const usable = Math.max(60, capacity.total - capacity.blockedSleep), from = toMin(info.start), to = toMin(info.end);
    const past = !now || day < now.date, today = now && day === now.date;
    const intervals = [];
    for (const item of info.commitments) {
      if (item.isReminder || item.kind === 'break') continue;
      let a = toMin(item.start), b = toMin(item.end);
      if (item.kind === 'task') { if (!item.completed) continue; tasksDone++; }
      else if (!item.completed) {
        // Events count once they've happened (the part that's over, if one is happening now).
        if (!past && !today) continue;
        if (today) b = Math.min(b, now.minute);
      }
      a = Math.max(a, from); b = Math.min(b, to);
      if (b > a) intervals.push([a, b]);
    }
    intervals.sort((x, y) => x[0] - y[0]);
    let minutes = 0, reach = -1;
    for (const [a, b] of intervals) { if (b > reach) { minutes += b - Math.max(a, reach); reach = b; } }
    // Finished tasks that were never put on the calendar still count, on their own date.
    for (const task of tasks) if (task.completed && !scheduledTaskIds.has(task.id) && (task.date || task.deadline) === day) { minutes += task.duration || 30; tasksDone++; }
    const dayRatio = Math.min(1, minutes / usable);
    ratio += dayRatio; doneMinutes += minutes; days++;
    if (!busiest || dayRatio > busiest.ratio) busiest = { date: day, ratio: dayRatio };
  }
  const percent = days ? Math.round(ratio / days * 100) : 0;
  return { start, end, percent, doneMinutes, bookedMinutes: doneMinutes, tasksDone, days, busiest };
}

export function initProductivity({ model, storage, selectedDate, now }) {
  const $ = selector => document.querySelector(selector);
  // Keep the full explanation available without filling the calendar screen.
  const dialog = document.createElement('dialog');
  dialog.id = 'productivity-dialog';
  dialog.setAttribute('aria-labelledby', 'progress-heading');
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'secondary productivity-close'; close.textContent = 'Close';
  close.addEventListener('click', () => dialog.close());
  dialog.append(close, $('.progress-widget'));
  dialog.querySelector('.productivity-definition').textContent = 'What you actually got done: finished tasks, plus events and classes once their time has passed. Plans still ahead and reminders don’t count. It’s the share of your planning hours filled with finished things, averaged over every day in the period.';
  document.body.append(dialog);
  const summary = document.createElement('div'); summary.className = 'workspace-summary';
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.id = 'productivity-toggle'; trigger.className = 'productivity-toggle';
  trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-controls', dialog.id);
  trigger.innerHTML = '<span class="mini-productivity-ring" aria-hidden="true"><span id="mini-productivity-percent">0%</span></span><span><strong>Productivity</strong><small id="mini-productivity-period">Daily progress</small></span><span aria-hidden="true">\u203a</span>';
  trigger.addEventListener('click', () => dialog.showModal());
  summary.append(trigger, $('.now-widget'), $('.free-widget'));
  $('.dashboard-grid').before(summary);
  let period = 'day';
  try { const saved = storage.getItem('day-compass.productivity-period.v1'); if (['day', 'week', 'month'].includes(saved)) period = saved; } catch {}
  function render() {
    const planning = model.getPlanning(), scheduledTaskIds = new Set(Object.values(planning.plans).flatMap(entries => entries.filter(e => e.kind === 'task').map(e => e.taskId)));
    const date = selectedDate(), result = busyProductivity(model.getDay, model.getSettings(), date, period, { now: now?.(), tasks: planning.tasks, scheduledTaskIds });
    const ring = $('#task-progress'), word = { day: 'day', week: 'week', month: 'month' }[period];
    ring.setAttribute('aria-valuenow', result.percent);
    ring.setAttribute('aria-valuetext', `${result.percent}% of your planning time filled with finished things this ${word}`);
    $('#productivity-arc').setAttribute('stroke-dasharray', `${result.percent} 100`);
    $('#productivity-arc').style.opacity = result.percent ? '1' : '0';
    $('#productivity-percent').textContent = `${result.percent}%`;
    $('#mini-productivity-percent').textContent = `${result.percent}%`;
    $('.mini-productivity-ring').style.setProperty('--completion', `${result.percent}%`);
    $('#mini-productivity-period').textContent = `${{ day: 'Daily', week: 'Weekly', month: 'Monthly' }[period]} progress`;
    trigger.setAttribute('aria-label', `Productivity: ${result.percent}% done this ${word}. Open daily, weekly and monthly details`);
    const hours = Math.round(result.doneMinutes / 6) / 10;
    $('#progress-value').textContent = `${hours} h done this ${word}${result.tasksDone ? ` · ${result.tasksDone} task${result.tasksDone === 1 ? '' : 's'} finished` : ''}`;
    $('#productivity-message').textContent = result.percent >= 75 ? `A really productive ${word}. Remember to rest too.` : result.percent >= 40 ? `Good progress this ${word}.` : result.percent > 0 ? `A steady start. Finish a task to keep it growing.` : `Nothing finished this ${word} yet. Tick off a task to start.`;
    $('#progress-scope').textContent = period === 'month' ? dateLabel(date, { weekday: undefined, day: undefined, month: 'long', year: 'numeric' }) : period === 'week' ? `${dateLabel(result.start)} – ${dateLabel(result.end)}` : dateLabel(date, { year: 'numeric' });
    document.querySelectorAll('[data-productivity-period]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.productivityPeriod === period)));
  }
  document.querySelectorAll('[data-productivity-period]').forEach(b => b.addEventListener('click', () => { period = b.dataset.productivityPeriod; render(); try { storage.setItem('day-compass.productivity-period.v1', period); } catch { /* The current view still works without persistence. */ } }));
  return { render };
}
