// Accounts that work from anywhere: sign-in and the planner are stored in Supabase (free plan).
// The URL and publishable key are public by design; security comes from row level security, so each
// signed-in person can only read and save their own planner (see supabase-tools/schema.sql).
export const SUPABASE_URL = 'https://ffjjvkbojuetcdmpqapx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_uL03_LEg7r7fkqc0FkQGRg_1GzUSsVk';

let clientPromise = null;
// supabase-umd.js is a local copy of @supabase/supabase-js 2.118.0 (the home server only allows its own scripts).
export function cloud() {
  return clientPromise ??= new Promise((resolve, reject) => {
    const create = () => resolve(window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'day-compass.cloud-auth' } }));
    if (window.supabase?.createClient) return create();
    const script = document.createElement('script');
    script.src = '/supabase-umd.js'; script.onload = create;
    script.onerror = () => { clientPromise = null; reject(Object.assign(new Error('Could not load the account system. Check your internet connection.'), { network: true })); };
    document.head.append(script);
  });
}

// Turn Supabase errors into the shapes and plain words the app already handles.
function fail(error, fallback) {
  const code = error?.code, message = String(error?.message || fallback || 'Something went wrong.');
  if (code === '40001' || /conflict/i.test(message)) return Object.assign(new Error('Your planner changed on another device.'), { status: 409 });
  if (code === '28000' || code === 'PGRST301' || /JWT|not signed in/i.test(message)) return Object.assign(new Error('You’re signed out. Sign in again.'), { status: 401 });
  if (code === '54000' || /too large/i.test(message)) return Object.assign(new Error('Your planner is too large to save.'), { status: 413 });
  if (/fetch|network|Load failed/i.test(message)) return Object.assign(new Error('Can’t reach the account service. Check your internet connection.'), { network: true });
  const friendly = { 'Invalid login credentials': 'That email and password don’t match an account.', 'User already registered': 'There is already an account with this email. Log in instead.', 'Email not confirmed': 'Please confirm your email first (check your inbox), then log in.' }[message];
  return Object.assign(new Error(friendly || message), { status: error?.status });
}

export async function currentUser() {
  const sb = await cloud();
  const { data, error } = await sb.auth.getSession();
  if (error) throw fail(error);
  return data.session?.user || null;
}
export async function loadPlanner(userId) {
  const sb = await cloud();
  const { data, error } = await sb.from('planners').select('state, version').eq('user_id', userId).maybeSingle();
  if (error) throw fail(error);
  return data; // null for a brand-new account
}
export async function savePlanner(state, version) {
  const sb = await cloud();
  const { data, error } = await sb.rpc('save_planner', { new_state: state, expected_version: version });
  if (error) throw fail(error);
  return { version: data };
}

export async function signUp(email, password) {
  const sb = await cloud();
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth.html?mode=login&confirmed=1` } });
  if (error) throw fail(error);
  // With "Confirm email" switched on, Supabase returns no session until the link is clicked.
  return { user: data.user, needsConfirmation: !data.session };
}
export async function signIn(email, password) {
  const sb = await cloud();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw fail(error);
  return data.user;
}
// Which sign-in methods are switched on in Supabase (e.g. Google, once its client ID is added).
export async function providers() {
  try { const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } }); return (await response.json()).external || {}; } catch { return {}; }
}
// "Continue with Google": one Google screen signs in AND connects Google Calendar.
// The Day Compass service runs the Google step; the page then signs in to Supabase with Google's
// ID token. A one-time random value (nonce) proves the token was made for this exact sign-in.
const NONCE_KEY = 'day-compass.google-nonce';
const GOOGLE_SERVICE = 'https://day-compass-push.day-compass-push.workers.dev';
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
export async function signInWithGoogle() {
  const raw = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hashed = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
  sessionStorage.setItem(NONCE_KEY, raw);
  const response = await fetch(`${GOOGLE_SERVICE}/google/login-start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nonce: hashed }) }).catch(() => null);
  const body = await response?.json().catch(() => ({}));
  if (!response?.ok || !body?.url) throw new Error(body?.error || 'Google sign-in isn’t available right now. Try again in a moment.');
  location.assign(body.url);
}
export async function finishGoogleSignIn(idToken) {
  const sb = await cloud(), nonce = sessionStorage.getItem(NONCE_KEY) || undefined;
  sessionStorage.removeItem(NONCE_KEY);
  const { data, error } = await sb.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce });
  if (error) throw fail(error);
  return data.user;
}
// The signed-in person's token, so our own server can check who is asking (used for reading photos).
export async function accessToken() { const sb = await cloud(); const { data } = await sb.auth.getSession(); return data?.session?.access_token || ''; }
export async function signOut() { const sb = await cloud(); await sb.auth.signOut(); }
export async function sendPasswordReset(email) {
  const sb = await cloud();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth.html?mode=reset` });
  if (error) throw fail(error);
}
export async function setNewPassword(password) {
  const sb = await cloud();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw fail(error);
}
export async function deleteAccount() {
  const sb = await cloud();
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw fail(error);
  await sb.auth.signOut();
}
