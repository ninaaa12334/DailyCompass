import { minutes } from './calendar-store.mjs';
import { timeLabel } from './calendar-view.mjs';
import { zonedNow } from './clock.mjs';
import { wallTimeCandidates } from './zoned-time.mjs';

const transitionCache = new Map();
export function clockChangeIntervals(date, timeZone) {
  if (!date || !timeZone) return [];
  const key = `${date}|${timeZone}`; if (transitionCache.has(key)) return transitionCache.get(key);
  const base = Date.parse(`${date}T00:00:00Z`);
  const offset = stamp => { const local = zonedNow(new Date(stamp), timeZone); return Date.parse(`${local.date}T00:00:00Z`) + local.minute * 60000 - stamp; };
  const reserved = [];
  if (offset(base - 12 * 3600000) !== offset(base + 36 * 3600000)) {
    // Modern IANA transitions align with these quarter-hour boundaries. Reserve
    // repeated/absent wall times conservatively rather than inventing availability.
    for (let minute = 0; minute < 1440; minute += 15) if (wallTimeCandidates(date, timeLabel(minute), timeZone).length !== 1) reserved.push([minute, minute + 15]);
  }
  const merged = union(reserved); if (transitionCache.size > 1000) transitionCache.clear(); transitionCache.set(key, merged); return merged;
}

export function union(intervals) {
  const out = [];
  for (const [a, b] of intervals.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])) {
    if (out.length && a <= out.at(-1)[1]) out.at(-1)[1] = Math.max(b, out.at(-1)[1]);
    else out.push([a, b]);
  }
  return out;
}
export function routineEvents(date, settings) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (settings.routines || []).filter(r => r.weekdays.includes(weekday)).map(r => ({
    ...r, id: `routine-${r.id}-${date}`, date, kind: 'fixed', category: 'Appointments', priority: 'Medium',
    notes: '', reminder: 'off', completed: false, locked: true, sourceRoutine: true
  }));
}
export function reservedIntervals(day, settings) {
  const sleepA = minutes(settings.sleepStart), sleepB = minutes(settings.sleepEnd);
  const sleep = sleepA === sleepB ? [] : sleepA < sleepB ? [[sleepA, sleepB]] : [[0, sleepB], [sleepA, 1440]];
  const buffer = settings.travelMinutes || 0;
  return union([...sleep, ...clockChangeIntervals(day.date, settings.timeZone), ...(settings.keptFree || []).filter(x => x.date === day.date).map(x => [minutes(x.start), minutes(x.end)]), ...day.commitments.map(e => [minutes(e.start) - (e.kind === 'fixed' ? buffer : 0), minutes(e.end) + (e.kind === 'fixed' ? buffer : 0)])]);
}
export function availability(day, settings, lower = 0) {
  const start = Math.max(minutes(day.start), lower), end = minutes(day.end);
  const clip = intervals => union(intervals.map(([a, b]) => [Math.max(start, a), Math.min(end, b)]));
  const fixed = day.commitments.filter(e => e.kind === 'fixed');
  const base = clip(reservedIntervals({ ...day, commitments: fixed }, settings));
  const occupied = clip(reservedIntervals(day, settings));
  const total = intervals => intervals.reduce((sum, [a, b]) => sum + b - a, 0);
  const gaps = []; let cursor = start;
  for (const [a, b] of occupied) { if (a > cursor) gaps.push({ start: timeLabel(cursor), end: timeLabel(a), minutes: a - cursor }); cursor = Math.max(cursor, b); }
  if (end > cursor) gaps.push({ start: timeLabel(cursor), end: timeLabel(end), minutes: end - cursor });
  return { free: Math.max(0, end - start - total(occupied)), flexible: total(occupied) - total(base), gaps: gaps.filter(g => g.minutes >= (settings.minimumGap || 30)).sort((a, b) => b.minutes - a.minutes) };
}
export function activitySuggestion(tasks, gap, settings) {
  const eligible = tasks.filter(t => !t.completed && t.duration - t.spent <= gap.minutes).sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority]));
  if (eligible.length) { const t = eligible[0]; return { title: t.title, reason: `Fits ${gap.minutes} minutes; ${t.deadline ? `due ${t.deadline}` : `${t.priority.toLowerCase()} priority`}. You choose whether to schedule it.`, taskId: t.id }; }
  return { title: settings.interests ? `Time for ${settings.interests.split(',')[0].trim()}` : 'A walk, a hobby, or a little rest', reason: 'No unfinished task fits this gap. Rest is a useful choice too.' };
}
