// Username/password form for the Login_Page (design.md: "LoginPage /
// LoginForm").
//
// Scope note (task 18.1): this component owns only the fields themselves,
// client-side validation via `validateCredentials`, and the
// pending/disabled/loading UI while a submission is in flight. It does not
// call `AuthenticationService.login` itself, does not know about
// `INVALID_CREDENTIALS`/`TIMEOUT_OR_UNREACHABLE`, and does not touch
// `useSession`/`useVisitedStateIds` or navigation -- all of that is
// `LoginPage`'s responsibility (task 18.2), per design.md's split between
// "LoginPage" and "LoginForm".
//
// Prop contract
// -------------
//   onSubmit(username, password) => Promise<any>
//     Required. Called only after `validateCredentials(username, password)`
//     reports `{ valid: true }` (Requirements 1.3, 1.4) -- so Cognito is
//     never reached for empty or over-length input. `LoginForm` awaits the
//     returned promise and, while it is pending, disables the submit
//     control and shows a loading indicator (Requirement 1.10). The
//     promise's resolution/rejection value is intentionally not interpreted
//     here: mapping `INVALID_CREDENTIALS`/`TIMEOUT_OR_UNREACHABLE` etc. to
//     user-facing copy is `LoginPage`'s job. `LoginForm` only needs to know
//     the submission is no longer pending once the promise settles either
//     way.
//
//   errorMessage (string | null, optional)
//     A message supplied by the parent (e.g. `LoginPage`, after `onSubmit`
//     rejects) to render above the submit control -- for example "the
//     username or password is invalid" or "the login attempt could not be
//     completed" (Requirements 1.8, 1.9). `LoginForm` renders this verbatim
//     and does not interpret its content; passing `null`/omitting it
//     renders nothing. This is distinct from the *local* validation message
//     produced by `validateCredentials`, which `LoginForm` always manages
//     itself and clears on every new submit attempt.
//
//   submitLabel (string, optional, default: 'Log in')
//     Label for the submit control, for callers that want different
//     wording.

import React from 'react';
import { validateCredentials } from '../services/authenticationService';

/** Maps a validateCredentials() rejection reason to user-facing copy. */
function messageForValidationReason(reason) {
  if (reason === 'TOO_LONG') {
    return 'Username or password is too long.';
  }
  // 'REQUIRED' and any unrecognized reason fall back to the
  // required-fields message (Requirement 1.4).
  return 'Both fields are required.';
}

/**
 * @param {Object} props
 * @param {(username: string, password: string) => Promise<any>} props.onSubmit
 * @param {string | null} [props.errorMessage]
 * @param {string} [props.submitLabel]
 */
export function LoginForm({ onSubmit, errorMessage = null, submitLabel = 'Log in' }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [validationMessage, setValidationMessage] = React.useState(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Guards against setting state after unmount if `onSubmit`'s promise
  // settles post-unmount (e.g. the parent has already navigated away).
  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function handleSubmit(event) {
    event.preventDefault();

    const validation = validateCredentials(username, password);
    if (!validation.valid) {
      // Requirement 1.3/1.4: block submission and show the appropriate
      // message without calling `onSubmit` (i.e. never reaches Cognito).
      setValidationMessage(messageForValidationReason(validation.reason));
      return;
    }

    setValidationMessage(null);
    setIsSubmitting(true);

    Promise.resolve(onSubmit(username, password)).finally(() => {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    });
  }

  const displayedMessage = validationMessage || errorMessage;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          name="username"
          type="text"
          maxLength={128}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={isSubmitting}
          autoComplete="username"
        />
      </div>
      <div>
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          name="password"
          type="password"
          maxLength={256}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isSubmitting}
          autoComplete="current-password"
        />
      </div>
      {displayedMessage ? <p role="alert">{displayedMessage}</p> : null}
      <button type="submit" disabled={isSubmitting}>
        {submitLabel}
      </button>
      {isSubmitting ? <span role="status">Loading&hellip;</span> : null}
    </form>
  );
}
