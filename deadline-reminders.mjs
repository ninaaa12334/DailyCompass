import { dayNumber } from './clock.mjs';
import { minutes } from './calendar-store.mjs';

// Independent from calendar slots: finishing/removing the task removes its alert.
export function deadlineReminders(snapshot) {
  return snapshot.tasks.filter(t => !t.completed && t.deadline && t.deadlineReminder && t.reminder !== 'off').map(t => {
    const r = t.deadlineReminder;
    const due = dayNumber(r.date) * 1440 + minutes(r.time);
    return { key: `deadline|${t.id}|${t.deadline}|${r.date}|${r.time}`, activityId: t.id, title: `Deadline: ${t.title}`, date: r.date, start: r.time, due, startStamp: due + 5, lead: 0 };
  });
}
