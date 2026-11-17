import { initAuth } from './auth-ui.mjs';
import { cloud } from './cloud.mjs';
const params = new URLSearchParams(location.search), root = document.querySelector('#auth-root'), status = document.querySelector('#auth-page-status');
const mode = ['login', 'reset', 'forgot'].includes(params.get('mode')) ? params.get('mode') : 'signup';
// Loading the account system also finishes email links (confirm / password reset) found in the URL.
try {
  await cloud();
  // Back from Google: the account system has finished the login, so continue into the app.
  if (params.get('via') === 'google' || params.get('error_description')) {
    const { currentUser, loadPlanner, finishGoogleSignIn } = await import('./cloud.mjs');
    const idToken = new URLSearchParams(location.hash.slice(1)).get('id_token');
    if (idToken) history.replaceState(null, '', `${location.pathname}${location.search}`); // don't keep the token in the address bar
    let user = null;
    if (idToken) { try { user = await finishGoogleSignIn(idToken); } catch (error) { status.textContent = `Google sign-in didn’t finish: ${error.message}`; } }
    user ??= await currentUser().catch(() => null);
    if (user) { const row = await loadPlanner(user.id).catch(() => null); location.replace(!row || row.state?.settings?.onboardingComplete !== true ? 'onboarding.html' : 'dashboard.html'); await new Promise(() => {}); }
    status.textContent = params.get('error_description') ? `Google sign-in didn’t finish: ${params.get('error_description')}` : 'Google sign-in didn’t finish. Please try again.';
  }
  initAuth(root, { mode });
  if (params.get('confirmed') === '1') status.textContent = 'Your email is confirmed. Log in below.';
} catch (error) {
  // No internet or the account service can't load: the browser-only planner still works.
  const open = document.createElement('a');
  root.hidden = true;
  open.className = 'button'; open.href = 'dashboard.html'; open.textContent = 'Open my planner'; open.style.marginTop = '1rem';
  status.replaceChildren(`${error.message} Your planner still works on this device without an account.`, document.createElement('br'), open);
}
