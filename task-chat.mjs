import { newId } from './uuid.mjs';
import { zonedNow, validDate } from './clock.mjs';
import { addDays } from './calendar-view.mjs';

// Small, local language rules. Uncertain dates stay uncertain until reviewed.
export function taskDraft(message, settings, at = new Date()) {
  const text = String(message).trim().slice(0, 2000), today = zonedNow(at, settings.timeZone).date;
  let deadline = '', note = '';
  const explicit = text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  if (explicit.length === 1 && validDate(explicit[0])) deadline = explicit[0];
  else if (/\btomorrow\b/i.test(text)) deadline = addDays(today, 1);
  else if (/\btoday\b/i.test(text)) deadline = today;
  else if (/\bnext week\b/i.test(text)) note = 'Which date next week? Choose the actual deadline below; I have not guessed a day.';
  else {
    const weekday = text.match(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (weekday) {
      const target = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(weekday[2].toLowerCase());
      const current = new Date(`${today}T12:00:00Z`).getUTCDay();
      deadline = addDays(today, weekday[1] ? ((target + 6) % 7) + 8 - (current || 7) : (target - current + 7) % 7);
    }
  }
  if (explicit.length && (explicit.length !== 1 || !validDate(explicit[0]))) { deadline = ''; note = 'Please choose one valid deadline date below.'; }
  if (deadline && deadline < today) { deadline = ''; note = 'That date has passed. Please choose the intended deadline.'; }
  const title = text.replace(/^(?:i\s+(?:have|need to finish|need to do)|add|remind me (?:about|to))\s+/i, '').split(/\s+(?:due|by|deadline)\b/i)[0].trim().slice(0, 120);
  return { title, deadline, notes: text, note: note || (deadline ? 'Check the date and reminder below before adding.' : 'What is the deadline? Choose a date below, for example 2026-11-20.') };
}

export function initTaskChat({ model, account, sync }) {
  const launch = document.createElement('button'); launch.className = 'task-chat-launch'; launch.textContent = '✦ Task helper';
  launch.setAttribute('aria-haspopup', 'dialog');
  const dialog = document.createElement('dialog'); dialog.className = 'task-chat'; dialog.setAttribute('aria-labelledby', 'task-chat-heading');
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="task-chat-heading">Tell me what’s due</h2><button type="button" class="secondary" id="task-chat-close">Close</button></div>
    <p>Save a task without picking a work time. This free helper uses text rules, not AI.</p>
    <form id="task-chat-message"><label for="task-chat-text">What do you need to finish?</label><textarea id="task-chat-text" maxlength="2000" required placeholder="I have a history project due next week"></textarea><button>Review task</button></form>
    <p id="task-chat-status" role="status" aria-live="polite"></p>
    <form id="task-chat-review" hidden><label>Task title<input name="title" maxlength="120" required></label><label>Deadline date<input name="deadline" type="date" required></label>
    <label>Estimated work (minutes, editable later)<input name="duration" type="number" min="1" max="1440" value="30" required></label>
    <label><input name="notify" type="checkbox" checked> Remind me about this deadline</label>
    <div class="task-chat-reminder"><label>Reminder date<input name="reminderDate" type="date" required></label><label>Reminder time<input name="reminderTime" type="time" value="09:00" required></label></div>
    <p class="fine-print" id="task-chat-delivery"></p><button>Add to tasks & deadlines</button></form>`;
  document.body.append(launch, dialog);
  const $ = s => dialog.querySelector(s), review = $('#task-chat-review'), f = review.elements;
  let draft, saved = false;
  launch.addEventListener('click', () => { dialog.showModal(); $('#task-chat-text').focus(); });
  $('#task-chat-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => launch.focus());
  function reminderFields() { const on = f.notify.checked; $('.task-chat-reminder').hidden = !on; f.reminderDate.disabled = f.reminderTime.disabled = !on; }
  f.notify.addEventListener('change', reminderFields);
  f.deadline.addEventListener('change', () => { if (validDate(f.deadline.value)) f.reminderDate.value = f.deadline.value; });
  $('#task-chat-message').addEventListener('submit', event => {
    event.preventDefault(); saved = false; draft = taskDraft($('#task-chat-text').value, model.snapshot().settings);
    review.hidden = false; f.title.value = draft.title; f.deadline.value = draft.deadline;
    f.deadline.min = zonedNow(new Date(), model.snapshot().settings.timeZone).date;
    f.reminderDate.value = draft.deadline; f.notify.checked = true; reminderFields();
    $('#task-chat-status').textContent = draft.note;
    $('#task-chat-delivery').textContent = `Reminder times use ${model.snapshot().settings.timeZone}. Suggested: 9 AM on the deadline date; change it below. Quiet hours apply. ${account.user && model.snapshot().settings.backgroundReminders ? 'Background reminders are enabled; the server must be running.' : 'To receive background notifications, sign in and enable this device in Settings → Notifications.'}`;
  });
  review.addEventListener('submit', async event => {
    event.preventDefault(); if (saved) return;
    const button = review.querySelector('button'); button.disabled = true;
    try {
      const { wallToInstant } = await import('./zoned-time.mjs');
      const settings = model.snapshot().settings;
      if (f.notify.checked && (f.reminderDate.value > f.deadline.value || wallToInstant(f.reminderDate.value, f.reminderTime.value, settings.timeZone) <= Date.now())) throw Error('Choose a future reminder on or before the deadline. No task has been added.');
      model.saveActivity({ id: newId(), kind: 'task', title: f.title.value.trim(), date: '', deadline: f.deadline.value, notes: draft.notes, duration: Number(f.duration.value), spent: 0, completed: false, locked: false, category: 'Study', priority: 'Medium', repeat: 'none', repeatUntil: '', reminder: 'default', ...(f.notify.checked ? { deadlineReminder: { date: f.reminderDate.value, time: f.reminderTime.value } } : {}) });
      saved = true; review.hidden = true;
      $('#task-chat-status').textContent = 'Added to tasks & deadlines. No calendar work time was booked. Saving…';
      await sync.flush();
      $('#task-chat-status').textContent = 'Saved to tasks & deadlines. No calendar work time was booked. You can edit or complete it in Tasks.';
    } catch (error) { $('#task-chat-status').textContent = saved ? `Task is in this tab, but account sync failed: ${error.message}` : error.message; }
    finally { button.disabled = false; }
  });
}
