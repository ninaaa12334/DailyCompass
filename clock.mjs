// Building a date formatter is slow, so keep one per time zone (big repeating series convert thousands of times).
const zoneFormatters = new Map();
function zoneFormatter(timeZone) {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) { formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); zoneFormatters.set(timeZone, formatter); }
  return formatter;
}
export function zonedNow(now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = Object.fromEntries(zoneFormatter(timeZone).formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}
export function dateLabel(date, options = {}) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...options });
}
export function dayNumber(date) { return Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000); }
export function validDate(date) { return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date; }
// 270 -> "4 h 30 min", 240 -> "4 h", 45 -> "45 min", 0 -> "0 h".
export function durationLabel(total) {
  const value = Math.max(0, Math.round(Number(total) || 0)), hours = Math.floor(value / 60), rest = value % 60;
  if (!hours) return rest ? `${rest} min` : '0 h';
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
