import { addDays } from './calendar-view.mjs';
import { dayNumber } from './clock.mjs';
import { minutes } from './calendar-store.mjs';

export function isQuiet(minute, settings) {
  const start = minutes(settings.quietStart), end = minutes(settings.quietEnd);
  return start === end ? false : start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
export function upcomingReminders(model, now) {
  const settings = model.snapshot().settings;
  const timestamp = dayNumber(now.date) * 1440 + now.minute;
  const result = [];
  for (let offset = 0; offset < 8; offset++) {
    const date = addDays(now.date, offset);
    for (const item of model.getDay(date).commitments) {
      if (item.kind === 'break' || item.completed || item.reminder === 'off') continue;
      const lead = item.reminder === 'default' ? settings.reminderMinutes : item.reminder;
      const start = dayNumber(date) * 1440 + minutes(item.start);
      if (start < timestamp) continue;
      result.push({ key: `${item.id}|${date}|${item.start}|${lead}`, title: item.title, date, start: item.start, due: start - lead, startStamp: start, lead });
    }
  }
  return result.sort((a, b) => a.due - b.due);
}
