import { zonedNow, validDate, dayNumber } from './clock.mjs';
import { addDays, timeLabel } from './calendar-view.mjs';

// Turns everyday wording into calendar events, e.g.
//   "I have school every weekday from 8 to 2 until June 20"
//   "football on tuesdays and thursdays 5-7pm for 10 weeks"
//   "dentist tomorrow at 3pm for 1 hour"
// Runs entirely in the browser (no paid AI). Every result is shown for review before saving.

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DAY_RE = '(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)';
const MAX_DAYS = 365;

const weekday = date => new Date(`${date}T12:00:00Z`).getUTCDay();
const dayIndex = word => DAY_SHORT.indexOf(word.slice(0, 3));
const monthIndex = word => MONTHS.findIndex(name => name.startsWith(word.slice(0, 3)));
const lastOfMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
const iso = (year, month, day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const CATEGORY_WORDS = [
  ['Study', /\b(school|class(es)?|lesson|lecture|study|homework|exam|revision|tutor(ing)?|course|uni(versity)?|college)\b/],
  ['Exercise', /\b(gym|football|soccer|basketball|training|practice|run(ning)?|swim(ming)?|tennis|yoga|workout|sport|dance|match)\b/],
  ['Work', /\b(work|job|shift|meeting|office)\b/],
  ['Appointments', /\b(doctor|dentist|appointment|therapy|checkup|haircut)\b/],
  ['Social', /\b(friends?|party|birthday|dinner|family|date)\b/],
  ['Chores', /\b(clean(ing)?|laundry|shopping|groceries|chores?)\b/]
];

// A date phrase on its own: "june 20", "20 june", "20th of june 2027", "2027-06-20", "20/6", "tomorrow", "next monday", "end of june".
function parseDate(phrase, today, notBefore = today) {
  const text = phrase.trim();
  let m;
  const pickYear = (month, day) => {
    const year = Number(today.slice(0, 4));
    const candidate = iso(year, month, day);
    return candidate < notBefore ? iso(year + 1, month, day) : candidate;
  };
  if ((m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return validDate(text) ? text : null;
  if (text === 'today') return today;
  if (text === 'tomorrow') return addDays(today, 1);
  if ((m = text.match(/^(?:the\s+)?end\s+of\s+(?:the\s+)?(month|year|this month|this year)$/))) {
    const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7)) - 1;
    return /year/.test(m[1]) ? `${year}-12-31` : lastOfMonth(year, month);
  }
  if ((m = text.match(new RegExp(`^(?:the\\s+)?end\\s+of\\s+${MONTH_RE}$`)))) {
    const month = monthIndex(m[1]), year = Number(today.slice(0, 4));
    const end = lastOfMonth(year, month);
    return end < notBefore ? lastOfMonth(year + 1, month) : end;
  }
  if ((m = text.match(new RegExp(`^(next\\s+|this\\s+)?${DAY_RE}$`)))) {
    const target = dayIndex(m[2]), offset = (target - weekday(today) + 7) % 7;
    return addDays(today, offset || 7);
  }
  if ((m = text.match(new RegExp(`^${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?$`))) || (m = text.match(new RegExp(`^(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:,?\\s+(\\d{4}))?$`)))) {
    const [month, day] = /^\d/.test(m[1]) ? [monthIndex(m[2]), Number(m[1])] : [monthIndex(m[1]), Number(m[2])];
    const date = m[3] ? iso(Number(m[3]), month, day) : pickYear(month, day);
    return validDate(date) ? date : null;
  }
  if ((m = text.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/))) {
    // Day first (20/6 = 20 June), as used in most of Europe.
    const day = Number(m[1]), month = Number(m[2]) - 1, year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : null;
    const date = year ? iso(year, month, day) : pickYear(month, day);
    return validDate(date) ? date : null;
  }
  if ((m = text.match(new RegExp(`^${MONTH_RE}(?:\\s+(\\d{4}))?$`)))) {
    // "until June" = through the end of June.
    const month = monthIndex(m[1]);
    if (m[2]) return lastOfMonth(Number(m[2]), month);
    const end = lastOfMonth(Number(today.slice(0, 4)), month);
    return end < notBefore ? lastOfMonth(Number(today.slice(0, 4)) + 1, month) : end;
  }
  return null;
}

