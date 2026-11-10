import { api } from './account-client.mjs';
import { clearAccountCache } from './runtime.mjs';

export function initAuth(root, { mode = 'signup', onSuccess = () => location.assign('dashboard.html'), timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone } = {}) {
  root.innerHTML = `<div class="auth-switch" role="group" aria-label="Account access"><button type="button" data-auth-mode="signup">Sign up</button><button type="button" data-auth-mode="login">Log in</button></div>
    <h2 id="auth-title"></h2><p id="auth-description" class="muted"></p>
    <button type="button" id="google-signin" class="secondary google-signin">Continue with Google</button><p class="auth-google-help fine-print">Sign in or create an account. Calendar and Gmail access are separate, optional connections.</p><div class="auth-divider"><span>or use a username</span></div>
    <form id="account-form"><label for="account-name">Username</label><input id="account-name" name="name" autocomplete="username" pattern="[a-zA-Z0-9_-]{3,40}" minlength="3" maxlength="40" required aria-describedby="username-help"><p id="username-help" class="fine-print">3–40 letters, numbers, underscores or hyphens.</p><label for="account-password">Password</label><input id="account-password" name="password" type="password" minlength="10" maxlength="200" required><div id="confirm-password-field"><label for="account-confirm">Confirm password</label><input id="account-confirm" name="confirmPassword" type="password" autocomplete="new-password" maxlength="200"></div><label class="auth-show-password"><input id="show-password" type="checkbox"> Show password</label><button id="account-submit" type="submit"></button><p class="fine-print">Use at least 10 characters. Password recovery is not available yet, so keep your password somewhere safe.</p></form><p id="auth-error" role="alert"></p><p class="fine-print">Your account has its own private planner. Existing browser-only tasks stay separate and can be copied after signing in.</p>`;
  const $ = selector => root.querySelector(selector), form = $('#account-form'); let busy = false;
  function setMode(next) {
    mode = next; const signup = mode === 'signup';
    root.querySelectorAll('[data-auth-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.authMode === mode)));
    $('#auth-title').textContent = signup ? 'A little space for you.' : 'Welcome back.';
    $('#auth-description').textContent = signup ? 'Create your account and make today yours.' : 'Your plans are right where you left them.';
    $('#account-submit').textContent = signup ? 'Create account' : 'Log in';
    $('#account-password').autocomplete = signup ? 'new-password' : 'current-password';
    $('#confirm-password-field').hidden = !signup; $('#account-confirm').required = signup; $('#account-confirm').disabled = !signup;
    $('#account-confirm').setCustomValidity(''); $('#auth-error').textContent = '';
  }
  root.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => { if (!busy) setMode(button.dataset.authMode); }));
  $('#show-password').addEventListener('change', event => { for (const input of [$('#account-password'), $('#account-confirm')]) input.type = event.target.checked ? 'text' : 'password'; });
  $('#account-confirm').addEventListener('input', () => $('#account-confirm').setCustomValidity(''));
  $('#account-password').addEventListener('input', () => $('#account-confirm').setCustomValidity(''));
  function setBusy(value) { busy = value; for (const button of root.querySelectorAll('button')) button.disabled = value; }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    if (mode === 'signup' && $('#account-password').value !== $('#account-confirm').value) { $('#account-confirm').setCustomValidity('The passwords do not match.'); $('#account-confirm').reportValidity(); return; }
    setBusy(true); $('#auth-error').textContent = '';
    try {
      await api(mode === 'signup' ? 'register' : 'login', 'POST', { name: $('#account-name').value, password: $('#account-password').value, timeZone: timeZone() });
      clearAccountCache(); form.reset(); onSuccess();
    } catch (error) { $('#auth-error').textContent = error.message; }
    finally { setBusy(false); }
  });
  $('#google-signin').addEventListener('click', async () => {
    if (busy) return; setBusy(true); $('#auth-error').textContent = '';
    try { const result = await api('auth/google/start', 'POST', { timeZone: timeZone() }); clearAccountCache(); location.assign(result.url); }
    catch (error) { $('#auth-error').textContent = error.message; setBusy(false); }
  });
  setMode(mode);
  return { setMode };
}
