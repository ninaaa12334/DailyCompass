import { dateKey, minutes, capacity } from './calendar-store.mjs';

export function summarizeCommitments(day, time) {
  const events = [...day.commitments].sort((a, b) => minutes(a.start) - minutes(b.start));
  return {
    current: events.find(item => minutes(item.start) <= time && minutes(item.end) > time),
    next: events.find(item => minutes(item.start) > time)
  };
}

export function initDashboard(getTasks, calendar, tasksAvailable = () => true) {
  const $ = selector => document.querySelector(selector);
  function render() {
    const now = new Date();
    const today = dateKey(now);
    const time = now.getHours() * 60 + now.getMinutes();
    $('#dashboard-date').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
    if (calendar) {
    const { current, next } = summarizeCommitments(calendar.getDay(today), time);
    $('#now-heading').textContent = current ? current.title : 'A little breathing room';
    $('#now-detail').textContent = current ? `Until ${current.end}` : 'No fixed commitment right now.';
    $('#next-activity').textContent = next ? `Next: ${next.title} · ${next.start}` : 'No more fixed commitments today.';
    const selected = calendar.getSelectedDate();
    $('#free-minutes').textContent = capacity(calendar.getDay(selected)).free;
    $('#free-date').textContent = `Unbooked on ${new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    } else {
      $('#now-heading').textContent = 'Calendar unavailable';
      $('#now-detail').textContent = 'Check the calendar storage message below.';
      $('#next-activity').textContent = 'Could not read commitments.';
      $('#free-minutes').textContent = '—';
      $('#free-date').textContent = 'Calendar data could not be read.';
    }
    const tasks = getTasks();
    const completed = tasks.filter(task => task.completed).length;
    $('#progress-value').textContent = `${completed} / ${tasks.length}`;
    $('#task-progress').max = tasks.length || 1;
    $('#task-progress').value = completed;
    $('#task-progress').hidden = !tasksAvailable();
    if (!tasksAvailable()) $('#progress-value').textContent = 'Unavailable';
  }
  document.addEventListener('tasks-changed', render);
  document.addEventListener('calendar-changed', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  setInterval(render, 60000);
  render();
}
