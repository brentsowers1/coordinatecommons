// LoginPromptBanner component (design.md: "LoginPromptBanner"; Requirements
// 9.2, 9.3, 2.4).
//
// Rendered by `MapView` -- in the area below the map and above the
// Place_Visit_Status_Lists, and in MapView's loading/error states too --
// whenever `useSession` is `null` (Requirement 9.2), and never when it is
// non-null (Requirement 9.3). See MapView.jsx's placement note for why the
// banner sits above the visit-status lists rather than after them. This
// component is also standalone and testable on its own.
//
// Message copy (design.md leaves the exact wording open; this is the
// implementation's choice, documented here since there is no other source
// of truth for it):
//   - signOutReason === 'SESSION_ENDED': the session was cleared
//     involuntarily (token expiry or an auth-error response -- see
//     sessionHandlers.js's handleSessionExpiredOrAuthError/handleApiAuthError/
//     checkSessionBeforeApiCall). Copy: "Your session ended. Sign in to
//     save your visited states." (Requirement 2.4's "indicate that the
//     user was signed out because their session ended.") This variant is
//     PLAIN TEXT with no links -- it is driven by Requirement 2.4, whose
//     only job is to explain *why* the user was signed out, and it is
//     deliberately left unchanged by the neutral copy's link treatment
//     below.
//   - signOutReason === 'LOGOUT', or anything else (null, a guest who was
//     never signed in at all, or an unrecognized value): a neutral message
//     with no implication of an interruption. Copy: "Log in, or sign up
//     for an account, to save your visited states" -- where "Log in" and
//     "sign up for an account" are LINKS to the Login_Page and the
//     Sign_Up_Page respectively (Requirement 9.2). This covers both a
//     deliberate logout and "never logged in" identically, since neither
//     case implies something went wrong.
//
// Navigation (Requirement 9.2): the two links call the `onRequestLogin` /
// `onRequestSignUp` callback props. This component has no navigation
// concept of its own; the callbacks are forwarded down from `AuthGate`
// (the single owner of `currentPage`) through `MapPage` and `MapView`, and
// use the same `<a href="#">` + `preventDefault()` link-styled-action
// pattern `TopNav.jsx`/`LoginPage.jsx` established for this router-less
// SPA. Both props are optional, so the component stays standalone-
// renderable (clicking a link is then simply a no-op).
//
// Scope note: `useSignOutReason` (added to sharedState.js by this same
// task) is not yet set by every session-clearing call site in the app --
// see that hook's comment in sharedState.js. This component simply reads
// whatever is currently there.

import { useSession, useSignOutReason } from '../state/sharedState';
import { shouldShowLoginPrompt } from './shouldShowLoginPrompt';

const SESSION_ENDED_MESSAGE = 'Your session ended. Sign in to save your visited states.';

/**
 * The neutral (non-session-ended) message: "Log in, or sign up for an
 * account, to save your visited states", with the two phrases rendered as
 * links to the Login_Page / Sign_Up_Page (Requirement 9.2).
 *
 * Unlike SESSION_ENDED_MESSAGE this cannot be a plain string, since it
 * carries markup -- hence a small local component rather than a constant.
 *
 * @param {Object} props
 * @param {() => void} [props.onRequestLogin]
 * @param {() => void} [props.onRequestSignUp]
 */
function NeutralMessage({ onRequestLogin, onRequestSignUp }) {
  function handleLoginClick(event) {
    event.preventDefault();
    if (onRequestLogin) {
      onRequestLogin();
    }
  }

  function handleSignUpClick(event) {
    event.preventDefault();
    if (onRequestSignUp) {
      onRequestSignUp();
    }
  }

  return (
    <p>
      <a href="#" onClick={handleLoginClick} data-testid="login-prompt-login-link">
        Log in
      </a>
      , or{' '}
      <a href="#" onClick={handleSignUpClick} data-testid="login-prompt-signup-link">
        sign up for an account
      </a>
      , to save your visited states
    </p>
  );
}

/**
 * The login-prompt banner (Requirement 9.2/9.3).
 *
 * Renders nothing when there is a Session (Requirement 9.3); renders a
 * persistent message when there is not (Requirement 9.2), with wording
 * that distinguishes an involuntary sign-out (expiry/auth-error) from a
 * manual logout or never having signed in (Requirement 2.4).
 *
 * @param {Object} props
 * @param {() => void} [props.onRequestLogin] - called when the neutral
 *   message's "Log in" link is clicked (Requirement 9.2). Optional.
 * @param {() => void} [props.onRequestSignUp] - called when the neutral
 *   message's "sign up for an account" link is clicked (Requirement 9.2).
 *   Optional.
 */
export function LoginPromptBanner({ onRequestLogin, onRequestSignUp } = {}) {
  const [session] = useSession();
  const [signOutReason] = useSignOutReason();

  if (!shouldShowLoginPrompt(session)) {
    return null;
  }

  // Pico.css: `<article>` is Pico's documented "card" element
  // (picocss.com/docs/card) -- a bordered, padded block -- which reads
  // more like a distinct banner than a bare `<div>` would under Pico's
  // defaults. `role="status"`/the `data-testid` and message text are
  // unchanged.
  return (
    <article data-testid="login-prompt-banner" role="status">
      {signOutReason === 'SESSION_ENDED' ? (
        // Requirement 2.4: plain text, no links (see the copy notes above).
        <p>{SESSION_ENDED_MESSAGE}</p>
      ) : (
        // 'LOGOUT', null, or any other/unrecognized value: neutral message.
        <NeutralMessage
          onRequestLogin={onRequestLogin}
          onRequestSignUp={onRequestSignUp}
        />
      )}
    </article>
  );
}
