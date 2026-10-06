// A returning learner: someone who already began the journey or wrote to the team on this browser.
// The module notes it in localStorage; the host page asks here on load and, when it is so, shows the
// module again (with any reply from the team) instead of an empty chat. Only then is the service
// asked, so visitors who never began cost no request.
import { api } from './api.js';

const KEY = 'shd.returning';

/** Called by the module once the learner has begun (a lesson, a choice) or sent a referral. */
export function rememberReturning() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Storage unavailable: the host simply will not offer the way back on the next visit.
  }
}

export function forgetReturning() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** True when this browser's learner has begun the journey or has a conversation with the team. */
export async function returningLearner() {
  try {
    if (localStorage.getItem(KEY) !== '1') return false;
  } catch {
    return false;
  }
  try {
    const [progress, conv] = await Promise.all([api.progress(), api.handoffMessages(0).catch(() => null)]);
    const begun = Boolean(progress?.choice) || (progress?.completed?.length || 0) > 0;
    const talked = (conv?.handoffs?.length || 0) > 0;
    if (!begun && !talked) forgetReturning();
    return begun || talked;
  } catch {
    return false;
  }
}

/** Whether the learner already went through the start card and the first choice. */
export async function hasBegun() {
  const progress = await api.progress();
  return Boolean(progress?.choice) || (progress?.completed?.length || 0) > 0;
}
