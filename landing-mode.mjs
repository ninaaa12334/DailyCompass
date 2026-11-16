import { cloud } from './cloud.mjs';

// Without an account server, sign-up/log-in pages can't work, so send visitors straight to
// the browser-only planner instead of to an error.
// Accounts work everywhere (Supabase). Only if the account service can't load is sign-up hidden.
if (!(await cloud().then(() => true, () => false))) {
  document.querySelectorAll('.landing-login').forEach(link => { link.hidden = true; });
  for (const link of document.querySelectorAll('a[href^="auth.html"]')) {
    link.href = 'dashboard.html';
    if (link.closest('.nav-actions')) link.firstChild.textContent = 'Open planner ';
  }
}
