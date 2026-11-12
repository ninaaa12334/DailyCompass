import test from 'node:test';
import assert from 'node:assert/strict';
import { taskDraft } from './task-chat.mjs';
import { memoryModel } from './server/plans.mjs';
import { reminderJobs, pushWorker } from './server/push.mjs';
import { database } from './server/database.mjs';
import { upcomingReminders } from './reminders.mjs';

const at = new Date('2026-11-12T08:00:00Z'), settings = { timeZone: 'Europe/Budapest' };
test('task helper keeps uncertain weeks unresolved and resolves supported dates in planner timezone', () => {
  assert.equal(taskDraft('I have a history project due next week', settings, at).deadline, '');
  assert.equal(taskDraft('I have a history project due tomorrow', settings, at).title, 'a history project');
  assert.equal(taskDraft('essay due tomorrow', settings, at).deadline, '2026-11-13');
  assert.equal(taskDraft('essay due next Monday', settings, at).deadline, '2026-11-16');
  assert.equal(taskDraft('essay due next Friday', settings, at).deadline, '2026-11-20');
  assert.equal(taskDraft('essay due 2026-02-30', settings, at).deadline, '');
  assert.equal(taskDraft('essay due 2026-11-11', settings, at).deadline, '');
  assert.equal(taskDraft('essay due tomorrow', settings, new Date('2026-11-12T23:30:00Z')).deadline, '2026-11-14');
});
function modelWithDeadline() {
  const model = memoryModel(); model.saveSettings({ ...settings, backgroundReminders: true });
  model.saveActivity({ id: 'essay', kind: 'task', title: 'Essay', date: '', deadline: '2026-11-19', deadlineReminder: { date: '2026-11-18', time: '09:00' }, notes: '', category: 'Study', priority: 'Medium', duration: 30, spent: 0, completed: false, locked: false, reminder: 'default', repeat: 'none', repeatUntil: '' });
  return model;
}
test('deadline-only task persists with no calendar slot and produces a separate reminder', () => {
  const m = modelWithDeadline(), s=m.snapshot();
  assert.equal(s.tasks[0].date, ''); assert.equal(s.tasks[0].deadline, '2026-11-19');
  assert.equal(m.getDay('2026-11-18').commitments.length, 0);
  const job=reminderJobs(s,at)[0]; assert.equal(job.due, Date.parse('2026-11-18T08:00:00Z')); assert.equal(job.quiet,false);
  assert.equal(upcomingReminders(m,{date:'2026-11-12',minute:540})[0].title,'Deadline: Essay');
  m.toggle('task','essay'); assert.equal(reminderJobs(m.snapshot(),at).length,0);
});
test('deadline fields are server-validated, quiet hours apply, deletion removes jobs', () => {
  const m=modelWithDeadline(), task=m.getTasks()[0];
  assert.throws(()=>m.saveActivity({...task,deadlineReminder:{date:'2026-11-20',time:'09:00'}},task),/on or before/);
  assert.throws(()=>m.saveActivity({...task,deadlineReminder:{date:'2026-11-18',time:'24:00'}},task));
  m.saveActivity({...task,deadlineReminder:{date:'2026-11-18',time:'23:00'}},task);
  assert.equal(reminderJobs(m.snapshot(),at)[0].quiet,true);
  m.remove('task','essay'); assert.equal(reminderJobs(m.snapshot(),at).length,0);
});
test('deadline reminder is dispatched once through the existing push worker', async () => {
  const {db}=database(':memory:'), m=modelWithDeadline();
  db.prepare('INSERT INTO users VALUES(?,?,?)').run('u','test','unused');
  db.prepare('INSERT INTO documents VALUES(?,?,?)').run('u',0,JSON.stringify(m.snapshot()));
  const subscription={endpoint:'https://fcm.googleapis.com/test',keys:{p256dh:'test',auth:'test'}};
  db.prepare('INSERT INTO subscriptions VALUES(?,?,?)').run('u',subscription.endpoint,JSON.stringify(subscription));
  let calls=0; const worker=pushWorker(db,{VAPID_PUBLIC_KEY:'test',VAPID_PRIVATE_KEY:'test',VAPID_SUBJECT:'mailto:test@example.com'},async()=>{calls++;});
  await worker.tick(new Date('2026-11-18T08:00:15Z')); await worker.tick(new Date('2026-11-18T08:00:30Z'));
  assert.equal(calls,1); assert.equal(db.prepare('SELECT status FROM deliveries').get().status,'accepted-by-push-service'); db.close();
});
