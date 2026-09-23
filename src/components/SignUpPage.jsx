// Sign_Up_Page (design.md: "Sign_Up_Page / SignUpForm /
// SignUpConfirmationForm"; Requirement 12).
//
// Scope note: mirrors LoginPage.jsx's split -- this component owns the
// actual `signUp()`/`confirmSignUp()` calls, the two-step transition
// between "collecting sign-up fields" and "collecting confirmation code",
// and mapping rejection kinds to user-facing messages. The fields,
// client-side validation, and pending/disabled/loading UI belong to
// `SignUpForm`/`SignUpConfirmationForm` and are not duplicated here.
//
// Two-step flow (Requirement 12.5, 12.6, 12.7):
//   1. 'fields' (initial): renders `SignUpForm`. On successful `signUp()`,
//      remembers the registered `username` and the submitted `email`, then
//      transitions to 'confirming'.
//   2. 'confirming': renders explanatory instructions above
//      `SignUpConfirmationForm` telling the user to check their email
//      (displaying the submitted address) for a 6-digit code, and to check
//      their spam folder for a message from no-reply@verificationemail.com
//      (Cognito's default sender address) if it isn't in their inbox
//      (Requirement 12.9). On successful `confirmSignUp()`, calls the
//      `onSignUpComplete` callback prop with a success message string so
//      the parent (`AuthGate`) can both navigate back to Login_Page AND
//      show that message there. Note: this component does NOT keep its
//      own local success-message state/render for this -- `AuthGate`
//      unmounts `SignUpPage` and mounts `LoginPage` immediately after
//      `onSignUpComplete` is called, so anything rendered by `SignUpPage`
//      itself at that point would render and unmount in the same tick,
//      never actually visible to the user. Passing the message as an
//      argument lets the component that actually stays mounted
//      (`LoginPage`, via `AuthGate`) display it instead.
//
// Navigation note (mirrors LoginPage.jsx's own navigation note): SignUpPage
// has no navigation concept of its own -- it only calls `onSignUpComplete`,
// exactly like `MapPage`/`TopNav` already receive/call navigation
// callbacks from `AuthGate` rather than reaching into AuthGate's state
// directly. Requirement 12.7: successful confirmation never sets
// `useSession` -- sign-up+confirmation only creates the Cognito account, it
// never authenticates. The existing login flow (Requirement 1) remains the
// only path that creates a Session.
//
// Error-message handling: SignUpPage keeps its own `errorMessage` state,
// reset to `null` at the start of every submit attempt (fields or
// confirmation code), mirroring LoginPage's convention so a stale error
// from a previous attempt never lingers into a new one.

import React from 'react';
import { SignUpForm } from './SignUpForm';
import { SignUpConfirmationForm } from './SignUpConfirmationForm';
import { signUp, confirmSignUp } from '../services/authenticationService';

const USERNAME_EXISTS_MESSAGE = 'That username is already taken.';
const INVALID_PASSWORD_MESSAGE = 'That password does not meet the requirements.';
const INVALID_CODE_MESSAGE = 'That confirmation code is invalid or has expired.';
const TIMEOUT_MESSAGE = 'The request could not be completed. Please try again.';
const SUCCESS_MESSAGE = 'Your confirmation code was verified. You can now log in.';

/**
 * @param {Object} props
 * @param {(message: string) => void} props.onSignUpComplete - called once
 *   the new account has been confirmed, with a success message describing
 *   the outcome. The caller (e.g. AuthGate) is responsible for both
 *   navigating back to Login_Page and displaying that message there.
 */
export function SignUpPage({ onSignUpComplete }) {
  const [step, setStep] = React.useState('fields'); // 'fields' | 'confirming'
  const [username, setUsername] = React.useState(null);
  const [email, setEmail] = React.useState(null);
  const [errorMessage, setErrorMessage] = React.useState(null);

  async function handleSignUpSubmit(submittedUsername, submittedEmail, password, location) {
    setErrorMessage(null);

    try {
      const result = await signUp(submittedUsername, submittedEmail, password, location);
      setUsername(result.username);
      setEmail(submittedEmail);
      setStep('confirming');
    } catch (error) {
      const kind = error && error.kind;
      if (kind === 'USERNAME_EXISTS') {
        setErrorMessage(USERNAME_EXISTS_MESSAGE);
      } else if (kind === 'INVALID_PASSWORD') {
        setErrorMessage(INVALID_PASSWORD_MESSAGE);
      } else {
        setErrorMessage(TIMEOUT_MESSAGE);
      }
    }
  }

  async function handleConfirmationSubmit(code) {
    setErrorMessage(null);

    try {
      await confirmSignUp(username, code);
      // Requirement 12.7: navigate back to Login_Page without ever
      // creating a Session. The success message is handed to the caller
      // rather than rendered here -- see the module-level comment above.
      onSignUpComplete(SUCCESS_MESSAGE);
    } catch (error) {
      const kind = error && error.kind;
      if (kind === 'INVALID_CODE') {
        setErrorMessage(INVALID_CODE_MESSAGE);
      } else {
        setErrorMessage(TIMEOUT_MESSAGE);
      }
    }
  }

  if (step === 'confirming') {
    return (
      <>
        <p data-testid="signup-confirmation-instructions">
          We sent a 6-digit confirmation code to {email}. Enter it below to confirm your account.
          If you don&rsquo;t see it, check your spam or junk folder for an email from
          no-reply@verificationemail.com.
        </p>
        <SignUpConfirmationForm onSubmit={handleConfirmationSubmit} errorMessage={errorMessage} />
      </>
    );
  }

  return <SignUpForm onSubmit={handleSignUpSubmit} errorMessage={errorMessage} />;
}
