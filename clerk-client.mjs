import { api } from './account-client.mjs';
let loading;
function script(url, attributes = {}) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script'); element.src = url; element.crossOrigin = 'anonymous';
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    const timer = setTimeout(() => reject(new Error('Clerk took too long to load. Check your connection and retry.')), 20000);
    element.onload = () => { clearTimeout(timer); resolve(); }; element.onerror = () => { clearTimeout(timer); reject(new Error('Clerk could not load. Check your connection, browser blocking settings and publishable key.')); };
    document.head.append(element);
  });
}
export async function loadClerk() {
  if (!loading) loading = (async () => {
    const config = await api('auth/provider');
    if (config.provider !== 'clerk') throw new Error('Add CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to private .env, then restart Day Compass.');
    await script(`${config.frontendOrigin}/npm/@clerk/ui@1/dist/ui.browser.js`);
    await script(`${config.frontendOrigin}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, { 'data-clerk-publishable-key': config.publishableKey });
    if (!window.Clerk || !window.__internal_ClerkUICtor) throw new Error('Clerk SDK did not initialize. Check the application keys.');
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor }, signInUrl: '/clerk-signin.html', signUpUrl: '/clerk-signin.html?mode=signup', signInForceRedirectUrl: '/clerk-signin.html?complete=1', signUpForceRedirectUrl: '/clerk-signin.html?complete=1' });
    return window.Clerk;
  })().catch(error => { loading = null; throw error; });
  return loading;
}
export async function signOutClerk() { const clerk = await loadClerk(); await clerk.signOut(); }
