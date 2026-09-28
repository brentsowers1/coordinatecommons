// Sign-up field form for the Sign_Up_Page (design.md: "Sign_Up_Page /
// SignUpForm / SignUpConfirmationForm"; Requirement 12).
//
// Mirrors LoginForm.jsx's split: this component owns only the fields
// themselves, client-side validation via `validateSignUpFields`, and the
// pending/disabled/loading UI while a submission is in flight. It does not
// call `authenticationService.signUp` itself and does not touch
// `useSession`/`useVisitedPlaceIdsByCategory` or navigation -- all of that is
// `SignUpPage`'s responsibility, per design.md's split between
// "SignUpPage" and "SignUpForm".
//
// Fields: username, email, location (optional), password, password
// confirmation.
//
// Prop contract
// -------------
//   onSubmit(username, email, password, location) => Promise<any>
//     Required. Called only after `validateSignUpFields(username, email,
//     password, confirmPassword)` reports `{ valid: true }` (Requirement
//     12.4) -- so Cognito is never reached for invalid input.
//     `location` is passed through as typed (an empty string when left
//     blank, never `undefined`) -- `signUp()` itself treats an empty/
//     whitespace-only string as "no location provided" (no
//     `custom:location` attribute sent), so `SignUpForm` doesn't need to
//     distinguish "never touched" from "cleared" itself.
//     `SignUpForm` awaits the returned promise and, while it is pending,
//     disables the submit control and shows a loading indicator, mirroring
//     Requirement 1.10's login pattern. The promise's resolution/rejection
//     value is intentionally not interpreted here: mapping
//     `USERNAME_EXISTS`/`INVALID_PASSWORD`/`TIMEOUT_OR_UNREACHABLE` to
//     user-facing copy is `SignUpPage`'s job.
//
//   errorMessage (string | null, optional)
//     A message supplied by the parent (e.g. `SignUpPage`, after
//     `onSubmit` rejects) to render above the submit control. Rendered
//     verbatim, not interpreted. Distinct from the *local* validation
//     message produced by `validateSignUpFields`, which `SignUpForm`
//     always manages itself and clears on every new submit attempt.
//
//   submitLabel (string, optional, default: 'Sign up')
//     Label for the submit control, for callers that want different
//     wording.

import React from 'react';
import { validateSignUpFields, MAX_LOCATION_LENGTH } from '../services/authenticationService';

/** Maps a validateSignUpFields() rejection reason to user-facing copy. */
function messageForValidationReason(reason) {
  if (reason === 'TOO_LONG') {
    return 'One of the fields is too long.';
  }
  if (reason === 'INVALID_EMAIL') {
    return 'Enter a valid email address.';
  }
  if (reason === 'PASSWORD_MISMATCH') {
    return 'Password and password confirmation do not match.';
  }
  // 'REQUIRED' and any unrecognized reason fall back to the
  // required-fields message (Requirement 12.4).
  return 'Username, email, password, and password confirmation are all required.';
}

/**
 * @param {Object} props
 * @param {(username: string, email: string, password: string, location: string) => Promise<any>} props.onSubmit
 * @param {string | null} [props.errorMessage]
 * @param {string} [props.submitLabel]
 */
export function SignUpForm({ onSubmit, errorMessage = null, submitLabel = 'Sign up' }) {
  const [username, setUsername] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
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

    const validation = validateSignUpFields(username, email, password, confirmPassword);
    if (!validation.valid) {
      // Requirement 12.4: block submission and show the appropriate
      // message without calling `onSubmit` (i.e. never reaches Cognito).
      setValidationMessage(messageForValidationReason(validation.reason));
      return;
    }

    setValidationMessage(null);
    setIsSubmitting(true);

    Promise.resolve(onSubmit(username, email, password, location)).finally(() => {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    });
  }

  const displayedMessage = validationMessage || errorMessage;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="signup-username">Username</label>
        <input
          id="signup-username"
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
        <label htmlFor="signup-email">Email address</label>
        <input
          id="signup-email"
          name="email"
          type="email"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isSubmitting}
          autoComplete="email"
        />
      </div>
      <div>
        <label htmlFor="signup-location">Location (optional)</label>
        <input
          id="signup-location"
          name="location"
          type="text"
          maxLength={MAX_LOCATION_LENGTH}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          disabled={isSubmitting}
          autoComplete="address-level2"
        />
      </div>
      <div>
        <label htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          name="password"
          type="password"
          maxLength={256}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isSubmitting}
          autoComplete="new-password"
        />
      </div>
      <div>
        <label htmlFor="signup-confirm-password">Confirm password</label>
        <input
          id="signup-confirm-password"
          name="confirmPassword"
          type="password"
          maxLength={256}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={isSubmitting}
          autoComplete="new-password"
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
