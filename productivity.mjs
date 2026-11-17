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

// How full your time is: the share of your planning hours filled with events, Google events and
// scheduled tasks, averaged over every day in the period. A packed day scores high; a week with only
// one busy day scores low.
export function busyProductivity(getDay, settings, date, period = 'day') {
  let start = date, end = date;
  if (period === 'week') [start, , , , , , end] = weekDates(date);
  if (period === 'month') { start = `${date.slice(0, 7)}-01`; const next = new Date(`${start}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1); end = addDays(next.toISOString().slice(0, 10), -1); }
  let ratio = 0, days = 0, booked = 0, busiest = null;
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const capacity = planningCapacity(getDay(day), settings);
    ratio += capacity.ratio; booked += capacity.booked; days++;
    if (!busiest || capacity.ratio > busiest.ratio) busiest = { date: day, ratio: capacity.ratio };
  }
  const percent = days ? Math.round(ratio / days * 100) : 0;
  return { start, end, percent, bookedMinutes: booked, days, busiest };
}

export function initProductivity({ model, storage, selectedDate }) {
  const $ = selector => document.querySelector(selector);
  // Keep the full explanation available without filling the calendar screen.
  const dialog = document.createElement('dialog');
  dialog.id = 'productivity-dialog';
  dialog.setAttribute('aria-labelledby', 'progress-heading');
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'secondary productivity-close'; close.textContent = 'Close';
  close.addEventListener('click', () => dialog.close());
  dialog.append(close, $('.progress-widget'));
  dialog.querySelector('.productivity-definition').textContent = 'How much of your planning hours are filled with activities, Google events and scheduled tasks, averaged over every day in the period. A packed day scores high; a week with only one busy day scores lower.';
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
    const date = selectedDate(), result = busyProductivity(model.getDay, model.getSettings(), date, period);
    const ring = $('#task-progress'), word = { day: 'day', week: 'week', month: 'month' }[period];
    ring.setAttribute('aria-valuenow', result.percent);
    ring.setAttribute('aria-valuetext', `${result.percent}% of your planning time is filled this ${word}`);
    $('#productivity-arc').setAttribute('stroke-dasharray', `${result.percent} 100`);
    $('#productivity-arc').style.opacity = result.percent ? '1' : '0';
    $('#productivity-percent').textContent = `${result.percent}%`;
    $('#mini-productivity-percent').textContent = `${result.percent}%`;
    $('.mini-productivity-ring').style.setProperty('--completion', `${result.percent}%`);
    $('#mini-productivity-period').textContent = `${{ day: 'Daily', week: 'Weekly', month: 'Monthly' }[period]} progress`;
    trigger.setAttribute('aria-label', `Productivity: ${result.percent}% of your planning time filled this ${word}. Open daily, weekly and monthly details`);
    const hours = Math.round(result.bookedMinutes / 6) / 10;
    $('#progress-value').textContent = `${hours} h planned this ${word}`;
    $('#productivity-message').textContent = result.percent >= 75 ? `A full, busy ${word}. Remember to rest too.` : result.percent >= 40 ? `A good, balanced ${word}.` : result.percent > 0 ? `A light ${word}, with room to spare.` : `Nothing planned this ${word} yet.`;
    $('#progress-scope').textContent = period === 'month' ? dateLabel(date, { weekday: undefined, day: undefined, month: 'long', year: 'numeric' }) : period === 'week' ? `${dateLabel(result.start)} – ${dateLabel(result.end)}` : dateLabel(date, { year: 'numeric' });
    document.querySelectorAll('[data-productivity-period]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.productivityPeriod === period)));
  }
  document.querySelectorAll('[data-productivity-period]').forEach(b => b.addEventListener('click', () => { period = b.dataset.productivityPeriod; render(); try { storage.setItem('day-compass.productivity-period.v1', period); } catch { /* The current view still works without persistence. */ } }));
  return { render };
}
