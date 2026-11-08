import { addDays } from './calendar-view.mjs';
export function parseQuickEntry(text, today) {
  // Deliberately small grammar; every interpretation opens an editable confirmation form.
  const match = text.trim().match(/^(.+?)\s+(today|tomorrow|20\d\d-\d\d-\d\d|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+for\s+(\d{1,3})\s*(?:minutes?|mins?)$/i);
  if (!match) throw new Error('Try “Maths revision Friday at 4pm for 45 minutes”. You can also use Add activity for other formats.');
  let [, title, word, hour, minute = '0', period, duration] = match; word = word.toLowerCase(); hour = Number(hour); minute = Number(minute); duration = Number(duration);
  if (period) { if (hour < 1 || hour > 12) throw new Error('Use hours 1–12 with am/pm.'); hour = hour % 12 + (period.toLowerCase() === 'pm' ? 12 : 0); }
  else if (hour < 1 || hour > 23 || hour <= 12) throw new Error('Please add am or pm, or use an unambiguous 24-hour time such as 16:00.');
  if (minute > 59 || duration < 5 || duration > 240 || hour * 60 + minute + duration >= 1440) throw new Error('Choose a 5–240 minute activity ending before midnight.');
  let date = word === 'today' ? today : word === 'tomorrow' ? addDays(today, 1) : word;
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(word);
  if (weekday >= 0) { const offset = (weekday - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7; date = addDays(today, offset); }
  return { title, date, start: hour * 60 + minute, end: hour * 60 + minute + duration };
}
