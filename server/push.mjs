import * as webpush from 'web-push';
import { memoryModel } from './plans.mjs';
import { addDays } from '../calendar-view.mjs';
import { zonedNow } from '../clock.mjs';
import { wallToInstant } from '../zoned-time.mjs';
import { minutes } from '../calendar-store.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { deadlineReminders } from '../deadline-reminders.mjs';

export function pushReceipt(db, user, key) {
  const receipt = db.prepare('SELECT received,display_requested,error FROM push_receipts WHERE user_id=? AND key=?').get(user, key);
  return { browserReceived: Boolean(receipt), displayRequested: Boolean(receipt?.display_requested), displayError: receipt?.error || null };
}
export function recordPushReceipt(db, user, key, phase) {
  if (!/^[a-f0-9]{64}$/.test(key || '') || !['received', 'display-requested', 'display-failed'].includes(phase)) throw Object.assign(new Error('Invalid notification receipt.'), { status: 400 });
  const issued = db.prepare('SELECT key FROM deliveries WHERE user_id=? AND key=? UNION SELECT key FROM push_tests WHERE user_id=? AND key=?').get(user, key, user, key);
  if (!issued) throw Object.assign(new Error('Notification not found for this account.'), { status: 404 });
  db.prepare('INSERT INTO push_receipts VALUES(?,?,?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET display_requested=COALESCE(push_receipts.display_requested,excluded.display_requested),error=COALESCE(excluded.error,push_receipts.error)').run(user, key, Date.now(), phase === 'display-requested' ? Date.now() : null, phase === 'display-failed' ? 'The browser could not request notification display.' : null);
}

