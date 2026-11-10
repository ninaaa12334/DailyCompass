import { capacity, minutes } from './calendar-store.mjs';
import { storage } from './runtime.mjs';
import { addDays, weekDates, monthDates } from './calendar-view.mjs';
import { renderTimetable, updateNowLines } from './timetable-ui.mjs';
import { zonedNow, dateLabel } from './clock.mjs';
import { planningCapacity } from './scheduler.mjs';
import { activityVisual } from './activity-visuals.mjs';

export function initCalendar(model, handlers) {
  const $ = selector => document.querySelector(selector);
  const now = () => zonedNow(new Date(), model.snapshot().settings.timeZone);
  let selected = now().date;
  const compactScreen = window.matchMedia('(max-width: 580px)');
  let view = compactScreen.matches ? 'day' : 'week';
  try { const saved = storage.getItem('day-compass.calendar-view.v1'); if (['day', 'week', 'month'].includes(saved)) view = saved; } catch {}
  let focusHour = 9, lastTimedKey = '';
  function choose(date) { selected = date; render(); handlers.onSelection?.(); }
  function open(date, item, start) { choose(date); if (item?.kind !== 'break') handlers.onActivity({ date, item, start }); }
  function renderMonth() {
    const grid = $('#calendar-days'); grid.replaceChildren();
    for (const date of monthDates(selected)) {
      const day = model.getDay(date), { ratio, booked } = planningCapacity(day, model.snapshot().settings);
      const due = model.getTasks().filter(task => !task.completed && task.deadline === date).length;
      const cell = document.createElement('div'); cell.className = 'month-cell';
      if (date.slice(0, 7) !== selected.slice(0, 7)) cell.classList.add('other-month');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'calendar-day'; button.textContent = Number(date.slice(-2));
      Object.assign(button.dataset, { date, color: day.color, load: ratio === 0 ? '0' : ratio <= 1 / 3 ? '1' : ratio <= 2 / 3 ? '2' : '3', due: due ? 'true' : 'false' });
      button.setAttribute('aria-pressed', String(date === selected));
      button.setAttribute('aria-label', `${dateLabel(date)}, ${day.commitments.length} activities, ${booked} minutes booked, ${due} deadlines. Select day.`);
      const markers = document.createElement('span'); markers.className = 'mobile-month-indicator'; markers.setAttribute('aria-hidden', 'true'); markers.textContent = day.commitments.length ? '•'.repeat(Math.min(3, day.commitments.length)) : ''; button.append(markers);
      if (date === now().date) button.setAttribute('aria-current', 'date');
      button.addEventListener('click', () => { choose(date); [...grid.querySelectorAll('.calendar-day')].find(node => node.dataset.date === date)?.focus(); }); cell.append(button);
      const events = [...day.commitments].sort((a, b) => minutes(a.start) - minutes(b.start));
      for (const item of events.slice(0, 3)) {
        const event = document.createElement(item.kind === 'break' ? 'div' : 'button');
        if (item.kind !== 'break') event.type = 'button';
        event.className = `month-event${item.completed ? ' completed' : ''}`; event.dataset.activity = activityVisual(item).kind; event.textContent = `${item.start} ${item.title}`; event.title = `${item.title}: ${item.start}–${item.end}`;
        if (item.kind !== 'break') event.addEventListener('click', () => open(date, item)); cell.append(event);
      }
      if (events.length > 3) { const more = document.createElement('button'); more.type = 'button'; more.className = 'month-more'; more.textContent = `+${events.length - 3} more`; more.addEventListener('click', () => { view = 'day'; choose(date); }); cell.append(more); }
      if (due) { const note = document.createElement('small'); note.className = 'month-due'; note.textContent = `${due} due`; cell.append(note); }
      grid.append(cell);
    }
  }
  function renderMobileWeek() {
    const strip = $('#mobile-week-days'); strip.replaceChildren();
    for (const date of weekDates(selected)) {
      const day = model.getDay(date), stats = planningCapacity(day, model.snapshot().settings);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'mobile-week-day';
      Object.assign(button.dataset, { date, color: day.color, load: stats.ratio === 0 ? '0' : stats.ratio <= 1 / 3 ? '1' : stats.ratio <= 2 / 3 ? '2' : '3' });
      button.setAttribute('aria-pressed', String(date === selected));
      button.setAttribute('aria-label', `${dateLabel(date)}, ${day.commitments.length} activities, ${stats.free} minutes free. Show timeline.`);
      if (date === now().date) button.setAttribute('aria-current', 'date');
      const weekday = document.createElement('span'); weekday.textContent = dateLabel(date, { weekday: 'short', month: undefined, day: undefined });
      const number = document.createElement('strong'); number.textContent = Number(date.slice(-2));
      button.append(weekday, number);
      button.addEventListener('click', () => { choose(date); [...strip.querySelectorAll('button')].find(node => node.dataset.date === date)?.focus(); }); strip.append(button);
    }
  }
  function renderMobileAgenda() {
    $('#mobile-agenda-heading').textContent = dateLabel(selected);
    const list = $('#mobile-agenda-list'); list.replaceChildren();
    const activities = model.getDay(selected).commitments.sort((a, b) => minutes(a.start) - minutes(b.start));
    $('#mobile-agenda-empty').textContent = activities.length ? '' : 'A clear day. Tap + Add to plan something.';
    for (const item of activities) {
      const li = document.createElement('li');
      const entry = document.createElement(item.kind === 'break' ? 'div' : 'button');
      entry.className = `mobile-agenda-entry${item.completed ? ' completed' : ''}`;
      const visual = activityVisual(item); entry.dataset.activity = visual.kind;
      if (item.kind !== 'break') { entry.type = 'button'; entry.setAttribute('aria-label', `Edit ${item.title}, ${item.start} to ${item.end}`); entry.addEventListener('click', () => open(selected, item)); }
      const time = document.createElement('span'); time.className = 'mobile-agenda-time'; time.textContent = `${item.start}–${item.end}`;
      const title = document.createElement('strong'); title.className = 'task-title'; title.textContent = item.title;
      const icon = document.createElement('span'); icon.className = 'agenda-activity-mark'; icon.textContent = visual.icon; icon.setAttribute('aria-hidden', 'true');
      entry.append(time, title, icon); li.append(entry); list.append(li);
    }
  }
  function render() {
    const compact = compactScreen.matches;
    const dates = view === 'day' ? [selected] : weekDates(selected);
    const shortDate = date => dateLabel(date, { weekday: undefined, year: undefined });
    $('#calendar-month').textContent = view === 'month' ? dateLabel(selected, { weekday: undefined, month: 'long', day: undefined, year: 'numeric' }) : view === 'day' ? dateLabel(selected, { year: compact ? undefined : 'numeric' }) : compact ? `${shortDate(dates[0])} – ${shortDate(dates[6])}` : `${dateLabel(dates[0])} – ${dateLabel(dates[6], { year: 'numeric' })}`;
    $('#previous-period').setAttribute('aria-label', `Previous ${view}`); $('#next-period').setAttribute('aria-label', `Next ${view}`);
    document.querySelectorAll('[data-calendar-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.calendarView === view)));
    $('#month-view').hidden = view !== 'month'; $('#week-view').hidden = view === 'month';
    $('#mobile-week-days').hidden = !compact || view === 'month';
    $('#mobile-month-agenda').hidden = !compact || view === 'week';
    $('#calendar-timezone').textContent = `Times in ${model.snapshot().settings.timeZone}`;
    $('#calendar-instructions').textContent = compact ? view === 'month' ? 'Tap a date to see its activities below. Dots mark activities.' : view === 'week' ? 'Choose a day above its timeline. Tap a time to add an activity.' : 'Tap a time to add, or an activity to edit.' : view === 'month' ? 'Select a date for its agenda. Click an activity to edit it.' : 'Click a time to add an activity. Arrow keys move between slots. Hatched areas are outside planning hours.';
    if (compact && view !== 'month') renderMobileWeek();
    if (compact && view !== 'week') { renderMobileAgenda(); if (view === 'day') $('#week-view').before($('#mobile-month-agenda')); else $('#month-view').after($('#mobile-month-agenda')); }
    if (view === 'month') renderMonth();
    else {
      renderTimetable($('#week-grid'), { dates: compact && view === 'week' ? [selected] : dates, selected, focusHour, timeZone: model.snapshot().settings.timeZone, getDay: model.getDay, getTasks: model.getTasks, getCapacity: day => planningCapacity(day, model.snapshot().settings),
        onSelect: date => choose(date), onAdd: (date, start) => open(date, null, start), onEdit: (date, item) => open(date, item),
        onNavigate: (date, hour) => { focusHour = hour; choose(date); [...document.querySelectorAll('.time-slot')].find(node => node.dataset.date === date && Number(node.dataset.hour) === hour)?.focus(); }
      });
      // Reposition only when the date/view changes, never on an ordinary task update.
      const timedKey = `${selected}|${view}|${compact}`;
      if (timedKey !== lastTimedKey) {
        const first = model.getDay(selected).commitments.sort((a, b) => minutes(a.start) - minutes(b.start))[0];
        const target = selected === now().date ? Math.max(0, now().minute - 60) : first ? Math.max(0, minutes(first.start) - 30) : minutes(model.getDay(selected).start);
        $('#week-view').scrollTop = target; lastTimedKey = timedKey;
      }
    }
    const day = model.getDay(selected), stats = planningCapacity(day, model.snapshot().settings);
    $('#selected-day').textContent = dateLabel(selected, { year: 'numeric' });
    $('#day-hours').textContent = `Planning: ${day.start}–${day.end} · ${model.snapshot().settings.timeZone}`;
    $('#day-capacity').textContent = `${stats.booked} min booked · ${stats.free} min free${stats.blockedSleep ? ` · ${stats.blockedSleep} min reserved for sleep` : ''}`;
    $('#capacity-fill').style.width = `${stats.ratio * 100}%`;
    const list = $('#day-commitments'); list.replaceChildren();
    for (const item of [...day.commitments].sort((a, b) => minutes(a.start) - minutes(b.start))) {
      const li = document.createElement('li'); if (item.completed) li.className = 'completed';
      const title = document.createElement('span'); title.className = 'task-content task-title'; title.textContent = `${item.start}–${item.end} · ${item.title}${item.locked ? ' [locked]' : ''}${item.completed ? ' [completed]' : ''}`; li.append(title);
      if (item.kind !== 'break') { const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'secondary'; edit.textContent = 'Edit'; edit.setAttribute('aria-label', `Edit ${item.title}`); edit.addEventListener('click', () => open(selected, item)); li.append(edit); }
      list.append(li);
    }
    if (!day.commitments.length) { const empty = document.createElement('li'); empty.textContent = 'Nothing planned yet. Add an activity or generate a plan.'; list.append(empty); }
    const due = model.getTasks().filter(task => !task.completed && task.deadline && task.deadline <= selected);
    $('#day-deadlines').textContent = due.length ? `Due or overdue: ${due.map(task => `${task.title} (${task.deadline})`).join(', ')}` : 'No incomplete deadlines on or before this date.';
  }
  for (const id of ['#calendar-add', '#setup-day']) $(id).addEventListener('click', () => open(selected));
  $('#mobile-agenda-add').addEventListener('click', () => open(selected));
  $('#edit-day-hours').addEventListener('click', () => handlers.onHours(selected));
  document.querySelectorAll('[data-calendar-view]').forEach(button => button.addEventListener('click', () => { view = button.dataset.calendarView; render(); try { storage.setItem('day-compass.calendar-view.v1', view); } catch { $('#calendar-status').textContent = 'View changed but the preference could not be saved.'; } }));
  for (const [id, direction] of [['#previous-period', -1], ['#next-period', 1]]) $(id).addEventListener('click', () => {
    if (view === 'month') { const d = new Date(`${selected}T12:00:00`), last = new Date(d.getFullYear(), d.getMonth() + direction + 1, 0).getDate(); selected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d.getDate(), last)).padStart(2, '0')}`; const moved = new Date(d.getFullYear(), d.getMonth() + direction, Math.min(d.getDate(), last), 12); selected = `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}-${String(moved.getDate()).padStart(2, '0')}`; }
    else selected = addDays(selected, direction * (view === 'week' ? 7 : 1));
    render(); handlers.onSelection?.();
  });
  $('#calendar-today').addEventListener('click', () => choose(now().date));
  compactScreen.addEventListener('change', () => { lastTimedKey = ''; render(); });
  setInterval(() => { if (!document.hidden && view !== 'month') updateNowLines($('#week-grid')); }, 60000);
  render();
  return { getSelectedDate: () => selected, selectDate: choose, refresh: render };
}
