import { loadClerk } from './clerk-client.mjs';
import { api } from './account-client.mjs';
import { clearAccountCache } from './runtime.mjs';
const status = document.querySelector('#clerk-status'), root = document.querySelector('#clerk-widget');
document.querySelector('#clerk-retry').addEventListener('click', () => location.reload());
try {
  const existing = await api('session');
  if (existing.user) location.replace('dashboard.html');
  else {
    const clerk = await loadClerk();
    if (clerk.session) {
      status.textContent = 'Verifying your private planner account…';
      const token = await clerk.session.getToken();
      await api('auth/clerk/session', 'POST', { token, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      clearAccountCache(); location.replace('dashboard.html');
    } else {
      const signup = new URLSearchParams(location.search).get('mode') === 'signup';
      const options = { routing: 'hash', forceRedirectUrl: `${location.origin}/clerk-signin.html?complete=1`, signInUrl: '/clerk-signin.html', signUpUrl: '/clerk-signin.html?mode=signup' };
      if (signup) clerk.mountSignUp(root, options); else clerk.mountSignIn(root, options);
      status.textContent = 'Use your Google account in the secure sign-in form.';
    }
  }
} catch (error) { status.textContent = ''; document.querySelector('#clerk-error').hidden = false; document.querySelector('#clerk-error').textContent = error.message; document.querySelector('#clerk-retry').hidden = false; }
