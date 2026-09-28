// Unit tests for Login_Page behavior (task 18.3).
//
// Covers:
//   - loading/disabled-state UI while an authentication attempt is in
//     flight (Requirement 1.10)
//   - the invalid-credentials error message, and that useSession is left
//     untouched on that path (Requirement 1.8)
//   - the timeout/unreachable error message (Requirement 1.9)
//   - basic rendering sanity: the username/password fields and submit
//     control are present and accessible by label/role (Requirements 1.1,
//     1.2 -- the broader "Map_View is default"/"login control visible"
//     behavior belongs to AuthGate, task 19.x, not yet implemented)
//
// `authenticationService.login` is mocked so no real Cognito call happens;
// `validateCredentials` is left as the real implementation (via
// `jest.requireActual`) so LoginForm's client-side validation still lets a
// well-formed username/password through to `onSubmit`.
//
// Shared-state note: `useSession`/`useVisitedPlaceIdsByCategory` (from
// `make-shared-state-hook`) hold their value at module scope, so it
// persists across tests within this file (Jest isolates modules per test
// *file*, not per test). A `beforeEach` resets both back to their initial
// values via a small harness component before every test.

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { LoginPage } from './LoginPage';
import { useSession, useVisitedPlaceIdsByCategory } from '../state/sharedState';

jest.mock('../services/authenticationService', () => ({
  ...jest.requireActual('../services/authenticationService'),
  login: jest.fn(),
}));

import { login } from '../services/authenticationService';

const INVALID_CREDENTIALS_MESSAGE = 'The username or password is invalid.';
const TIMEOUT_MESSAGE = 'The login attempt could not be completed. Please try again.';

function ResetSharedState() {
  const [, setSession] = useSession();
  const [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
  React.useEffect(() => {
    setSession(null);
    setVisitedPlaceIdsByCategory({ 'us-state': {}, 'canada-state': {}, country: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function SessionProbe() {
  const [session] = useSession();
  return <div data-testid="session-probe">{session ? 'has-session' : 'no-session'}</div>;
}

function fillValidCredentials() {
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'correct-password' } });
}

beforeEach(() => {
  login.mockReset();
  render(<ResetSharedState />);
});

describe('LoginPage - basic rendering', () => {
  it('renders username/password fields and a submit control, accessible by label/role', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });
});

describe('LoginPage - loading/disabled-state UI (Requirement 1.10)', () => {
  it('disables the submit control and shows a loading indicator while login() is pending, then clears it', async () => {
    let resolveLogin;
    login.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        })
    );

    render(<LoginPage />);
    fillValidCredentials();

    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(screen.getByRole('button', { name: /log in/i })).toBeDisabled();
    expect(screen.getByRole('status')).toBeInTheDocument();

    resolveLogin({ username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 });

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /log in/i })).not.toBeDisabled();
  });
});

describe('LoginPage - invalid-credentials message (Requirement 1.8)', () => {
  it('shows the invalid-credentials message and leaves useSession untouched', async () => {
    login.mockRejectedValue({ kind: 'INVALID_CREDENTIALS' });

    render(
      <>
        <LoginPage />
        <SessionProbe />
      </>
    );
    fillValidCredentials();

    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(INVALID_CREDENTIALS_MESSAGE);

    expect(screen.getByTestId('session-probe')).toHaveTextContent('no-session');
    // Stays on Login_Page: the form fields are still present.
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });
});

describe('LoginPage - timeout/unreachable message (Requirement 1.9)', () => {
  it('shows the timeout/unreachable message and re-enables the submit control', async () => {
    login.mockRejectedValue({ kind: 'TIMEOUT_OR_UNREACHABLE' });

    render(<LoginPage />);
    fillValidCredentials();

    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(TIMEOUT_MESSAGE);

    expect(screen.getByRole('button', { name: /log in/i })).not.toBeDisabled();
  });
});

describe('LoginPage - sign-up success message', () => {
  it('renders the successMessage prop above the username field when provided', () => {
    render(<LoginPage successMessage="Your confirmation code was verified. You can now log in." />);

    const message = screen.getByTestId('login-success-message');
    expect(message).toHaveTextContent('Your confirmation code was verified. You can now log in.');

    const usernameField = screen.getByLabelText(/username/i);
    expect(message.compareDocumentPosition(usernameField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not render a success message when the prop is omitted', () => {
    render(<LoginPage />);

    expect(screen.queryByTestId('login-success-message')).not.toBeInTheDocument();
  });
});

describe('LoginPage - sign-up link (Requirement 12.1)', () => {
  it('renders a sign-up link and calls onRequestSignUp when clicked', () => {
    const onRequestSignUp = jest.fn();
    render(<LoginPage onRequestSignUp={onRequestSignUp} />);

    const signUpLink = screen.getByTestId('signup-link');
    expect(signUpLink).toBeInTheDocument();

    fireEvent.click(signUpLink);

    expect(onRequestSignUp).toHaveBeenCalledTimes(1);
  });
});
