import { backendReachable } from './backend.mjs';

// Without an account server, sign-up/log-in pages can't work, so send visitors straight to
// the browser-only planner instead of to an error.
if (!(await backendReachable)) {
  document.querySelectorAll('.landing-login').forEach(link => { link.hidden = true; });
  for (const link of document.querySelectorAll('a[href^="auth.html"]')) {
    link.href = 'dashboard.html';
    if (link.closest('.nav-actions')) link.firstChild.textContent = 'Open planner ';
  }
}
