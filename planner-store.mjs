import { minutes } from './calendar-store.mjs';
import { addDays } from './calendar-view.mjs';
import { dayNumber, validDate } from './clock.mjs';
import { routineEvents } from './availability.mjs';
import { wallToInstant } from './zoned-time.mjs';
import { importedDays } from './imported-time.mjs';
import { validateAppearance } from './appearance.mjs';

export const PLANNER_KEY = 'day-compass.planner.v2';
export const CATEGORIES = ['Study', 'Exercise', 'Chores', 'Personal projects', 'Social', 'Work', 'Appointments'];
export const DEFAULT_SETTINGS = { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, planningStart: '08:00', planningEnd: '20:00', sleepStart: '23:00', sleepEnd: '07:00', breakMinutes: 5, remindersEnabled: false, reminderMinutes: 10, quietStart: '22:00', quietEnd: '07:00' };
const clone = value => structuredClone(value);
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const interval = item => { ensure(minutes(item.start) < minutes(item.end), 'End time must be after start time. Overnight events need separate dated entries.'); };

function normalizeTask(task, index = 0) {
  return { date: '', notes: '', reminder: 'default', repeat: 'none', repeatUntil: '', spent: 0, locked: false, deadline: '', category: 'Personal projects', priority: 'Medium', duration: 30, completed: false, id: `legacy-task-${index}`, ...task };
}
function normalizeEvent(item, index = 0) {
  return { category: 'Personal projects', priority: 'Medium', notes: '', reminder: 'default', repeat: 'none', repeatUntil: '', completed: false, locked: false, id: `legacy-event-${index}`, ...item, kind: 'fixed' };
}
function validateActivity(item) {
  ensure(item && typeof item.id === 'string' && item.id && typeof item.title === 'string' && item.title.trim() && item.title.length <= 120, 'Enter a title of 1–120 characters.');
  ensure(CATEGORIES.includes(item.category) && ['High', 'Medium', 'Low'].includes(item.priority), 'Choose a category and priority.');
  ensure(typeof item.notes === 'string' && item.notes.length <= 5000, 'Notes must be at most 5000 characters.');
  ensure(typeof item.completed === 'boolean' && typeof item.locked === 'boolean', 'Invalid completion or lock data.');
  ensure(['none', 'daily', 'weekly'].includes(item.repeat), 'Choose a supported recurrence.');
  ensure(item.reminder === 'default' || item.reminder === 'off' || (Number.isInteger(item.reminder) && item.reminder >= 0 && item.reminder <= 1440), 'Reminder minutes must be between 0 and 1440.');
}
export function validatePlanner(state) {
  ensure(state?.version === 2 && Number.isInteger(state.revision) && state.revision >= 0 && Array.isArray(state.tasks) && [state.days, state.plans, state.settings, state.reminderLog].every(value => value && typeof value === 'object' && !Array.isArray(value)), 'Saved planner data has an unsupported structure. Original data has been preserved.');
  new Intl.DateTimeFormat('en', { timeZone: state.settings.timeZone }).format();
  const settings = state.settings;
  for (const key of ['setupConfirmed', 'historyEnabled', 'backgroundReminders', 'googleSyncEnabled', 'googleAutoExport', 'onboardingComplete']) if (settings[key] !== undefined) ensure(typeof settings[key] === 'boolean', `Invalid ${key}.`);
  if (settings.appearance !== undefined) validateAppearance(settings.appearance);
  for (const [key, max] of [['travelMinutes', 180], ['minimumGap', 240]]) if (settings[key] !== undefined) ensure(Number.isInteger(settings[key]) && settings[key] >= (key === 'minimumGap' ? 5 : 0) && settings[key] <= max, `Invalid ${key}.`);
  if (settings.interests !== undefined) ensure(typeof settings.interests === 'string' && settings.interests.length <= 500, 'Interests must be under 500 characters.');
  if (settings.routines !== undefined) { ensure(Array.isArray(settings.routines) && settings.routines.length <= 100, 'Too many routines.'); for (const r of settings.routines) { ensure(typeof r.id === 'string' && typeof r.title === 'string' && r.title.length > 0 && r.title.length <= 120 && Array.isArray(r.weekdays) && r.weekdays.every(n => Number.isInteger(n) && n >= 0 && n <= 6), 'Invalid routine.'); interval(r); } }
  if (settings.keptFree !== undefined) { ensure(Array.isArray(settings.keptFree) && settings.keptFree.length <= 1000, 'Invalid kept-free periods.'); for (const g of settings.keptFree) { ensure(validDate(g.date), 'Invalid kept-free date.'); interval(g); } }
  if (state.imports !== undefined) { ensure(Array.isArray(state.imports) && state.imports.length <= 10000, 'Too many imported events.'); for (const e of state.imports) { ensure(validDate(e.date) && typeof e.title === 'string' && typeof e.id === 'string', 'Invalid imported event.'); interval(e); } }
  for (const key of ['planningStart', 'planningEnd', 'sleepStart', 'sleepEnd', 'quietStart', 'quietEnd']) minutes(state.settings[key]);
  ensure(minutes(state.settings.planningStart) < minutes(state.settings.planningEnd), 'Planning must end after it starts.');
  ensure(Number.isInteger(state.settings.breakMinutes) && state.settings.breakMinutes >= 0 && state.settings.breakMinutes <= 120, 'Breaks must be 0–120 minutes.');
  ensure(Number.isInteger(state.settings.reminderMinutes) && state.settings.reminderMinutes >= 0 && state.settings.reminderMinutes <= 1440 && typeof state.settings.remindersEnabled === 'boolean', 'Invalid reminder defaults.');
  const ids = new Set();
  if (state.unscheduled !== undefined) {
    ensure(state.unscheduled && typeof state.unscheduled === 'object' && !Array.isArray(state.unscheduled), 'Invalid saved unscheduled-work notes.');
    for (const [date, items] of Object.entries(state.unscheduled)) ensure(validDate(date) && Array.isArray(items) && items.every(item => typeof item.taskId === 'string' && typeof item.title === 'string' && typeof item.reason === 'string'), 'Invalid saved unscheduled-work notes.');
  }
  for (const task of state.tasks) {
    validateActivity(task);
    ensure(!ids.has(task.id), 'Duplicate task IDs in saved data.'); ids.add(task.id);
    ensure((task.date === '' || validDate(task.date)) && (task.deadline === '' || validDate(task.deadline)), 'Invalid task date or deadline.');
    ensure(Number.isInteger(task.duration) && task.duration > 0 && task.duration <= 1440 && Number.isInteger(task.spent) && task.spent >= 0 && task.spent <= task.duration, 'Duration must be 1–1440 minutes; time already worked cannot exceed it.');
  }
  for (const [date, day] of Object.entries(state.days)) {
    ensure(validDate(date) && day && Array.isArray(day.commitments), 'Invalid calendar date or activities.'); interval(day);
    ensure(['theme', 'blue', 'sage', 'lavender', 'rose'].includes(day.color), 'Invalid calendar colour.');
    const eventIds = new Set();
    for (const item of day.commitments) { validateActivity(item); interval(item); ensure(!eventIds.has(item.id), 'Duplicate event ID.'); eventIds.add(item.id); }
  }
  for (const [date, entries] of Object.entries(state.plans)) {
    ensure(validDate(date) && Array.isArray(entries), 'Invalid saved schedule.');
    const entryIds = new Set();
    for (const item of entries) {
      interval(item);
      ensure(typeof item.id === 'string' && item.id && !entryIds.has(item.id) && ['task', 'break'].includes(item.kind) && typeof item.completed === 'boolean' && typeof item.locked === 'boolean', 'Invalid scheduled activity.'); entryIds.add(item.id);
      ensure(item.kind === 'break' || ids.has(item.taskId), 'A schedule references a missing task. Recover the saved data before continuing.');
    }
  }
  for (const date of new Set([...Object.keys(state.days), ...Object.keys(state.plans)])) {
    const entries = [...(state.days[date]?.commitments || []), ...(state.plans[date] || [])].sort((a, b) => minutes(a.start) - minutes(b.start));
    let end = -1;
    for (const item of entries) { ensure(minutes(item.start) >= end, `Activities overlap on ${date}. Adjust the time or replan the day.`); end = minutes(item.end); }
  }
}
const validate = validatePlanner;

