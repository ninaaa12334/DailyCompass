import { createStorage } from './storage.mjs';
// The demo uses separate session storage; it never writes your real planner keys.
export const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';
export const storage = createStorage(() => window.localStorage, () => window.sessionStorage, isDemo);
