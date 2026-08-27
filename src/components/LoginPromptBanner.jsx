// LoginPromptBanner component (design.md: "LoginPromptBanner"; Requirements
// 9.2, 9.3, 2.4).
//
// Rendered by `MapPage` below `MapView` (task 19.1, not yet implemented)
// whenever `useSession` is `null` (Requirement 9.2), and never when it is
// non-null (Requirement 9.3). This task implements the component itself,
// standalone and testable on its own -- `MapPage` doesn't exist yet, so
// nothing renders this component inside the real app tree until task 19.1.
//
// Message copy (design.md leaves the exact wording open; this is the
// implementation's choice, documented here since there is no other source
// of truth for it):
//   - signOutReason === 'SESSION_ENDED': the session was cleared
//     involuntarily (token expiry or an auth-error response -- see
//     sessionHandlers.js's handleSessionExpiredOrAuthError/handleApiAuthError/
//     checkSessionBeforeApiCall). Copy: "Your session ended. Sign in to
//     save your visited states." (Requirement 2.4's "indicate that the
//     user was signed out because their session ended.")
//   - signOutReason === 'LOGOUT', or anything else (null, a guest who was
//     never signed in at all, or an unrecognized value): a neutral message
//     with no implication of an interruption. Copy: "Sign in to save your
//     visited states across sessions." This covers both a deliberate
//     logout and "never logged in" identically, since neither case implies
//     something went wrong.
//
// Scope note: `useSignOutReason` (added to sharedState.js by this same
// task) is not yet set by every session-clearing call site in the app --
// see that hook's comment in sharedState.js. This component simply reads
// whatever is currently there.

import { useSession, useSignOutReason } from '../state/sharedState';
import { shouldShowLoginPrompt } from './shouldShowLoginPrompt';

const SESSION_ENDED_MESSAGE = 'Your session ended. Sign in to save your visited states.';
const NEUTRAL_MESSAGE = 'Sign in to save your visited states across sessions.';

/**
 * Picks the banner's message text for a given `signOutReason`.
 *
 * @param {'LOGOUT' | 'SESSION_ENDED' | null} signOutReason
 * @returns {string}
 */
function resolveMessage(signOutReason) {
  if (signOutReason === 'SESSION_ENDED') {
    return SESSION_ENDED_MESSAGE;
  }
  // 'LOGOUT', null, or any other/unrecognized value: neutral message.
  return NEUTRAL_MESSAGE;
}

/**
 * The login-prompt banner (Requirement 9.2/9.3).
 *
 * Renders nothing when there is a Session (Requirement 9.3); renders a
 * persistent message when there is not (Requirement 9.2), with wording
 * that distinguishes an involuntary sign-out (expiry/auth-error) from a
 * manual logout or never having signed in (Requirement 2.4).
 */
export function LoginPromptBanner() {
  const [session] = useSession();
  const [signOutReason] = useSignOutReason();

  if (!shouldShowLoginPrompt(session)) {
    return null;
  }

  return (
    <div data-testid="login-prompt-banner" role="status">
      <p>{resolveMessage(signOutReason)}</p>
    </div>
  );
}
