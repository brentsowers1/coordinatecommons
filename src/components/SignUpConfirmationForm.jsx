// Confirmation-code form for the Sign_Up_Page (design.md: "Sign_Up_Page /
// SignUpForm / SignUpConfirmationForm"; Requirement 12.6).
//
// A small, single-field counterpart to SignUpForm: after a successful
// `signUp()` call, `SignUpPage` renders this component instead of
// `SignUpForm` to collect the confirmation code Cognito emails to the new
// account, and submit it via `onSubmit`. Mirrors LoginForm/SignUpForm's
// pending/disabled-while-submitting pattern, simplified to one field.
//
// Prop contract
// -------------
//   onSubmit(code) => Promise<any>
//     Required. Called on submit whenever `code` is non-empty after
//     trimming; blocks submission with a local "enter the code" message
//     otherwise (never calling `onSubmit` for empty input, mirroring how
//     SignUpForm/LoginForm block on their own validation). While the
//     returned promise is pending, disables the submit control and shows a
//     loading indicator. The promise's resolution/rejection is not
//     interpreted here -- mapping `INVALID_CODE`/`TIMEOUT_OR_UNREACHABLE`
//     to user-facing copy is `SignUpPage`'s job.
//
//   errorMessage (string | null, optional)
//     A message supplied by the parent to render above the submit control.
//     Rendered verbatim. Distinct from the local "enter the code" message.
//
//   submitLabel (string, optional, default: 'Confirm')

import React from 'react';

export function SignUpConfirmationForm({ onSubmit, errorMessage = null, submitLabel = 'Confirm' }) {
  const [code, setCode] = React.useState('');
  const [validationMessage, setValidationMessage] = React.useState(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Guards against calling setIsSubmitting after unmount (see handleSubmit
  // below). Must be set back to `true` when the effect runs, not just
  // initialized to `true` in useRef's initializer -- otherwise React 18
  // StrictMode's development-only mount -> cleanup -> re-mount cycle
  // (intentionally exercised on every component to surface exactly this
  // kind of bug) leaves it permanently `false` for the real, final mount:
  // the initializer only runs once for the underlying ref object, so the
  // cleanup from the first (discarded) mount would otherwise never be
  // undone.
  // Guards against calling setIsSubmitting after unmount (see handleSubmit
  // below). Must be set back to `true` when the effect runs, not just
  // initialized to `true` in useRef's initializer -- otherwise React 18/19
  // StrictMode's development-only mount -> cleanup -> re-mount cycle
  // (intentionally exercised on every component to surface exactly this
  // kind of bug) leaves it permanently `false` for the real, final mount:
  // the initializer only runs once for the underlying ref object, so the
  // cleanup from the first (discarded) mount would otherwise never be
  // undone. Confirmed against the real Cognito user pool: submitting a
  // wrong confirmation code correctly rejected, the error alert correctly
  // rendered, but without this reset the submit control and code field
  // stayed disabled/"Loading..." forever because isMountedRef.current was
  // already `false` before the real submit ever started.
  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function handleSubmit(event) {
    event.preventDefault();

    if (code.trim().length === 0) {
      setValidationMessage('Enter the confirmation code sent to your email.');
      return;
    }

    setValidationMessage(null);
    setIsSubmitting(true);

    Promise.resolve(onSubmit(code)).finally(() => {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    });
  }

  const displayedMessage = validationMessage || errorMessage;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="signup-confirmation-code">Confirmation code</label>
        <input
          id="signup-confirmation-code"
          name="confirmationCode"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={isSubmitting}
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
