import { zonedNow, validDate } from './clock.mjs';
import { minutes } from './calendar-store.mjs';
import { addDays } from './calendar-view.mjs';
// Wall-clock input stays unchanged. Ambiguous DST times require a choice; gaps are rejected.
export function wallTimeCandidates(date, time, timeZone) {
  if (!validDate(date)) throw new Error('Invalid date.');
  if (time === '24:00') return wallTimeCandidates(addDays(date, 1), '00:00', timeZone);
  const minute = minutes(time), base = Date.parse(`${date}T00:00:00Z`) + minute * 60000;
  const offsets = new Set();
  for (let hour = -36; hour <= 36; hour += 6) {
    const instant = base + hour * 3600000, local = zonedNow(new Date(instant), timeZone);
    offsets.add(Date.parse(`${local.date}T00:00:00Z`) + local.minute * 60000 - instant);
  }
  return [...offsets].map(offset => base - offset).filter(stamp => { const local = zonedNow(new Date(stamp), timeZone); return local.date === date && local.minute === minute; }).sort();
}
export function wallToInstant(date, time, timeZone, choice) {
  const values = wallTimeCandidates(date, time, timeZone);
  if (!values.length) throw new Error(`${date} ${time} does not exist in ${timeZone} because the clocks change. Choose another time.`);
  if (values.length > 1 && !['earlier', 'later'].includes(choice)) throw new Error(`${date} ${time} occurs twice in ${timeZone}. Choose the earlier or later occurrence.`);
  return values[choice === 'later' ? values.length - 1 : 0];
}
