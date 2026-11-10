import { addDays, eventPosition, timeLabel } from './calendar-view.mjs';
import { minutes, capacity } from './calendar-store.mjs';
import { zonedNow } from './clock.mjs';
import { activityVisual } from './activity-visuals.mjs';

export function renderTimetable(grid, options) {
  const { dates, selected, focusHour, getDay, getTasks, onSelect, onAdd, onEdit, onNavigate } = options;
  const tasks = getTasks();
  grid.dataset.timeZone = options.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  grid.replaceChildren();
  grid.dataset.view = dates.length === 1 ? 'day' : 'week';
  const corner = document.createElement('div');
  corner.className = 'week-corner';
  corner.textContent = 'Time'; corner.title = grid.dataset.timeZone;
  grid.append(corner);

  for (const date of dates) {
    const day = getDay(date);
    const { ratio, booked } = options.getCapacity ? options.getCapacity(day) : capacity(day);
    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'week-day-heading';
    header.dataset.date = date;
    header.dataset.color = day.color;
    header.dataset.load = ratio === 0 ? '0' : ratio <= 1 / 3 ? '1' : ratio <= 2 / 3 ? '2' : '3';
    header.setAttribute('aria-pressed', String(date === selected));
    if (date === zonedNow(new Date(), grid.dataset.timeZone).date) header.setAttribute('aria-current', 'date');
    const label = document.createElement('span');
    label.textContent = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
    const number = document.createElement('strong');
    number.textContent = Number(date.slice(-2));
    const due = tasks.filter(task => !task.completed && task.deadline === date).length;
    const detail = document.createElement('small');
    detail.textContent = due ? `${due} due` : `${Math.round(booked / 6) / 10}h booked`;
    header.setAttribute('aria-label', `${date}, ${day.commitments.length} activities, ${booked} minutes booked within planning hours, ${due} incomplete task deadlines. Select day.`);
    header.append(label, number, detail);
    header.addEventListener('click', () => onSelect(date));
    grid.append(header);
  }

  const hours = document.createElement('div');
  hours.className = 'time-axis';
  hours.setAttribute('aria-hidden', 'true');
  for (let hour = 0; hour < 24; hour++) {
    const label = document.createElement('div');
    label.textContent = timeLabel(hour * 60);
    hours.append(label);
  }
  grid.append(hours);

  for (const date of dates) {
    const day = getDay(date);
    const column = document.createElement('div');
    column.className = 'time-day-column';
    column.dataset.date = date;
    column.setAttribute('role', 'group');
    column.setAttribute('aria-label', `Activities on ${date}`);
    if (date === selected) column.classList.add('selected-time-day');

    for (let hour = 0; hour < 24; hour++) {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'time-slot';
      slot.dataset.date = date;
      slot.dataset.hour = hour;
      slot.tabIndex = date === selected && hour === focusHour ? 0 : -1;
      slot.setAttribute('aria-label', `Add activity on ${date} at ${timeLabel(hour * 60)}`);
      slot.addEventListener('click', event => {
        const half = event.detail > 0 && event.clientY - slot.getBoundingClientRect().top >= 30 ? 30 : 0;
        onAdd(date, hour * 60 + half);
      });
      slot.addEventListener('keydown', event => {
        const moves = { ArrowDown: [date, Math.min(23, hour + 1)], ArrowUp: [date, Math.max(0, hour - 1)], ArrowLeft: [addDays(date, -1), hour], ArrowRight: [addDays(date, 1), hour], Home: [date, 0], End: [date, 23] };
        if (moves[event.key]) { event.preventDefault(); onNavigate(...moves[event.key]); }
      });
      column.append(slot);
    }

    for (const [top, height] of [[0, minutes(day.start)], [minutes(day.end), 1440 - minutes(day.end)]]) {
      const shade = document.createElement('div');
      shade.className = 'outside-planning';
      shade.style.top = `${top}px`; shade.style.height = `${height}px`;
      shade.setAttribute('aria-hidden', 'true');
      column.append(shade);
    }

    for (const item of day.commitments) {
      const position = eventPosition(item);
      const button = document.createElement(item.kind === 'break' ? 'div' : 'button');
      if (item.kind !== 'break') button.type = 'button';
      button.className = `week-event${position.height < 40 ? ' short-event' : ''}${item.completed ? ' completed' : ''}`;
      button.dataset.eventId = item.id;
      const visual = activityVisual(item); button.dataset.activity = visual.kind;
      button.style.top = `${position.top}px`; button.style.height = `${position.height}px`;
      button.title = `${item.title} · ${item.start}–${item.end}`;
      button.setAttribute('aria-label', `Edit ${item.title}, ${date}, ${item.start} to ${item.end}`);
      const title = document.createElement('strong'); title.textContent = item.title;
      const time = document.createElement('small'); time.textContent = `${item.start}–${item.end}`;
      const icon = document.createElement('span'); icon.className = 'activity-mark'; icon.textContent = visual.icon; icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.className = 'event-label'; label.append(icon, title, time); button.append(label);
      if (item.kind !== 'break') button.addEventListener('click', () => onEdit(date, item));
      column.append(button);
    }
    const nowLine = document.createElement('div');
    nowLine.className = 'now-line';
    nowLine.setAttribute('aria-hidden', 'true');
    column.append(nowLine);
    grid.append(column);
  }
  updateNowLines(grid);
}

export function updateNowLines(grid) {
  const now = zonedNow(new Date(), grid.dataset.timeZone);
  for (const column of grid.querySelectorAll('.time-day-column')) {
    const line = column.querySelector('.now-line');
    line.hidden = column.dataset.date !== now.date;
    line.style.top = `${now.minute}px`;
  }
}
