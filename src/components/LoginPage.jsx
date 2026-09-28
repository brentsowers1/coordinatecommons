// Login_Page (design.md: "LoginPage / LoginForm").
//
// Scope note (task 18.2): this component owns the actual authentication
// attempt and its outcomes -- calling `authenticationService.login`,
// applying the login-success side effects (Requirement 1.6), and mapping
// `INVALID_CREDENTIALS`/`TIMEOUT_OR_UNREACHABLE` rejections to the
// user-facing messages from Requirements 1.8/1.9. The form fields,
// client-side validation, and pending/disabled/loading UI belong to
// `LoginForm` (task 18.1) and are not duplicated here.
//
// Navigation note (Requirements 1.6, 1.7): `AuthGate` (task 19.1, not yet
// implemented) is what will actually choose between rendering `LoginPage`
// and `MapPage` based on `useSession`. Until `AuthGate` exists there is no
// router/parent to literally "navigate" to -- so `LoginPage` does not call
// any navigation function. Instead, on a successful login it applies the
// two side effects Requirement 1.6 actually requires: setting `useSession`
// to the new Session and resetting every category's slice of
// `useVisitedPlaceIdsByCategory` to `{}` (design.md: the discard-on-login
// behavior is not itself category-scoped). Once
// `AuthGate` exists, it will read `useSession`, see it go from `null` to
// non-null, and render `MapPage` instead of `LoginPage` -- which is what
// "navigates back to Map_View on success" means in practice for this
// application. `MapPage`/`useVisitedStatesLoader` (Requirement 4) is what
// then performs the load implied by Requirement 1.7 once it mounts; this
// component's job ends at setting shared state correctly.
//
// Error-message handling: LoginPage keeps its own `errorMessage` state
// (distinct from LoginForm's internal validation-message state) and passes
// it down to `LoginForm` via the `errorMessage` prop. It is reset to `null`
// at the very start of every `onSubmit` call (before `login()` is invoked)
// so a stale error from a previous attempt never lingers into a new one.
//
// Promise-settlement contract: `LoginForm` does
// `Promise.resolve(onSubmit(...)).finally(...)` to clear its own pending
// state, and does not inspect whether that promise resolves or rejects.
// Since nothing downstream of `onSubmit` needs its rejection, `onSubmit`
// here catches every `login()`/`handleLoginSuccess` failure itself (so it
// can set `errorMessage`) and lets its returned promise resolve either way.
//
// Sign-up link (Requirement 12.1): renders a "Sign up" link below
// `LoginForm` for visitors without an account, calling the `onRequestSignUp`
// callback prop on click -- `LoginPage` has no navigation concept of its
// own (see above), so this mirrors the same callback-prop-driven pattern
// `MapPage`/`TopNav` already use with `AuthGate`, and uses the same
// `<a href="#">` + `preventDefault()` link-styled-action pattern
// `TopNav.jsx` established for this router-less SPA.
//
// Sign-up success message (`successMessage` prop): after a visitor
// completes Sign_Up_Page's confirmation step, `AuthGate` navigates back to
// Login_Page AND passes along a message confirming the code was verified
// and the visitor can now log in (see SignUpPage.jsx's `onSignUpComplete`
// and AuthGate.jsx's own comment for the full lifecycle). `LoginPage` has
// no memory of its own for this -- it's parent-controlled, unlike
// `errorMessage` below, which is `LoginPage`'s own state for a failed
// *login* attempt (Requirements 1.8/1.9). The two are rendered
// independently and are not conflated: `successMessage` (when present) is
// rendered above `LoginForm` (i.e. above the username field), using
// `role="status"` to match this app's existing convention for positive/
// informational (non-error) messages (see `LoginPromptBanner.jsx`).

import React from 'react';
import { LoginForm } from './LoginForm';
import { login } from '../services/authenticationService';
import { handleLoginSuccess } from '../services/sessionHandlers';
import { useSession, useVisitedPlaceIdsByCategory } from '../state/sharedState';

const INVALID_CREDENTIALS_MESSAGE = 'The username or password is invalid.';
const TIMEOUT_MESSAGE = 'The login attempt could not be completed. Please try again.';

/**
 * @param {Object} props
 * @param {() => void} [props.onRequestSignUp] - called when the "Sign up"
 *   link is clicked (Requirement 12.1). Optional so existing callers/tests
 *   that don't care about sign-up navigation don't need to pass it.
 * @param {string | null} [props.successMessage] - a message to display
 *   above the username field, e.g. after a successful sign-up
 *   confirmation. Parent-controlled (see the module-level comment above);
 *   renders nothing when null/omitted.
 */
export function LoginPage({ onRequestSignUp, successMessage = null } = {}) {
  const [, setSession] = useSession();
  const [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
  const [errorMessage, setErrorMessage] = React.useState(null);

  async function handleSubmit(username, password) {
    // Clear any stale error from a prior attempt before starting a new one.
    setErrorMessage(null);

    try {
      const loginResult = await login(username, password);
      const { session, visitedPlaceIdsByCategory } = handleLoginSuccess(loginResult);
      // Requirement 1.6: store the Session and discard prior visited-place
      // data for every Place_Category (task 31.1) -- the discard-on-login
      // behavior is not itself category-scoped (design.md). See the
      // module-level comment above for why no explicit navigation call
      // happens here. handleLoginSuccess returns the full replacement
      // object for useVisitedPlaceIdsByCategory (all three categories
      // reset to `{}`), so it fully replaces the store rather than merging
      // into a single slice.
      setSession(session);
      setVisitedPlaceIdsByCategory(visitedPlaceIdsByCategory);
    } catch (error) {
      const kind = error && error.kind;
      if (kind === 'INVALID_CREDENTIALS') {
        // Requirement 1.8: stay on Login_Page, do not touch useSession.
        setErrorMessage(INVALID_CREDENTIALS_MESSAGE);
      } else {
        // Requirement 1.9: TIMEOUT_OR_UNREACHABLE (or any unrecognized
        // rejection shape) falls back to the timeout/unreachable message.
        setErrorMessage(TIMEOUT_MESSAGE);
      }
      // Intentionally not re-thrown: LoginForm's `.finally()` doesn't care
      // whether this promise resolves or rejects, and there is no further
      // consumer of a rejection here.
    }
  }

  function handleSignUpClick(event) {
    event.preventDefault();
    if (onRequestSignUp) {
      onRequestSignUp();
    }
  }

  return (
    <>
      {successMessage ? (
        <p role="status" data-testid="login-success-message">
          {successMessage}
        </p>
      ) : null}
      <LoginForm onSubmit={handleSubmit} errorMessage={errorMessage} />
      <p>
        <a href="#" onClick={handleSignUpClick} data-testid="signup-link">
          Sign up
        </a>
      </p>
    </>
  );
}
