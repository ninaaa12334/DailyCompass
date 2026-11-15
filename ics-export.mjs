import { wallToInstant } from './zoned-time.mjs';

// Builds a standard calendar file (.ics) of upcoming events, each with its reminder as an alarm.
// Opening it on a phone adds the events to the phone's own calendar, which then reminds you
// even when Day Compass is closed. UIDs are stable, so exporting again updates rather than duplicates
// in calendars that support it.

const escape = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utc = stamp => new Date(stamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Lines longer than 75 bytes must be folded (continued on the next line after a space).
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = []; let current = '';
  for (const char of line) {
    if (new TextEncoder().encode(current + char).length > (parts.length ? 74 : 75)) { parts.push(current); current = ''; }
    current += char;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function upcomingEvents(state, fromDate) {
  const events = [];
  const taskTitles = new Map(state.tasks.map(task => [task.id, task]));
  for (const [date, day] of Object.entries(state.days)) {
    if (date < fromDate) continue;
    for (const item of day.commitments) if (!item.completed) events.push({ ...item, date });
  }
  for (const [date, entries] of Object.entries(state.plans || {})) {
    if (date < fromDate) continue;
    for (const entry of entries) {
      if (entry.kind !== 'task' || entry.completed) continue;
      const task = taskTitles.get(entry.taskId); if (!task || task.completed) continue;
      events.push({ ...entry, date, title: task.title, notes: task.notes, category: task.category, reminder: task.reminder });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

export function buildCalendarFile(state, { fromDate, now = Date.now() } = {}) {
  const settings = state.settings, zone = settings.timeZone;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Day Compass//Planner export//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Day Compass'];
  let count = 0;
  for (const item of upcomingEvents(state, fromDate)) {
    let start, end;
    try {
      start = wallToInstant(item.date, item.start, zone, item.dstChoice || 'earlier');
      end = item.end === '24:00' ? wallToInstant(item.date, '24:00', zone, 'earlier') : wallToInstant(item.date, item.end, zone, item.dstChoice || 'earlier');
    } catch { continue; } // A time skipped by a clock change can't be exported.
    if (end <= start) continue;
    const lead = item.reminder === 'off' ? null : item.reminder === 'default' || item.reminder === undefined ? settings.reminderMinutes : Number(item.reminder);
    lines.push('BEGIN:VEVENT', `UID:${escape(item.id)}@daycompass`, `DTSTAMP:${utc(now)}`, `DTSTART:${utc(start)}`, `DTEND:${utc(end)}`, `SUMMARY:${escape(item.title)}`);
    if (item.notes) lines.push(`DESCRIPTION:${escape(item.notes)}`);
    if (item.category) lines.push(`CATEGORIES:${escape(item.category)}`);
    if (lead !== null && Number.isFinite(lead)) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(item.title)}`, `TRIGGER:-PT${Math.max(0, Math.round(lead))}M`, 'END:VALARM');
    lines.push('END:VEVENT');
    count++;
  }
  lines.push('END:VCALENDAR');
  return { text: lines.map(fold).join('\r\n') + '\r\n', count };
}

export function downloadCalendarFile(text, name = 'day-compass.ics') {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
