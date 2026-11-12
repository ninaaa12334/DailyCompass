import { initAuth } from './auth-ui.mjs';
import { api } from './account-client.mjs';
const params = new URLSearchParams(location.search), root = document.querySelector('#auth-root');
initAuth(root, { mode: params.get('mode') === 'login' ? 'login' : 'signup' });
if (params.get('error') === 'google') document.querySelector('#auth-page-status').textContent = 'Google sign-in could not finish. Try again, or use your username and password. If this keeps happening, check the server Google credentials and authorized redirect.';
// Visiting Log in is an explicit request for the form, even with an existing
// session. A successful credential submission selects the requested account.
try { await api('session'); } catch { document.querySelector('#auth-page-status').textContent = 'The account server is unavailable. Start the Node server to sign up or log in. Your local planner is still available.'; }
