import { createStorage } from './storage.mjs';
// The demo uses separate session storage; it never writes your real planner keys.
export const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';
let accountId = null;
const base = createStorage(() => window.localStorage, () => window.sessionStorage, isDemo);
export const storage = {
  getItem(key) { return accountId && !isDemo ? sessionStorage.getItem(`account.${accountId}.${key}`) : base.getItem(key); },
  setItem(key, value) { if (accountId && !isDemo) sessionStorage.setItem(`account.${accountId}.${key}`, value); else base.setItem(key, value); }
};
export function useAccount(id, snapshot) { accountId = id; storage.setItem('day-compass.planner.v2', JSON.stringify(snapshot)); }
export function clearAccountCache() { for (const key of Object.keys(sessionStorage)) if (key.startsWith('account.')) sessionStorage.removeItem(key); }