// Pulls the first date phrase that appears after one of the given lead words.
const DATE_PHRASE = `(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[./]\\d{1,2}(?:[./]\\d{2,4})?|today|tomorrow|(?:the\\s+)?end\\s+of\\s+(?:the\\s+)?(?:month|year|this month|this year|${MONTH_RE})|(?:next\\s+|this\\s+)?${DAY_RE}|${MONTH_RE}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:,?\\s+\\d{4})?|${MONTH_RE}(?:\\s+\\d{4})?)(?![a-z])`;

function parseTimes(text) {
  const time = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)?';
  const clock = (hour, minute, period) => {
    hour = Number(hour); minute = Number(minute || 0);
    if (minute > 59 || hour > 23 || (period && (hour < 1 || hour > 12))) return null;
    return (period ? hour % 12 + (period === 'pm' ? 12 : 0) : hour) * 60 + minute;
  };
  const range = text.match(new RegExp(`(?<![\\d:/.-])(?:\\bfrom\\s+|\\bbetween\\s+)?${time}\\s*(?:to|till|until|and|-|–)\\s*${time}(?![\\d:/.])`));
  if (range) {
    let [match, h1, m1, p1, h2, m2, p2] = range;
    if (!p1 && p2) p1 = clock(h1, m1, p2) !== null && clock(h1, m1, p2) < clock(h2, m2, p2) ? p2 : (p2 === 'pm' ? 'am' : 'pm');
    if (p1 && !p2) p2 = Number(h2) <= 12 ? (clock(h2, m2, p1) > clock(h1, m1, p1) ? p1 : 'pm') : undefined;
    let a = clock(h1, m1, p1), b = clock(h2, m2, p2);
    if (a === null || b === null) return { error: 'Please give a valid start and end time, for example “8:00–14:00”.' };
    if (!p1 && !p2) {
      // No am/pm: "8 to 2" means 8:00–14:00; "5-7" (activities) means 17:00–19:00.
      if (Number(h1) <= 12 && Number(h2) <= 12) {
        if (Number(h1) < 7) { a += 720; b += 720; }
        else if (b <= a) b += 720;
      }
    }
    if (b <= a || b > 1439) return { error: 'The end time needs to be after the start time on the same day.' };
    return { start: timeLabel(a), end: timeLabel(b), match };
  }
  const single = text.match(new RegExp(`\\bat\\s+${time}(?![\\d/])`));
  if (single) {
    let a = clock(single[1], single[2], single[3]);
    if (a === null) return { error: 'What start time did you mean?' };
    if (!single[3] && Number(single[1]) >= 1 && Number(single[1]) < 7) a += 720;
    const duration = text.match(/\bfor\s+(\d+(?:\.\d+)?|an?|one|half\s+an?)\s*(minutes?|mins?|hours?|hrs?|h)\b/);
    let length = 60;
    if (duration) {
      const amount = /^half/.test(duration[1]) ? 0.5 : /^(a|an|one)$/.test(duration[1]) ? 1 : Number(duration[1]);
      length = Math.round(amount * (/^h/.test(duration[2]) ? 60 : 1));
    }
    if (length < 5 || a + length > 1439) return { error: 'Please choose at least 5 minutes, ending before midnight.' };
    return { start: timeLabel(a), end: timeLabel(a + length), match: single[0] + (duration ? ` ${duration[0]}` : ''), guessedLength: !duration };
  }
  return null;
}

