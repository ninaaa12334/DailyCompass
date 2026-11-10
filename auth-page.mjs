import { initAuth } from './auth-ui.mjs';
import { api } from './account-client.mjs';
const params = new URLSearchParams(location.search), root = document.querySelector('#auth-root');
initAuth(root, { mode: params.get('mode') === 'login' ? 'login' : 'signup' });
if (params.get('error') === 'google') document.querySelector('#auth-page-status').textContent = 'Google sign-in could not finish. Try again, or use your username and password. If this keeps happening, check the server Google credentials and authorized redirect.';
try { const session = await api('session'); if (session.user) { root.replaceChildren(); document.querySelector('.auth-local-link').hidden = true; const text = document.createElement('p'); text.textContent = `You are signed in as ${session.user.name}.`; const link = document.createElement('a'); link.className = 'button'; link.href = 'dashboard.html'; link.textContent = 'Open my planner'; root.append(text, link); } } catch { document.querySelector('#auth-page-status').textContent = 'The account server is unavailable. Start the Node server to sign up or log in. Your local planner is still available.'; }