export function createPlannerStore(storage) {
  const saved = storage.getItem(PLANNER_KEY);
  let state;
  if (saved !== null) { state = JSON.parse(saved); if (state && state.version === 2) state.unscheduled ??= {}; validate(state); }
  else {
    const rawTasks = storage.getItem('day-compass.tasks.v1');
    const rawDays = storage.getItem('day-compass.calendar.v1');
    const tasks = rawTasks === null ? [] : JSON.parse(rawTasks);
    const days = rawDays === null ? {} : JSON.parse(rawDays);
    ensure(Array.isArray(tasks) && days && typeof days === 'object' && !Array.isArray(days), 'Older saved data could not be read. Nothing has been deleted.');
    const normalizedDays = {};
    for (const [date, day] of Object.entries(days)) {
      ensure(day && Array.isArray(day.commitments), `Older activities on ${date} need recovery. Nothing has been deleted.`);
      normalizedDays[date] = { start: '08:00', end: '20:00', color: 'theme', ...day, commitments: day.commitments.map((item, index) => normalizeEvent(item, `${date}-${index}`)) };
    }
    state = { version: 2, revision: 0, tasks: tasks.map(normalizeTask), days: normalizedDays, plans: {}, unscheduled: {}, settings: { ...DEFAULT_SETTINGS }, reminderLog: {}, undo: null };
    validate(state); // Legacy keys are never deleted or modified by migration.
  }
  const subscribers = new Set();
  let importCache, importSource, importZone;
  function notify() { for (const callback of subscribers) callback(); }
  function commit(change) {
    const next = clone(state); change(next); validate(next);
    next.undo = { ...clone(state), undo: null };
    next.revision = state.revision + 1;
    storage.setItem(PLANNER_KEY, JSON.stringify(next)); state = next; notify();
  }
  function ensureDay(next, date) {
    ensure(validDate(date), 'Choose a valid date.');
    return next.days[date] ??= { start: next.settings.planningStart, end: next.settings.planningEnd, color: 'theme', commitments: [] };
  }
  function removeMatching(next, kind, predicate) {
    if (kind === 'task') {
      const removed = new Set(next.tasks.filter(predicate).map(task => task.id));
      next.tasks = next.tasks.filter(task => !removed.has(task.id));
      for (const date of Object.keys(next.plans)) next.plans[date] = next.plans[date].filter(item => !removed.has(item.taskId));
    } else for (const day of Object.values(next.days)) day.commitments = day.commitments.filter(item => !predicate(item));
  }
  return {
    snapshot: () => clone(state),
    subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback); },
    getTasks: () => clone(state.tasks),
    getDay(date) {
      ensure(validDate(date), 'Choose a valid date.');
      const day = clone(state.days[date] || { start: state.settings.planningStart, end: state.settings.planningEnd, color: 'theme', commitments: [] }); day.date = date;
      const planned = (state.plans[date] || []).map(entry => {
        const task = entry.kind === 'task' ? state.tasks.find(task => task.id === entry.taskId) : null;
        return { ...entry, ...(task ? { title: task.title, category: task.category, priority: task.priority, notes: task.notes, reminder: task.reminder, completed: task.completed || entry.completed } : {}), date };
      });
      if (importSource !== state.imports || importZone !== state.settings.timeZone || !importCache) { importCache = importedDays(state.imports || [], state.settings.timeZone); importSource = state.imports; importZone = state.settings.timeZone; }
      day.commitments = [...day.commitments.map(item => ({ ...item, date })), ...planned, ...routineEvents(date, state.settings), ...(importCache[date] || []).map(e => ({ ...e, kind: 'fixed', sourceImport: true, reminder: 'off' }))];
      return day;
    },
    saveSettings(settings) { commit(next => { next.settings = { ...next.settings, ...settings }; }); },
    setImports(events) { commit(next => { next.imports = clone(events); }); },
    replaceSnapshot(value) { validate(value); storage.setItem(PLANNER_KEY, JSON.stringify(value)); state = clone(value); notify(); },
    setHours(date, settings) { commit(next => { Object.assign(ensureDay(next, date), settings); }); },
    saveActivity(input, original = null, scope = 'one') {
      commit(next => {
        const kind = input.kind;
        const source = original?.kind === 'task' ? next.tasks.find(task => task.id === original.id) : original ? next.days[original.date]?.commitments.find(item => item.id === original.id) : null;
        ensure(!original || source, 'This activity no longer exists.');
        const id = source?.id || input.id;
        let occurrences = [{ date: input.date, id, completed: source?.completed || false }];
        let seriesShift = 0;
        if (source && scope === 'series' && source.seriesId) {
          const all = kind === 'task' ? next.tasks.filter(item => item.seriesId === source.seriesId) : Object.entries(next.days).flatMap(([date, day]) => day.commitments.filter(item => item.seriesId === source.seriesId).map(item => ({ ...item, date })));
          const delta = dayNumber(input.date) - dayNumber(original.date);
          seriesShift = delta;
          occurrences = all.map(item => ({ date: addDays(item.date || original.date, delta), id: item.id, completed: item.completed, seriesId: item.seriesId }));
          removeMatching(next, kind, item => item.seriesId === source.seriesId);
        } else if (source) removeMatching(next, kind, item => item.id === source.id);
        else if (input.repeat !== 'none') {
          ensure(validDate(input.repeatUntil) && input.repeatUntil >= input.date && dayNumber(input.repeatUntil) - dayNumber(input.date) <= 365, 'Choose a recurrence end date within one year.');
          occurrences = [];
          for (let date = input.date; date <= input.repeatUntil; date = addDays(date, input.repeat === 'daily' ? 1 : 7)) occurrences.push({ date, id: `${id}-${date}`, seriesId: id, completed: false });
        }
        for (const occurrence of occurrences) {
          const item = { ...input, ...occurrence, seriesId: occurrence.seriesId || (scope === 'one' ? undefined : source?.seriesId) };
          if (source?.seriesId && scope === 'one') { item.repeat = 'none'; item.repeatUntil = ''; }
          else if (source && scope === 'series' && validDate(item.repeatUntil)) item.repeatUntil = addDays(item.repeatUntil, seriesShift);
          if (kind === 'task') {
            item.deadline = input.deadline ? addDays(occurrence.date, dayNumber(input.deadline) - dayNumber(input.date)) : '';
            next.tasks.push(normalizeTask(item));
            // Keep existing schedule positions on a details edit. Replanning previews timing changes.
            if (source) for (const [date, entries] of Object.entries(state.plans)) {
              const preserved = entries.filter(entry => entry.taskId === item.id);
              next.plans[date] = [...(next.plans[date] || []), ...preserved];
            }
          } else {
            const day = ensureDay(next, occurrence.date);
            wallToInstant(occurrence.date, item.start, next.settings.timeZone, item.dstChoice); wallToInstant(occurrence.date, item.end, next.settings.timeZone, item.dstChoice);
            ensure(!day.commitments.some(event => event.title.trim().toLowerCase() === item.title.trim().toLowerCase() && event.start === item.start && event.end === item.end), 'An activity with this title and time already exists.');
            day.commitments.push(normalizeEvent(item));
          }
        }
      });
    },
    toggle(kind, id, date) { commit(next => {
      const item = kind === 'task' ? next.tasks.find(task => task.id === id) : next.days[date]?.commitments.find(event => event.id === id);
      ensure(item, 'Activity not found.'); item.completed = !item.completed;
      if (kind === 'task') for (const entries of Object.values(next.plans)) for (const entry of entries) if (entry.taskId === id) entry.completed = item.completed;
    }); },
    lock(date, id) { commit(next => { const item = next.plans[date]?.find(entry => entry.id === id); ensure(item, 'Scheduled activity not found.'); item.locked = !item.locked; }); },
    unplan(date, taskId) { commit(next => {
      const entries = next.plans[date] || [];
      ensure(!entries.some(item => item.taskId === taskId && (item.locked || item.completed)), 'Completed or locked work cannot be removed from its scheduled time. Unlock unfinished work first.');
      next.plans[date] = entries.filter(item => item.taskId !== taskId);
    }); },
    remove(kind, id, date, scope = 'one') { commit(next => {
      const item = kind === 'task' ? next.tasks.find(task => task.id === id) : next.days[date]?.commitments.find(event => event.id === id);
      ensure(item, 'Activity not found.'); removeMatching(next, kind, entry => scope === 'series' && item.seriesId ? entry.seriesId === item.seriesId : entry.id === id);
    }); },
    applyPlan(date, preview, revision) { ensure(state.revision === revision, 'The planner changed after this preview. Generate a fresh preview.'); ensure(!preview.warnings.length, 'Resolve the preserved-activity warnings before applying.'); commit(next => { next.plans[date] = clone(preview.entries); next.unscheduled ??= {}; next.unscheduled[date] = clone(preview.unscheduled); }); },
    undo() { ensure(state.undo, 'Nothing to undo.'); const previous = clone(state.undo); previous.revision = state.revision + 1; previous.reminderLog = { ...previous.reminderLog, ...state.reminderLog }; previous.undo = null; validate(previous); storage.setItem(PLANNER_KEY, JSON.stringify(previous)); state = previous; notify(); },
    claimReminder(key) {
      const current = storage.getItem(PLANNER_KEY);
      const latest = current ? JSON.parse(current) : state; validate(latest);
      if (latest.reminderLog[key]) return false;
      latest.reminderLog[key] = true; storage.setItem(PLANNER_KEY, JSON.stringify(latest)); state = latest; return true;
    },
    reload() { const raw = storage.getItem(PLANNER_KEY); if (raw) { const next = JSON.parse(raw); validate(next); state = next; notify(); } }
  };
}