export function parseScheduleRequest(prompt, settings = {}, at = new Date()) {
  const original = String(prompt || '').trim();
  let text = ` ${original.toLowerCase().replace(/\b(a|p)\.\s?m\.?/g, '$1m').replace(/[,!?]+/g, ' ').replace(/\s+/g, ' ')} `;
  const today = zonedNow(at, settings.timeZone || 'UTC').date;
  const ask = clarification => ({ clarification });
  if (original.length < 3) return ask('Tell me what to add, for example “school every weekday from 8 to 2 until June 20”.');

  // Days of the week.
  let days = null, recurring = false;
  const take = pattern => { const m = text.match(pattern); if (m) text = text.replace(m[0], ' '); return m; };
  if (take(/\b(every\s?day|each day|daily|every single day|all week)\b/)) { days = [0, 1, 2, 3, 4, 5, 6]; recurring = true; }
  else if (take(/\b(every\s+weekday|on\s+weekdays|weekdays|school\s+days|work\s?days|mon(?:day)?\s*(?:-|–|to|through|till|until)\s*fri(?:day)?)\b/)) { days = [1, 2, 3, 4, 5]; recurring = true; }
  else if (take(/\b(every\s+weekend|on\s+weekends|weekends)\b/)) { days = [0, 6]; recurring = true; }
  if (!days) {
    const rangeOfDays = take(new RegExp(`\\b(?:every\\s+|on\\s+)?${DAY_RE}s?\\s*(?:-|–|to|through|till|until)\\s*${DAY_RE}s?\\b`));
    if (rangeOfDays) {
      const from = dayIndex(rangeOfDays[1]), to = dayIndex(rangeOfDays[2]);
      days = []; for (let d = from; ; d = (d + 1) % 7) { days.push(d); if (d === to) break; }
      recurring = true;
    }
  }
  if (!days) {
    const listPattern = new RegExp(`\\b(every|each|on)?\\s*((?:${DAY_RE}s?(?:\\s*(?:,|and|&|/|\\+)\\s*|\\s+))*${DAY_RE}s?)\\b(?!\\s*\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE})`);
    const list = text.match(listPattern);
    // A single plain day ("on monday") is a one-off date, unless it is plural or says every/each.
    if (list) {
      const words = list[2].match(new RegExp(DAY_RE + 's?', 'g'));
      const plural = words.some(w => /s$/.test(w) && !/^(tues|thurs)$/.test(w) || /days$/.test(w));
      if (list[1] === 'every' || list[1] === 'each' || plural || words.length > 1 || /\b(weekly|every week|each week)\b/.test(text)) {
        days = [...new Set(words.map(w => dayIndex(w.replace(/s$/, ''))))].sort();
        recurring = true; text = text.replace(list[0], ' ');
      }
    }
  }
  take(/\b(every week|each week|weekly)\b/);

  // Times.
  const times = parseTimes(text);
  if (times?.error) return ask(times.error);
  if (!times) return ask('What time? For example “from 8 to 2”, “5–7 pm” or “at 6 pm for 1 hour”.');
  text = text.replace(times.match, ' ');

  // End date: "until June 20", "till the end of June", "for 8 weeks".
  let from = today, until = null, m;
  const startMatch = text.match(new RegExp(`\\b(?:starting|beginning|from|start(?:ing)? on)\\s+(?:on\\s+)?${DATE_PHRASE}`));
  if (startMatch) {
    from = parseDate(startMatch[1], today);
    if (!from) return ask('When should it start? Try “starting December 1”.');
    text = text.replace(startMatch[0], ' ');
  }
  const untilMatch = text.match(new RegExp(`\\b(?:until|till|til|through|thru|up to|ending(?: on)?|ends?(?: on)?|to)\\s+(?:the\\s+)?${DATE_PHRASE}`));
  if (untilMatch) {
    until = parseDate(untilMatch[1].replace(/^the\s+/, ''), today, from);
    if (!until) return ask('Until which date? Try “until June 20” or “until 2027-06-20”.');
    text = text.replace(untilMatch[0], ' ');
  } else if ((m = text.match(/\bfor\s+(?:the\s+next\s+)?(\d+|a|one|two|three|four|five|six|eight|ten|twelve)\s+(weeks?|months?)\b/))) {
    const words = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12 };
    const amount = words[m[1]] ?? Number(m[1]);
    if (/week/.test(m[2])) until = addDays(from, amount * 7 - 1);
    else { const d = new Date(`${from}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + amount); until = addDays(d.toISOString().slice(0, 10), -1); }
    text = text.replace(m[0], ' ');
  }

  // A one-off date: "tomorrow", "on friday", "on June 3".
  let single = null;
  if (!recurring) {
    const one = text.match(new RegExp(`\\b(?:on\\s+)?${DATE_PHRASE}`));
    if (one) { single = parseDate(one[1].replace(/^the\s+/, ''), today); if (single) text = text.replace(one[0], ' '); }
  }

  if (recurring && !until) return { clarification: 'Until when should it repeat? Add an end date, for example “until June 20” or “for 10 weeks”.', needsEnd: true };
  if (!recurring && !single && until) { recurring = true; days = [0, 1, 2, 3, 4, 5, 6]; }
  if (from < today) return ask('That start date has already passed. Which upcoming date should it start?');
  let capped = false;
  if (recurring) {
    if (until < from) return ask('The end date is before the start date. Which end date did you mean?');
    if (dayNumber(until) - dayNumber(from) > MAX_DAYS) { until = addDays(from, MAX_DAYS); capped = true; }
  }
  const date = single || from;
  if (!recurring && date < today) return ask('That day has passed. Which upcoming day did you mean?');

  // Title: whatever remains after removing the date/time words and filler.
  let title = text
    .replace(/\b(i have|i've got|i got|i go to|i attend|i do|i need to|i want to|i'd like to|please|can you|could you|add|put|schedule|create|make|set up|block|book|remind me (?:about|of|to)?|to my calendar|in my calendar|on my calendar|to the calendar|my calendar|calendar|every|each|on|at|from|in the|the|a|an|and|for|me|i|have|has|got|go|to|there is|there's|we have)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  title = title.replace(/^(my|our)\s+/, '').trim();
  if (!title) title = 'Event';
  title = title.charAt(0).toUpperCase() + title.slice(1);
  if (title.length > 120) title = title.slice(0, 120);
  const lower = original.toLowerCase();
  const category = (CATEGORY_WORDS.find(([, pattern]) => pattern.test(lower)) || ['Personal projects'])[0];

  const dates = [];
  if (recurring) { for (let d = from; d <= until; d = addDays(d, 1)) if (days.includes(weekday(d))) dates.push(d); }
  else dates.push(date);
  if (!dates.length) return ask('None of those days fall between the start and end date. Check the days or dates.');
  return { title, category, start: times.start, end: times.end, recurring, days: recurring ? days : [weekday(date)], from: recurring ? from : date, until: recurring ? until : date, dates, capped, guessedLength: Boolean(times.guessedLength) };
}

// Calendar inputs for planner-store saveActivities(): one daily series for every day,
// otherwise one weekly series per weekday (the planner supports daily/weekly repeats).
export function scheduleInputs(plan, makeId) {
  const base = { kind: 'fixed', title: plan.title, category: plan.category, priority: 'Medium', start: plan.start, end: plan.end, notes: '', reminder: 'default', completed: false, locked: false };
  if (!plan.recurring) return [{ ...base, id: makeId(), date: plan.from, repeat: 'none', repeatUntil: '' }];
  if (plan.days.length === 7) return [{ ...base, id: makeId(), date: plan.dates[0], repeat: 'daily', repeatUntil: plan.until }];
  return plan.days.map(day => plan.dates.find(date => weekday(date) === day)).filter(Boolean)
    .map(first => ({ ...base, id: makeId(), date: first, repeat: 'weekly', repeatUntil: plan.until }));
}

export function describeSchedule(plan) {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const order = [1, 2, 3, 4, 5, 6, 0].filter(d => plan.days.includes(d));
  const dayText = !plan.recurring ? null : plan.days.length === 7 ? 'Every day' : order.join() === '1,2,3,4,5' ? 'Every weekday (Mon–Fri)' : order.join() === '6,0' ? 'Every weekend' : `Every ${order.map(d => names[d]).join(', ')}`;
  return { dayText, count: plan.dates.length };
}
