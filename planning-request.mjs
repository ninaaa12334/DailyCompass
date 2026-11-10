import { zonedNow, validDate } from './clock.mjs';
import { addDays, timeLabel } from './calendar-view.mjs';
import { minutes } from './calendar-store.mjs';

// Resolve common wording before AI chooses activities. Undated requests mean
// today in the user's timezone; ambiguous clock times ask instead of guessing.
export function interpretPlanningRequest(prompt, settings, at = new Date()) {
  const text = String(prompt || '').toLowerCase().replace(/\b(a|p)\.?m\.?\b/g, '$1m');
  const today = zonedNow(at, settings.timeZone).date;
  let date = today, start = settings.planningStart, end = settings.planningEnd;
  const ask = clarification => ({ clarification, date, start, end });
  const dates = [...new Set(text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) || [])];
  const weekdays = [...text.matchAll(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g)];
  const relative = text.match(/\b(today|tomorrow)\b/g) || [];
  if (dates.length > 1 || new Set(weekdays.map(m => m[2])).size > 1 || new Set(relative).size > 1) return ask('Which one day should I plan? Please use a separate request for each day.');
  if (dates.length) { if (!validDate(dates[0])) return ask('That date is not valid. Which date did you mean?'); date = dates[0]; }
  else if (relative.includes('tomorrow')) date = addDays(today, 1);
  else if (weekdays.length) {
    const match = weekdays[0], target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(match[2]);
    const offset = (target - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7;
    date = addDays(today, offset || (match[1] ? 7 : 0));
  } else if (/\b(yesterday|next week|next month|weekend|january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(text)) return ask('Which day do you mean? Write tomorrow, a weekday, or a date like 2026-11-20.');
  const time = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?';
  const range = text.match(new RegExp(`(?<![\\d:-])(?:\\bfrom\\s+|\\bbetween\\s+)?${time}\\s*(?:to|until|and|[-–])\\s*${time}(?![\\d:-])`, 'i'));
  const clock = (hour, minute, period) => {
    hour = Number(hour); minute = Number(minute || 0);
    if (minute > 59 || hour > 23 || (period && (hour < 1 || hour > 12))) return null;
    return (period ? hour % 12 + (period === 'pm' ? 12 : 0) : hour) * 60 + minute;
  };
  if (range) {
    let [, h1, m1, p1, h2, m2, p2] = range;
    if (!p1 && p2 && Number(h1) <= 12) { p1 = p2; if (clock(h1, m1, p1) >= clock(h2, m2, p2)) p1 = p2 === 'pm' ? 'am' : 'pm'; }
    if (p1 && !p2 && Number(h2) <= 12) p2 = p1;
    if (!p1 && !p2 && ((Number(h1) >= 1 && Number(h1) <= 12 && !m1) || (Number(h2) >= 1 && Number(h2) <= 12 && !m2))) return ask('Do you mean am or pm? Add it to your message, for example “from 5 to 6 pm”.');
    const a = clock(h1, m1, p1), b = clock(h2, m2, p2);
    if (a === null || b === null || b <= a) return ask('Please give a valid start and end time on the same day, for example “from 5 to 6 pm”.');
    start = timeLabel(a); end = timeLabel(b);
  } else {
    const single = text.match(new RegExp(`\\bat\\s+${time}(?!\\d)`, 'i'));
    if (single) {
      const [, hour, minute, period] = single;
      if (!period && Number(hour) >= 1 && Number(hour) <= 12 && !minute) return ask('Is that am or pm? Please add it to your message.');
      const a = clock(hour, minute, period), duration = text.match(/\bfor\s+(\d+(?:\.5)?)\s*(minutes?|mins?|hours?|hrs?)\b/);
      if (a === null) return ask('What start time did you mean?');
      if (!duration) return ask('How long would you like to spend? Try “at 5 pm for 45 minutes”.');
      const length = Number(duration[1]) * (/^(hour|hr)/.test(duration[2]) ? 60 : 1);
      if (!Number.isInteger(length) || length < 5 || a + length >= 1440) return ask('Please choose at least 5 minutes, ending before midnight.');
      start = timeLabel(a); end = timeLabel(a + length);
    } else {
      const part = /\bafternoon\b/.test(text) ? [720, 1080] : /\bevening\b/.test(text) ? [1020, 1260] : /\bmorning\b/.test(text) ? [360, 720] : null;
      if (part) { start = timeLabel(Math.max(minutes(start), part[0])); end = timeLabel(Math.min(minutes(end), part[1])); }
    }
  }
  if (date < today) return ask('That day has passed. Did you mean tomorrow or another upcoming day?');
  if (minutes(start) >= minutes(end)) return ask('That is outside your usual planning hours. Which time would you like instead?');
  return { date, start, end };
}
