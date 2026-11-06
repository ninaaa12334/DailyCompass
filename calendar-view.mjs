import { dateKey, minutes } from './calendar-store.mjs';

export function addDays(date, amount) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return dateKey(value);
}

export function weekDates(date) {
  const value = new Date(`${date}T12:00:00`);
  const monday = addDays(date, -((value.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function monthDates(date) {
  const first = `${date.slice(0, 7)}-01`;
  const monday = weekDates(first)[0];
  return Array.from({ length: 42 }, (_, index) => addDays(monday, index));
}

export function timeLabel(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

// One minute = one vertical pixel; changing the scale later stays in one place.
export function eventPosition(event) {
  return { top: minutes(event.start), height: minutes(event.end) - minutes(event.start) };
}
