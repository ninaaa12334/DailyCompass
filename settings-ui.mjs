// Organize the existing working controls; changing sections never saves a setting.
export function initSettings({ account }) {
  const $ = selector => document.querySelector(selector), root = $('#settings-panel');
  const create = (tag, text, className) => { const n = document.createElement(tag); if (text) n.textContent = text; if (className) n.className = className; return n; };
  $('#settings-heading').textContent = 'Settings';
  const intro = create('p', 'Your planning preferences, connections and privacy, in one place.', 'muted');
  const layout = create('div', null, 'settings-layout'), nav = create('nav', null, 'settings-navigation'), content = create('div', null, 'settings-content');
  nav.setAttribute('aria-label', 'Settings sections'); layout.append(nav, content); root.append(layout);
  $('#settings-heading').after(intro);
  const blocks = [...root.querySelectorAll(':scope > .settings-block')];
  const accountBlock = blocks.find(n => n.contains($('#account-status'))), calendar = $('#connections'), notifications = blocks.find(n => n.contains($('#push-status'))), history = blocks.find(n => n.contains($('#history-view')));
  const planning = create('section', null, 'settings-block'); planning.append(create('h3', 'Planning & appearance'));
  const setup = $('#setup-open'), explanation = setup.nextElementSibling?.tagName === 'P' ? setup.nextElementSibling : $('#open-planning-settings').nextElementSibling;
  planning.append(setup, $('#open-planning-settings')); if (explanation?.tagName === 'P') planning.append(explanation);
  const appearance = create('button', 'Colors & appearance', 'secondary'); appearance.type = 'button'; appearance.addEventListener('click', () => $('[data-open-appearance]').click()); planning.append(appearance, $('.opportunities-widget'));
  const privacy = create('section', null, 'settings-block'); privacy.append(create('h3', 'Privacy & data'), history);
  const privateActions = create('div'); privateActions.hidden = !account.user; privateActions.append($('#account-export'), $('#account-delete').closest('details')); privacy.append(privateActions);
  calendar.querySelector('h3').textContent = 'Google Calendar'; notifications.querySelector('h3').textContent = 'Notifications';
  const panels = new Map();
  for (const [id, label, panel] of [['planning', 'Planning', planning], ['calendar', 'Google Calendar', calendar], ['notifications', 'Notifications', notifications], ['account', 'Account', accountBlock], ['privacy', 'Privacy', privacy]]) {
    panel.id ||= `settings-${id}`; panel.dataset.settingsSection = id;
    const b = create('button', label, 'secondary'); b.type = 'button'; b.dataset.settingsView = id; b.setAttribute('aria-controls', panel.id);
    b.addEventListener('click', () => select(id)); nav.append(b); content.append(panel); panels.set(id, { panel, b });
  }
  function select(id) { for (const [key, { panel, b }] of panels) { panel.hidden = key !== id; b.setAttribute('aria-pressed', String(key === id)); } }
  select(location.hash === '#connections' ? 'calendar' : location.hash === '#notifications' ? 'notifications' : 'planning');
  const googleHelp = create('details', null, 'connection-setup'); googleHelp.id = 'google-setup-help';
  googleHelp.innerHTML = '<summary>Set up the Google Calendar connection</summary><ol><li>In Google Cloud, select a project and enable Google Calendar API.</li><li>Configure Google Auth platform: Branding, External audience, and your Google account as a test user.</li><li>Create an OAuth client of type Web application. Add this exact authorized redirect URI:<code id="google-redirect-uri"></code></li><li>Save GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server’s private .env, then restart the server. Keep your Clerk keys as they are.</li><li>Sign in here, connect Google Calendar, choose calendars, then import. Google sign-in alone does not give calendar access.</li></ol><a href="https://developers.google.com/workspace/calendar/api/quickstart/nodejs" target="_blank" rel="noopener noreferrer">Official Google setup guide</a>';
  calendar.querySelector('h3').after(create('p', account.features.google ? 'Server ready. Connect your Google account, then choose which calendars to import.' : 'Server setup needed: Google Calendar credentials have not been configured.', 'settings-readiness'), googleHelp);
  $('#google-redirect-uri').textContent = `${location.origin}/api/google/callback`;
  const email = create('details', null, 'settings-advanced'); email.append(create('summary', 'Optional: Gmail event suggestions'), create('p', 'Separate read-only email permission. Review each suggestion before adding it; email content is never sent to AI.', 'fine-print'));
  for (const selector of ['[data-connect=gmail]', '#gmail-scan', '[data-disconnect=gmail]', '#gmail-cards']) email.append($(selector));
  calendar.append(email);
  calendar.querySelector('.fine-print').textContent = 'Import selected Google calendars as read-only busy events. Edit those events in Google Calendar. Export to a separate Day Compass calendar is optional.';
  const advanced = create('details', null, 'settings-advanced'); advanced.append(create('summary', 'Optional: export Day Compass activities to Google'));
  advanced.append($('[data-connect=calendar-write]'), $('#google-auto-export').closest('label')); $('#google-calendars').after(advanced);
  const oauth = create('details', null, 'settings-advanced'); oauth.append(create('summary', 'Advanced: Google OAuth connection (Google Cloud required)'));
  for (const child of [...calendar.children]) if (child.tagName !== 'H3') oauth.append(child);
  const feed = create('section', null, 'private-calendar-setup');
  feed.innerHTML = '<h4>Connect with a private iCal link</h4><p>No Google Cloud account or API keys needed. Read-only: edit events in Google Calendar. Google may delay feed updates.</p><ol class="fine-print"><li>In Google Calendar Settings, select your calendar under Settings for my calendars.</li><li>Open Integrate calendar and copy Secret address in iCal format.</li><li>Paste it below. Do not make the calendar public or share this link in chat.</li></ol><form id="ical-form"><label for="ical-url">Secret address in iCal format</label><input type="password" id="ical-url" name="url" required maxlength="2048" autocomplete="off" spellcheck="false" placeholder="Paste your private Google Calendar link"><p class="fine-print">Anyone with this link can read your calendar. It is sent only to your Day Compass server, stored encrypted, and never included in backups or returned to the browser. Disconnect deletes the saved link; reset it in Google Calendar to revoke it everywhere.</p><button id="ical-connect">Connect & import calendar</button></form><p id="ical-status" role="status"></p><div class="assistant-actions"><button type="button" class="secondary" id="ical-refresh">Refresh imported events</button><button type="button" class="secondary" id="ical-disconnect">Disconnect private link</button></div><p class="fine-print">Imports cover the past 7 and next 90 days. Automatic refresh runs about every 15 minutes while the server stays on. Imported events stay private, block scheduling conflicts, and currently have reminders off. Use one connection method per calendar to avoid duplicate entries.</p>';
  calendar.append(feed, oauth);
  const pushHelp = create('details', null, 'connection-setup'); pushHelp.id = 'push-setup-help';
  pushHelp.innerHTML = '<summary>What background reminders need</summary><ol><li>Sign in to a private Day Compass account.</li><li>Set up the server once: run <code>npm.cmd run setup:push</code> in the project terminal, enter a contact email, and restart the server. The keys stay in .env.</li><li>Use HTTPS on a hosted site, or this computer’s localhost address for development. The Node server must stay running and the computer must stay awake.</li><li>On iPhone/iPad, add the HTTPS site to the Home Screen and open it from there.</li><li>Enable reminders on this device, allow browser notifications, then send a test notification.</li><li>Set the default reminder time and quiet hours in Planning settings. Routine templates and imported Google events currently have reminders off; create a saved Day Compass activity for a scheduled reminder.</li></ol><p class="fine-print">A push service accepting a notification does not prove the device displayed it. Device settings, sleep, network and quiet hours can delay or block delivery.</p>';
  notifications.querySelector('h3').after(create('p', account.features.push ? 'Server ready. Enable this device and send a test.' : 'Server setup needed: notification keys and a push contact are missing.', 'settings-readiness'), pushHelp);
  const test = create('button', 'Send test notification', 'secondary'); test.type = 'button'; test.id = 'push-test'; $('#push-enable').after(test);
  const testStatus = create('p'); testStatus.id = 'push-test-status'; testStatus.setAttribute('role', 'status'); test.closest('.assistant-actions').after(testStatus);
  return { select };
}
