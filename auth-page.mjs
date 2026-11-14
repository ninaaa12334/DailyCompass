import { initAuth } from './auth-ui.mjs';
import { api } from './account-client.mjs';
const params = new URLSearchParams(location.search), root = document.querySelector('#auth-root');
initAuth(root, { mode: params.get('mode') === 'login' ? 'login' : 'signup' });
if (params.get('error') === 'google') document.querySelector('#auth-page-status').textContent = 'Google sign-in could not finish. Try again, or use your username and password. If this keeps happening, check the server Google credentials and authorized redirect.';
// Visiting Log in is an explicit request for the form, even with an existing
// session. A successful credential submission selects the requested account.
try { await api('session'); } catch {
  // No account server here (e.g. static hosting): accounts can't work, so offer the browser-only planner.
  const status = document.querySelector('#auth-page-status'), open = document.createElement('a');
  root.hidden = true;
  open.className = 'button'; open.href = 'dashboard.html'; open.textContent = 'Open my planner'; open.style.marginTop = '1rem';
  status.replaceChildren('Accounts aren’t available on this website, but your planner works right here. It saves on this device, no sign-up needed.', document.createElement('br'), open);
}
