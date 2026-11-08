import { zonedNow } from './clock.mjs';
import { addDays, timeLabel } from './calendar-view.mjs';

// Google provides absolute instants. Reproject them whenever the user's timezone changes.
export function importedDays(imports, timeZone) {
  const days = {}, seen = new Set();
  const dated = imports.map(item => item.date).sort(), lower = dated.length ? addDays(dated[0], -2) : '', upper = dated.length ? addDays(dated.at(-1), 2) : '';
  for (const item of imports) {
    if (!item.sourceStart || !item.sourceEnd) { (days[item.date] ??= []).push(item); continue; }
    const key = JSON.stringify([item.calendarId, item.googleId]); if (seen.has(key)) continue; seen.add(key);
    const start = zonedNow(new Date(item.sourceStart), timeZone), end = zonedNow(new Date(item.sourceEnd), timeZone);
    for (let date = start.date < lower ? lower : start.date; date <= end.date && date <= upper; date = addDays(date, 1)) {
      let a = date === start.date ? start.minute : 0, b = date === end.date ? end.minute : 1440;
      let title = item.title;
      if (date === start.date && date === end.date && b <= a && Date.parse(item.sourceEnd) > Date.parse(item.sourceStart)) { title += ` (clock change: ${timeLabel(a)}–${timeLabel(b)})`; a = Math.floor(Math.min(a, b) / 60) * 60; b = Math.max(a + 60, Math.ceil(Math.max(start.minute, end.minute) / 60) * 60); }
      if (b <= a) continue;
      (days[date] ??= []).push({ ...item, title, id: `google-${encodeURIComponent(item.calendarId)}-${item.googleId}-${date}`, date, start: timeLabel(a), end: b === 1440 ? '24:00' : timeLabel(b) });
    }
  }
  return days;
}
