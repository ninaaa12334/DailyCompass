// Dates stay as YYYY-MM-DD strings; times are minutes since midnight.
export const CALENDAR_KEY = 'day-compass.calendar.v1';
export const COLORS = ['theme', 'blue', 'sage', 'lavender', 'rose'];

export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validateDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid date.');
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime()) || dateKey(parsed) !== date) throw new Error('Choose a valid date.');
}

export function minutes(time) {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Choose a valid time.');
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

function validateDay(day) {
  if (!day || !COLORS.includes(day.color) || !Array.isArray(day.commitments)) throw new Error('Invalid saved day.');
  if (minutes(day.start) >= minutes(day.end)) throw new Error('Planning must end after it starts.');
  const ids = new Set();
  const sorted = [...day.commitments].sort((a, b) => minutes(a.start) - minutes(b.start));
  let previousEnd = -1;
  for (const item of sorted) {
    if (typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120) throw new Error('Check the commitment title.');
    ids.add(item.id);
    const start = minutes(item.start);
    const end = minutes(item.end);
    if (end <= start) throw new Error('A commitment must end after it starts.');
    if (start < previousEnd) throw new Error('That time overlaps another commitment. Choose a different time.');
    previousEnd = end;
  }
}

export function capacity(day) {
  const start = minutes(day.start);
  const end = minutes(day.end);
  // Merge occupied intervals so future scheduled tasks cannot double-count minutes.
  const intervals = day.commitments.map(item => [Math.max(start, minutes(item.start)), Math.min(end, minutes(item.end))])
    .filter(([from, to]) => to > from).sort((a, b) => a[0] - b[0]);
  let booked = 0;
  let occupiedUntil = start;
  for (const [from, to] of intervals) {
    booked += Math.max(0, to - Math.max(from, occupiedUntil));
    occupiedUntil = Math.max(occupiedUntil, to);
  }
  const total = end - start;
  return { booked, total, free: total - booked, ratio: booked / total };
}

export function createCalendarStore(storage) {
  const saved = storage.getItem(CALENDAR_KEY);
  let days = saved === null ? {} : JSON.parse(saved);
  if (!days || typeof days !== 'object' || Array.isArray(days)) throw new Error('Unreadable calendar data.');
  for (const [date, day] of Object.entries(days)) { validateDate(date); validateDay(day); }

  function getDay(date) {
    validateDate(date);
    return structuredClone(days[date] ?? { start: '08:00', end: '20:00', color: 'theme', commitments: [] });
  }

  function save(date, day) {
    validateDate(date);
    validateDay(day);
    const next = { ...days, [date]: day };
    storage.setItem(CALENDAR_KEY, JSON.stringify(next));
    days = next;
  }

  return {
    getDay,
    setHours(date, settings) {
      const day = getDay(date);
      save(date, { ...day, start: settings.start, end: settings.end, color: settings.color });
    },
    saveCommitment(date, item) {
      const day = getDay(date);
      const existing = day.commitments.some(entry => entry.id === item.id);
      day.commitments = existing ? day.commitments.map(entry => entry.id === item.id ? { ...item } : entry) : [...day.commitments, { ...item }];
      save(date, day);
    },
    removeCommitment(date, id) {
      const day = getDay(date);
      day.commitments = day.commitments.filter(entry => entry.id !== id);
      save(date, day);
    }
  };
}
