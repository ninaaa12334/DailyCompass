import ical from 'node-ical';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { expandGoogleEvent } from './google.mjs';
import { zonedNow } from '../clock.mjs';
import { wallToInstant } from '../zoned-time.mjs';

const value = v => typeof v === 'object' && v !== null && 'val' in v ? v.val : v;
export function parseCalendarFeed(text, timeZone, from, until) {
  if (!/^BEGIN:VCALENDAR\s*$/m.test(text) || !/^END:VCALENDAR\s*$/m.test(text)) throw new Error('Invalid calendar');
  const parsed = ical.sync.parseICS(text), imports = [];
  let count = 0;
  for (const event of Object.values(parsed)) {
    if (event.type !== 'VEVENT') continue;
    if (++count > 10000) throw new Error('Calendar too large');
    if (String(value(event.status)).toUpperCase() === 'CANCELLED') continue;
    if (!event.start || !event.end) throw new Error('Missing event time');
    const instances = ical.expandRecurringEvent(event, { from: new Date(wallToInstant(from, '00:00', timeZone)), to: new Date(wallToInstant(until, '00:00', timeZone)), expandOngoing: true, maxIterations: 10000 });
    for (const item of instances) {
      if (String(value(item.event.status)).toUpperCase() === 'CANCELLED' || String(value(item.event.transparency)).toUpperCase() === 'TRANSPARENT') continue;
      if (!Number.isFinite(+item.start) || !Number.isFinite(+item.end) || +item.end <= +item.start) throw new Error('Invalid event time');
      // Floating date-only values are parsed in the parser's local zone; recover
      // their calendar day there instead of shifting them through UTC.
      const zone = item.start.tz || event.start.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!item.isFullDay && !item.start.tz && !event.start.tz) throw new Error('Timed feed events need a timezone');
      const id = createHash('sha256').update(`${event.uid}|${item.start.toISOString()}`).digest('hex');
      const converted = {
        id, summary: String(value(item.summary) || 'Busy').slice(0, 120),
        start: item.isFullDay ? { date: zonedNow(item.start, zone).date } : { dateTime: item.start.toISOString() },
        end: item.isFullDay ? { date: zonedNow(item.end, zone).date } : { dateTime: item.end.toISOString() }
      };
      for (const imported of expandGoogleEvent('private-ical', converted, timeZone, from, until)) imports.push({ ...imported, id: imported.id.replace(/^google-/, 'ical-'), importProvider: 'ical' });
      if (imports.length > 10000) throw new Error('Too many occurrences');
    }
  }
  return imports;
}

// Parse in a bounded worker so a complex recurrence cannot stall the server.
if (!isMainThread && workerData?.type === 'ical') {
  try { parentPort.postMessage({ imports: parseCalendarFeed(workerData.text, workerData.timeZone, workerData.from, workerData.until) }); }
  catch { parentPort.postMessage({ error: true }); }
}
