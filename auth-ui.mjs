import { clearAccountCache } from './runtime.mjs';
import { signUp, signIn, sendPasswordReset, setNewPassword, loadPlanner, currentUser, providers, signInWithGoogle } from './cloud.mjs';

// Sign up / log in with email + password (accounts are stored in Supabase, so they work on every
// link and device). Also handles "Forgot password?" and the page the reset email links to.
export function initAuth(root, { mode = 'signup', onSuccess = result => location.assign(result.onboardingRequired ? 'onboarding.html' : 'dashboard.html') } = {}) {
  root.innerHTML = `<div class="auth-switch" role="group" aria-label="Account access"><button type="button" data-auth-mode="signup">Sign up</button><button type="button" data-auth-mode="login">Log in</button></div>
    <h2 id="auth-title"></h2><p id="auth-description" class="muted"></p>
    <div id="google-area" hidden><button type="button" id="google-signin" class="secondary google-signin"><svg viewBox="0 0 48 48" aria-hidden="true" width="18" height="18"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.2z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C8 41.1 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.7 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.4C2.9 17.1 2 20.5 2 24s.9 6.9 2.4 9.9l7.3-5.7z"/><path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8 6.9 4.4 14.1l7.3 5.7c1.7-5.2 6.6-9.1 12.3-9.1z"/></svg> Continue with Google</button><div class="auth-divider"><span>or use your email</span></div></div>
    <form id="account-form">
      <div id="email-field"><label for="account-email">Email</label><input id="account-email" name="email" type="email" autocomplete="email" maxlength="200" required></div>
      <div id="password-field"><label for="account-password">Password</label><input id="account-password" name="password" type="password" minlength="10" maxlength="200" required></div>
      <div id="confirm-password-field"><label for="account-confirm">Confirm password</label><input id="account-confirm" name="confirmPassword" type="password" autocomplete="new-password" maxlength="200"></div>
      <label class="auth-show-password"><input id="show-password" type="checkbox"> Show password</label>
      <button id="account-submit" type="submit"></button>
      <button type="button" id="forgot-password" class="text-button">Forgot password?</button>
      <p class="fine-print" id="auth-fine-print"></p>
    </form><p id="auth-error" role="alert"></p><p id="auth-note" role="status"></p>`;
  const $ = selector => root.querySelector(selector), form = $('#account-form'); let busy = false;
  const texts = {
    signup: ['A little space for you.', 'Create your account with your email. Your planner saves to it and works on any device.', 'Create account', 'Use at least 10 characters.'],
    login: ['Welcome back.', 'Your plans are right where you left them.', 'Log in', ''],
    forgot: ['Forgot your password?', 'Enter your email and we’ll send you a link to choose a new one.', 'Send reset link', ''],
    reset: ['Choose a new password', 'Pick a new password for your account.', 'Save new password', 'Use at least 10 characters.']
  };
  function setMode(next) {
    mode = next;
    root.querySelectorAll('[data-auth-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.authMode === mode)));
    $('.auth-switch').hidden = mode === 'reset';
    const [title, description, submit, fine] = texts[mode];
    $('#auth-title').textContent = title; $('#auth-description').textContent = description; $('#account-submit').textContent = submit; $('#auth-fine-print').textContent = fine;
    $('#email-field').hidden = mode === 'reset'; $('#account-email').required = mode !== 'reset';
    const needsPassword = mode !== 'forgot', confirm = mode === 'signup' || mode === 'reset';
    $('#password-field').hidden = !needsPassword; $('#account-password').required = needsPassword; $('#account-password').disabled = !needsPassword;
    $('#account-password').autocomplete = confirm ? 'new-password' : 'current-password';
    $('#confirm-password-field').hidden = !confirm; $('#account-confirm').required = confirm; $('#account-confirm').disabled = !confirm;
    $('.auth-show-password').hidden = !needsPassword;
    $('#forgot-password').hidden = mode !== 'login';
    $('#account-confirm').setCustomValidity(''); $('#auth-error').textContent = '';
  }
  root.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => { if (!busy) { $('#auth-note').textContent = ''; setMode(button.dataset.authMode); } }));
  $('#forgot-password').addEventListener('click', () => { if (!busy) setMode('forgot'); });
  // Show "Continue with Google" only when Google is switched on in Supabase.
  providers().then(list => { if (list.google) $('#google-area').hidden = mode === 'reset' || mode === 'forgot'; });
  $('#google-signin').addEventListener('click', async () => {
    if (busy) return; setBusy(true); $('#auth-error').textContent = '';
    try { clearAccountCache(); await signInWithGoogle(); } catch (error) { $('#auth-error').textContent = error.message; setBusy(false); }
  });
  $('#show-password').addEventListener('change', event => { for (const input of [$('#account-password'), $('#account-confirm')]) input.type = event.target.checked ? 'text' : 'password'; });
  for (const input of [$('#account-confirm'), $('#account-password')]) input.addEventListener('input', () => $('#account-confirm').setCustomValidity(''));
  function setBusy(value) { busy = value; for (const button of root.querySelectorAll('button')) button.disabled = value; }
  async function onboardingRequired(user) { const row = await loadPlanner(user.id); return !row || row.state?.settings?.onboardingComplete !== true; }

  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const email = $('#account-email').value.trim(), password = $('#account-password').value;
    if ((mode === 'signup' || mode === 'reset') && password !== $('#account-confirm').value) { $('#account-confirm').setCustomValidity('The passwords do not match.'); $('#account-confirm').reportValidity(); return; }
    setBusy(true); $('#auth-error').textContent = ''; $('#auth-note').textContent = '';
    try {
      if (mode === 'signup') {
        const result = await signUp(email, password);
        if (result.needsConfirmation) { form.reset(); setMode('login'); $('#auth-note').textContent = `We sent a confirmation link to ${email}. Open it, then log in here.`; return; }
        clearAccountCache(); form.reset(); onSuccess({ onboardingRequired: true });
      } else if (mode === 'login') {
        const user = await signIn(email, password);
        clearAccountCache(); form.reset(); onSuccess({ onboardingRequired: await onboardingRequired(user) });
      } else if (mode === 'forgot') {
        await sendPasswordReset(email);
        setMode('login'); $('#auth-note').textContent = `If ${email} has an account, a reset link is on its way. Open it on this device.`;
      } else if (mode === 'reset') {
        await setNewPassword(password);
        const user = await currentUser(); clearAccountCache(); form.reset();
        onSuccess({ onboardingRequired: user ? await onboardingRequired(user) : false });
      }
    } catch (error) { $('#auth-error').textContent = error.message; }
    finally { setBusy(false); }
  });
  setMode(mode in texts ? mode : 'signup');
  return { setMode };
}
