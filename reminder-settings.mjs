import { api } from './account-client.mjs';

const statusText = {
  pending: 'Scheduled', quiet: 'Skipped: quiet hours', missed: 'Missed: activity already started',
  cancelled: 'Cancelled after a plan change', unavailable: 'Not sent: no configured push service or subscribed device',
  failed: 'Could not send', sending: 'Sending, or interrupted before confirmation',
  'accepted-by-push-service': 'Accepted by browser service; display not confirmed'
};
export function initReminderSettings({ model, account, sync, pushStatus }) {
  const $ = selector => document.querySelector(selector), panel = $('#settings-notifications');
  const preferences = document.createElement('section'); preferences.className = 'reminder-preferences';
  preferences.innerHTML = '<h4>When to remind me</h4><form id="reminder-preferences-form"><label for="reminder-lead">Default minutes before an activity<input type="number" id="reminder-lead" min="0" max="1440" required></label><p class="fine-print">0 means at the start. Each activity can override this default or turn its reminder off. A flexible task needs a scheduled start time first; a date-only deadline does not create a notification.</p><label><input type="checkbox" id="reminder-use-quiet"> Pause reminders during quiet hours</label><div class="assistant-fields" id="reminder-quiet-fields"><label>Quiet hours start<input type="time" id="reminder-quiet-start" required></label><label>Quiet hours end<input type="time" id="reminder-quiet-end" required></label></div><p class="fine-print" id="reminder-timezone"></p><button type="submit">Save reminder preferences</button><p id="reminder-preferences-status" role="status"></p></form>';
  $('#push-status').before(preferences);
  const upcoming = document.createElement('section'); upcoming.className = 'reminder-schedule';
  upcoming.innerHTML = '<h4>Upcoming reminders</h4><p class="fine-print">Saved Day Compass activities in the next 31 days. Refresh after changing an activity. The server checks about every 15 seconds; device delivery may be delayed.</p><p id="reminder-center-status" role="status"></p><ul id="scheduled-reminders"></ul><details><summary>Recent attempts & changes</summary></details>';
  upcoming.querySelector('details').append($('#notification-center')); panel.append(upcoming);
  const form = $('#reminder-preferences-form');
  function quietFields() { const enabled = $('#reminder-use-quiet').checked; $('#reminder-quiet-fields').hidden = !enabled; for (const id of ['#reminder-quiet-start', '#reminder-quiet-end']) $(id).disabled = !enabled; }
  function loadPreferences() {
    const s = model.snapshot().settings;
    $('#reminder-lead').value = s.reminderMinutes;
    const quiet = s.quietStart !== s.quietEnd; $('#reminder-use-quiet').checked = quiet;
    $('#reminder-quiet-start').value = quiet ? s.quietStart : '22:00'; $('#reminder-quiet-end').value = quiet ? s.quietEnd : '07:00';
    $('#reminder-timezone').textContent = `Times use ${s.timeZone}. Quiet-hour reminders are skipped, rather than postponed until morning. Imported Google events and routine templates are not included.`;
    quietFields();
  }
  $('#reminder-use-quiet').addEventListener('change', quietFields);
  let refreshing = false;
  async function refresh() {
    if (refreshing) return; refreshing = true;
    try {
      $('#scheduled-reminders').replaceChildren(); $('#notification-center').replaceChildren();
      if (!account.user) { $('#reminder-center-status').textContent = 'Sign in under Account and enable background reminders on this device to receive scheduled notifications.'; return; }
      await sync.flush();
      const records = await api('reminders'), timeZone = model.snapshot().settings.timeZone;
      const pending = records.filter(r => r.status === 'pending').sort((a, b) => a.due - b.due);
      function row(r) {
        const li = document.createElement('li'), title = document.createElement('strong'), detail = document.createElement('span');
        title.textContent = r.title; detail.textContent = `${new Date(r.due).toLocaleString(undefined, { timeZone })} · ${r.status === 'pending' && r.quiet ? 'Will be skipped: quiet hours' : statusText[r.status] || r.status}${r.error ? ` · ${r.error}` : ''}`;
        li.append(title, detail); return li;
      }
      for (const r of pending.slice(0, 8)) $('#scheduled-reminders').append(row(r));
      for (const r of records.filter(r => r.status !== 'pending').sort((a, b) => b.due - a.due).slice(0, 12)) $('#notification-center').append(row(r));
      $('#reminder-center-status').textContent = !model.snapshot().settings.backgroundReminders ? 'Background reminders are off. Enable this device above to schedule them.' : pending.length ? `${pending.length} upcoming reminder${pending.length === 1 ? '' : 's'}. A scheduled reminder still needs a subscribed device and a running server.` : 'No upcoming reminders. Give an unfinished task or activity a calendar time and set its reminder to Default or a lead time.';
      await pushStatus();
    } catch (error) { $('#reminder-center-status').textContent = error.message; }
    finally { refreshing = false; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
    try {
      const quiet = $('#reminder-use-quiet').checked, start = $('#reminder-quiet-start').value, end = $('#reminder-quiet-end').value;
      if (quiet && start === end) throw new Error('Choose different quiet-hour start and end times, or turn quiet hours off.');
      model.saveSettings({ reminderMinutes: Number($('#reminder-lead').value), quietStart: quiet ? start : '00:00', quietEnd: quiet ? end : '00:00' });
      await sync.flush(); $('#reminder-preferences-status').textContent = 'Reminder preferences saved. Completed activities do not send reminders.'; await refresh();
    } catch (error) { $('#reminder-preferences-status').textContent = error.message; }
    finally { button.disabled = false; }
  });
  $('#reminder-refresh').textContent = 'Refresh reminders'; $('#reminder-refresh').addEventListener('click', refresh);
  $('[data-settings-view=notifications]').addEventListener('click', () => { loadPreferences(); refresh(); });
  loadPreferences();
  if (location.hash === '#notifications') refresh();
  const timer = setInterval(() => { if (!document.hidden && !panel.hidden && !$('#settings-panel').hidden) refresh(); }, 30000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  return { refresh };
}
