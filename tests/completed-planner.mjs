import { memoryModel } from '../server/plans.mjs';
// Feature tests use an account that has already finished welcome setup.
export function completedSnapshot() {
  const state = memoryModel().snapshot(); state.settings.onboardingComplete = true; return state;
}
