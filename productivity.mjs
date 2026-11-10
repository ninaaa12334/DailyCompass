import { addDays, weekDates } from './calendar-view.mjs';
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
  dialog.querySelector('.productivity-definition').textContent = 'Completed tasks / tasks in this period, plus unfinished overdue work and active tasks without dates. School, fixed events and breaks do not count. Only tasks you mark complete earn progress; AI and passing time do not confirm completion.';
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
    const date = selectedDate(), result = taskProductivity(model.snapshot(), date, period);
    const ring = $('#task-progress');
    ring.setAttribute('aria-valuenow', result.percent);
    ring.setAttribute('aria-valuetext', result.total ? `${result.done} of ${result.total} tasks complete, ${result.percent}%` : 'No tasks in this period');
    $('#productivity-arc').setAttribute('stroke-dasharray', `${result.percent} 100`);
    $('#productivity-arc').style.opacity = result.percent ? '1' : '0';
    $('#productivity-percent').textContent = `${result.percent}%`;
    $('#mini-productivity-percent').textContent = `${result.percent}%`;
    $('.mini-productivity-ring').style.setProperty('--completion', `${result.percent}%`);
    $('#mini-productivity-period').textContent = `${{ day: 'Daily', week: 'Weekly', month: 'Monthly' }[period]} progress`;
    trigger.setAttribute('aria-label', `Productivity: ${result.percent}% complete. ${period} view. Open daily, weekly and monthly details`);
    $('#progress-value').textContent = result.total ? `${result.done} of ${result.total} tasks complete` : 'No tasks to measure';
    $('#productivity-message').textContent = !result.total ? 'School and fixed events do not earn task-completion credit.' : result.done === result.total ? 'All counted tasks are marked complete.' : `${result.total - result.done} task${result.total - result.done === 1 ? '' : 's'} still unchecked.`;
    $('#progress-scope').textContent = period === 'month' ? dateLabel(date, { weekday: undefined, day: undefined, month: 'long', year: 'numeric' }) : period === 'week' ? `${dateLabel(result.start)} – ${dateLabel(result.end)}` : dateLabel(date, { year: 'numeric' });
    document.querySelectorAll('[data-productivity-period]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.productivityPeriod === period)));
  }
  document.querySelectorAll('[data-productivity-period]').forEach(b => b.addEventListener('click', () => { period = b.dataset.productivityPeriod; render(); try { storage.setItem('day-compass.productivity-period.v1', period); } catch { /* The current view still works without persistence. */ } }));
  return { render };
}
