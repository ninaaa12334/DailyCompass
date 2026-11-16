import { initAuth } from './auth-ui.mjs';
import { cloud } from './cloud.mjs';
const params = new URLSearchParams(location.search), root = document.querySelector('#auth-root'), status = document.querySelector('#auth-page-status');
const mode = ['login', 'reset', 'forgot'].includes(params.get('mode')) ? params.get('mode') : 'signup';
// Loading the account system also finishes email links (confirm / password reset) found in the URL.
try {
  await cloud();
  initAuth(root, { mode });
  if (params.get('confirmed') === '1') status.textContent = 'Your email is confirmed. Log in below.';
} catch (error) {
  // No internet or the account service can't load: the browser-only planner still works.
  const open = document.createElement('a');
  root.hidden = true;
  open.className = 'button'; open.href = 'dashboard.html'; open.textContent = 'Open my planner'; open.style.marginTop = '1rem';
  status.replaceChildren(`${error.message} Your planner still works on this device without an account.`, document.createElement('br'), open);
}