export function validSubscription(value) {
  const url = new URL(value?.endpoint);
  const host = url.hostname;
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !(host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com')) || typeof value.keys?.p256dh !== 'string' || typeof value.keys?.auth !== 'string' || value.keys.p256dh.length > 200 || value.keys.auth.length > 100) throw new Error('Unsupported push service or invalid subscription.');
  return value;
}
export function reminderJobs(snapshot, at = new Date()) {
  const model = memoryModel(snapshot), settings = snapshot.settings;
  if (!settings.backgroundReminders) return [];
  const today = zonedNow(at, settings.timeZone).date, jobs = [];
  for (let i = 0; i <= 31; i++) {
    const date = addDays(today, i);
    for (const item of model.getDay(date).commitments) {
      if (item.completed || item.kind === 'break' || item.reminder === 'off') continue;
      const lead = item.reminder === undefined || item.reminder === 'default' ? settings.reminderMinutes : item.reminder;
      try {
        const start = wallToInstant(date, item.start, settings.timeZone, item.dstChoice), due = start - lead * 60000;
        const localDue = zonedNow(new Date(due), settings.timeZone).minute, a = minutes(settings.quietStart), b = minutes(settings.quietEnd);
        const quiet = a !== b && (a < b ? localDue >= a && localDue < b : localDue >= a || localDue < b);
        const key = createHash('sha256').update(`${item.id}|${date}|${item.start}|${lead}|${settings.timeZone}|${item.dstChoice || ''}`).digest('hex');
        jobs.push({ key, due, start, expires: start + (lead === 0 ? 60000 : 0), title: item.title, date, activityId: item.taskId || item.id, quiet });
      } catch { /* A nonexistent or ambiguous wall time is shown as unscheduled by the center. No guessed delivery. */ }
    }
  }
  for (const item of deadlineReminders(snapshot)) {
    if (item.date < today || item.date > addDays(today, 31)) continue;
    try {
      const due = wallToInstant(item.date, item.start, settings.timeZone);
      const localDue = minutes(item.start), a = minutes(settings.quietStart), b = minutes(settings.quietEnd);
      const quiet = a !== b && (a < b ? localDue >= a && localDue < b : localDue >= a || localDue < b);
      const key = createHash('sha256').update(`${item.key}|${settings.timeZone}`).digest('hex');
      jobs.push({ key, due, start: due, expires: due + 5 * 60000, title: item.title, date: item.date, activityId: item.activityId, quiet });
    } catch { /* Ambiguous DST times require a different reminder time. */ }
  }
  return jobs;
}
export function pushWorker(db, config, sender = webpush.sendNotification.bind(webpush)) {
  const configured = Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY && config.VAPID_SUBJECT);
  let running = false;
  async function tick(at = new Date()) {
    if (running) return; running = true;
    try {
      for (const document of db.prepare('SELECT * FROM documents').all()) {
        const state = JSON.parse(document.body), jobs = reminderJobs(state, at), keys = new Set(jobs.map(j => j.key));
        for (const old of db.prepare("SELECT key FROM deliveries WHERE user_id=? AND status='pending'").all(document.user_id)) if (!keys.has(old.key)) db.prepare("UPDATE deliveries SET status='cancelled' WHERE user_id=? AND key=?").run(document.user_id, old.key);
        for (const job of jobs) {
          db.prepare("INSERT INTO deliveries VALUES(?,?,?,?,?,'pending',NULL) ON CONFLICT(user_id,key) DO UPDATE SET body=excluded.body, due=excluded.due, start=excluded.start, status=CASE WHEN deliveries.status='cancelled' AND excluded.due>? THEN 'pending' ELSE deliveries.status END WHERE deliveries.status IN ('pending','cancelled')").run(document.user_id, job.key, JSON.stringify(job), job.due, job.start, +at);
          const record = db.prepare('SELECT status FROM deliveries WHERE user_id=? AND key=?').get(document.user_id, job.key);
          if (record.status !== 'pending' || job.due > +at) continue;
          if (job.expires < +at || job.quiet) { db.prepare('UPDATE deliveries SET status=? WHERE user_id=? AND key=?').run(job.quiet ? 'quiet' : 'missed', document.user_id, job.key); continue; }
          const subscriptions = db.prepare('SELECT * FROM subscriptions WHERE user_id=?').all(document.user_id);
          if (!configured || !subscriptions.length) { db.prepare("UPDATE deliveries SET status='unavailable',error='No configured push service or subscribed device' WHERE user_id=? AND key=?").run(document.user_id, job.key); continue; }
          // At most one attempt per reminder per device. Claim before sending: no duplicate after process restart.
          const claimed = db.prepare("UPDATE deliveries SET status='sending' WHERE user_id=? AND key=? AND status='pending'").run(document.user_id, job.key);
          if (claimed.changes !== 1) continue;
          let accepted = 0; const errors = [];
          for (const subscription of subscriptions) try {
            validSubscription(JSON.parse(subscription.body));
            await sender(JSON.parse(subscription.body), JSON.stringify({ title: 'Day Compass', body: 'An activity is coming up. Open your private planner for details.', tag: job.key, url: `/dashboard.html?date=${job.date}&activity=${encodeURIComponent(job.activityId)}`, key: job.key }), { TTL: Math.max(0, Math.floor((job.expires - +at) / 1000)), timeout: 10000, vapidDetails: { subject: config.VAPID_SUBJECT, publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY } }); accepted++;
          } catch (error) { if ([404, 410].includes(error.statusCode)) db.prepare('DELETE FROM subscriptions WHERE user_id=? AND endpoint=?').run(document.user_id, subscription.endpoint); errors.push(error.statusCode ? `Push HTTP ${error.statusCode}` : 'Push request failed'); }
          db.prepare('UPDATE deliveries SET status=?,error=? WHERE user_id=? AND key=?').run(accepted ? 'accepted-by-push-service' : 'failed', errors.join('; ') || null, document.user_id, job.key);
        }
      }
      db.prepare('DELETE FROM sessions WHERE expires<?').run(+at); db.prepare('DELETE FROM oauth WHERE expires<?').run(+at);
      db.prepare('DELETE FROM deliveries WHERE start<?').run(+at - 30 * 86400000);
      db.prepare('DELETE FROM push_tests WHERE created<?').run(+at - 86400000);
      db.prepare('DELETE FROM push_receipts WHERE received<?').run(+at - 30 * 86400000);
    } finally { running = false; }
  }
  async function sendTest(user, endpoint) {
    if (!configured) throw Object.assign(new Error('Configure notification keys and contact on the server first.'), { status: 503 });
    const record = db.prepare('SELECT body FROM subscriptions WHERE user_id=? AND endpoint=?').get(user, endpoint);
    if (!record) throw Object.assign(new Error('This device is not subscribed for your account. Enable it first.'), { status: 404 });
    const subscription = validSubscription(JSON.parse(record.body));
    const key = randomBytes(32).toString('hex');
    db.prepare("INSERT INTO push_tests VALUES(?,?,?,'sending')").run(user, key, Date.now());
    try {
      await sender(subscription, JSON.stringify({ title: 'Day Compass', body: 'Day Compass notification test. Open your planner for details.', tag: `compass-test-${key}`, url: '/dashboard.html', key }), { TTL: 300, timeout: 10000, vapidDetails: { subject: config.VAPID_SUBJECT, publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY } });
      db.prepare("UPDATE push_tests SET status='accepted' WHERE user_id=? AND key=?").run(user, key);
    } catch (error) {
      db.prepare("UPDATE push_tests SET status='failed' WHERE user_id=? AND key=?").run(user, key);
      if ([404, 410].includes(error.statusCode)) db.prepare('DELETE FROM subscriptions WHERE user_id=? AND endpoint=?').run(user, endpoint);
      throw Object.assign(new Error(error.statusCode ? `Test push failed (HTTP ${error.statusCode}). Re-enable this device or check the server keys.` : 'The test push could not reach the browser push service. Check network access and server configuration.'), { status: 502 });
    }
    return { acceptedByPushService: true, deviceDeliveryConfirmed: false, testKey: key };
  }
  return { tick, configured, sendTest };
}
