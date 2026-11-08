import { minutes } from './calendar-store.mjs';
import { timeLabel } from './calendar-view.mjs';

export function mergeIntervals(intervals) {
  const result = [];
  for (const [start, end] of intervals.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])) {
    if (result.length && start <= result.at(-1)[1]) result.at(-1)[1] = Math.max(end, result.at(-1)[1]);
    else result.push([start, end]);
  }
  return result;
}
export function sleepIntervals(settings) {
  const a = minutes(settings.sleepStart), b = minutes(settings.sleepEnd);
  if (a === b) return [];
  return a < b ? [[a, b]] : [[0, b], [a, 1440]];
}
export function planningCapacity(day, settings) {
  const start = minutes(day.start), end = minutes(day.end);
  const clip = intervals => intervals.map(([a, b]) => [Math.max(start, a), Math.min(end, b)]).filter(([a, b]) => b > a);
  const length = intervals => mergeIntervals(clip(intervals)).reduce((sum, [a, b]) => sum + b - a, 0);
  const activities = day.commitments.map(item => [minutes(item.start), minutes(item.end)]);
  const booked = length(activities), occupied = length([...activities, ...sleepIntervals(settings)]);
  const blockedSleep = occupied - booked, total = end - start;
  return { booked, total, blockedSleep, free: total - occupied, ratio: total === blockedSleep ? 0 : booked / (total - blockedSleep) };
}
export function generatePlan({ date, day, tasks, existing = [], otherPlans = {}, settings, now }) {
  const lower = Math.max(minutes(day.start), date === now.date ? Math.ceil(now.minute / 5) * 5 : 0);
  const upper = minutes(day.end);
  const preserved = existing.filter(item => item.completed || item.locked || (date === now.date && minutes(item.start) < now.minute));
  const preservedTaskIds = new Set(preserved.filter(item => item.kind === 'task').map(item => item.taskId));
  for (const item of existing) if (item.kind === 'break' && preservedTaskIds.has(item.taskId) && !preserved.some(entry => entry.id === item.id)) preserved.push(item);
  const candidates = tasks.filter(task => !task.completed && (!task.date || task.date <= date) && task.duration > task.spent);
  const result = { entries: structuredClone(preserved), unscheduled: [], warnings: [], reasons: {} };
  if (date < now.date) {
    result.entries = structuredClone(existing);
    result.unscheduled = candidates.map(task => ({ taskId: task.id, title: task.title, reason: 'This date is in the past. Choose today or a future date.' }));
    return result;
  }
  const sleep = sleepIntervals(settings);
  for (const item of day.commitments) if (sleep.some(([a, b]) => minutes(item.start) < b && minutes(item.end) > a)) result.warnings.push(`${item.title} overlaps your sleep hours. Adjust the commitment or sleep preferences before applying a new plan.`);
  for (const item of preserved) {
    const a = minutes(item.start), b = minutes(item.end);
    if (a < minutes(day.start) || b > upper || sleep.some(([x, y]) => a < y && b > x)) result.warnings.push(`Preserved activity ${item.title || item.id} is outside planning hours or overlaps sleep. Adjust it before applying a new plan.`);
  }
  const occupied = mergeIntervals([...day.commitments, ...preserved].map(item => [minutes(item.start), minutes(item.end)]).concat(sleep));
  const gaps = [];
  let cursor = lower;
  for (const [start, end] of occupied) {
    if (start > cursor && cursor < upper) gaps.push([cursor, Math.min(start, upper)]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < upper) gaps.push([cursor, upper]);
  const alreadyPlaced = new Set(preserved.filter(item => item.kind === 'task' && item.taskId && (item.locked || item.completed || minutes(item.end) > now.minute || date !== now.date)).map(item => item.taskId));
  const priorities = { High: 0, Medium: 1, Low: 2 };
  candidates.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || priorities[a.priority] - priorities[b.priority] || a.title.localeCompare(b.title));
  for (const task of candidates) {
    if (alreadyPlaced.has(task.id)) continue;
    const otherDate = Object.keys(otherPlans).find(key => key !== date && key >= now.date && otherPlans[key].some(entry => entry.kind === 'task' && entry.taskId === task.id));
    if (otherDate) { result.unscheduled.push({ taskId: task.id, title: task.title, reason: `Already scheduled on ${otherDate}. Edit that plan before scheduling it again.` }); continue; }
    const remaining = task.duration - task.spent;
    const gap = gaps.find(([a, b]) => b - a >= remaining);
    if (!gap) {
      result.unscheduled.push({ taskId: task.id, title: task.title, reason: `Needs ${remaining} uninterrupted minutes. No remaining slot fits after commitments, sleep, and breaks.` });
      continue;
    }
    const start = gap[0], end = start + remaining;
    const reason = `${task.deadline ? (task.deadline < date ? `Overdue since ${task.deadline}` : `Due ${task.deadline}`) : 'No deadline'}; ${task.priority.toLowerCase()} priority; earliest slot that fits ${remaining} remaining minutes.`;
    result.reasons[task.id] = reason;
    result.entries.push({ id: `plan-${date}-${task.id}-${start}`, taskId: task.id, title: task.title, start: timeLabel(start), end: timeLabel(end), completed: false, locked: task.locked, kind: 'task', reason });
    gap[0] = end;
    if (settings.breakMinutes && gap[1] - gap[0] >= settings.breakMinutes) {
      result.entries.push({ id: `break-${date}-${task.id}-${end}`, taskId: task.id, title: 'Break', start: timeLabel(end), end: timeLabel(end + settings.breakMinutes), kind: 'break', completed: false, locked: false });
      gap[0] += settings.breakMinutes;
    }
  }
  result.entries.sort((a, b) => minutes(a.start) - minutes(b.start));
  return result;
}
