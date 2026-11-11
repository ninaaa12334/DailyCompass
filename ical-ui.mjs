import { api } from './account-client.mjs';

export function initPrivateCalendar({ account, sync }) {
  const $ = selector => document.querySelector(selector);
  const requireAccount = () => { if (!account.user) throw new Error('Sign in under Settings > Account before connecting your private calendar.'); };
  async function refreshStatus() {
    if (!account.user) { $('#ical-status').textContent = 'Sign in under Account to save a private connection.'; return; }
    try {
      const status = await api('ical/status');
      $('#ical-status').textContent = status.connected ? `Connected (read-only). ${status.lastSync ? `Last refreshed: ${new Date(status.lastSync).toLocaleString()}.` : 'Not refreshed yet.'} ${status.error || ''}` : 'No private calendar link connected.';
    } catch (error) { $('#ical-status').textContent = error.message; }
  }
  async function change(button, action) {
    button.disabled = true; $('#ical-status').textContent = 'Working…';
    try { requireAccount(); await sync.flush(); await action(); }
    catch (error) { $('#ical-status').textContent = error.message; }
    finally { button.disabled = false; }
  }
  $('#ical-form').addEventListener('submit', event => {
    event.preventDefault(); const url = $('#ical-url').value.trim(); $('#ical-url').value = '';
    change($('#ical-connect'), async () => { await sync.replace(await api('ical/sync', 'POST', { url })); await refreshStatus(); });
  });
  $('#ical-refresh').addEventListener('click', event => change(event.currentTarget, async () => { await sync.replace(await api('ical/sync', 'POST', {})); await refreshStatus(); }));
  $('#ical-disconnect').addEventListener('click', event => change(event.currentTarget, async () => { await sync.replace(await api('ical/disconnect', 'POST', {})); await refreshStatus(); }));
  $('[data-settings-view=calendar]').addEventListener('click', refreshStatus);
  refreshStatus();
}
