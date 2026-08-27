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
// to the new Session and resetting `useVisitedStateIds` to `{}`. Once
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

import React from 'react';
import { LoginForm } from './LoginForm';
import { login } from '../services/authenticationService';
import { handleLoginSuccess } from '../services/sessionHandlers';
import { useSession, useVisitedStateIds } from '../state/sharedState';

const INVALID_CREDENTIALS_MESSAGE = 'The username or password is invalid.';
const TIMEOUT_MESSAGE = 'The login attempt could not be completed. Please try again.';

export function LoginPage() {
  const [, setSession] = useSession();
  const [, setVisitedStateIds] = useVisitedStateIds();
  const [errorMessage, setErrorMessage] = React.useState(null);

  async function handleSubmit(username, password) {
    // Clear any stale error from a prior attempt before starting a new one.
    setErrorMessage(null);

    try {
      const loginResult = await login(username, password);
      const { session, visitedStateIds } = handleLoginSuccess(loginResult);
      // Requirement 1.6: store the Session and discard prior visited-state
      // data. See the module-level comment above for why no explicit
      // navigation call happens here.
      setSession(session);
      setVisitedStateIds(visitedStateIds);
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

  return <LoginForm onSubmit={handleSubmit} errorMessage={errorMessage} />;
}
