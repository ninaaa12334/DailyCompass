import { STORAGE_KEY } from './task-store.mjs';
import { CALENDAR_KEY, dateKey } from './calendar-store.mjs';

export function seedDemo(storage) {
  const today = dateKey(new Date());
  if (storage.getItem(STORAGE_KEY) === null) storage.setItem(STORAGE_KEY, JSON.stringify([
    { id: 'demo-1', title: 'A little algebra practice', category: 'Study', deadline: today, duration: 30, priority: 'High', completed: false },
    { id: 'demo-2', title: 'Get outside for a bit', category: 'Exercise', deadline: '', duration: 20, priority: 'Medium', completed: false },
    { id: 'demo-3', title: 'Finish that first draft', category: 'Personal projects', deadline: today, duration: 45, priority: 'Medium', completed: true }
  ]));
  if (storage.getItem(CALENDAR_KEY) === null) storage.setItem(CALENDAR_KEY, JSON.stringify({
    [today]: { start: '08:00', end: '20:00', color: 'theme', commitments: [
      { id: 'demo-school', title: 'School', start: '08:00', end: '15:00' },
      { id: 'demo-volleyball', title: 'Volleyball practice', start: '16:00', end: '17:00' }
    ] }
  }));
}
