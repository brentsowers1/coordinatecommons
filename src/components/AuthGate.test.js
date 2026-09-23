// Smoke tests for AuthGate (task 19.1).
//
// MapPage, LoginPage, and TopNav are mocked so this test only exercises
// AuthGate's own navigation-state logic (see AuthGate.js's module comment
// for the design rationale): default-to-MapPage (Requirement 1.1),
// switching to LoginPage when TopNav's "Log in" control is used
// (Requirement 1.2), and automatically returning to MapPage once
// useSession becomes non-null (Requirements 1.6/1.7). Mocking TopNav here
// (rather than using the real component) is consistent with this file's
// existing style of mocking MapPage/LoginPage -- TopNav's own behavior
// (which control it shows, logout wiring) is covered by TopNav.test.js.
//
// Shared-state note: `useSession` holds its value at module scope, so it
// persists across tests within this file. A `beforeEach` resets it via a
// small harness component before every test (matching LoginPage.test.js's
// convention).

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

import { useSession } from '../state/sharedState';

jest.mock('./MapPage', () => ({
  MapPage: () => <div data-testid="mock-map-page" />,
}));
jest.mock('./LoginPage', () => ({
  LoginPage: ({ onRequestSignUp, successMessage }) => (
    <div data-testid="mock-login-page">
      {successMessage ? (
        <div data-testid="mock-login-success-message">{successMessage}</div>
      ) : null}
      <button type="button" onClick={onRequestSignUp} data-testid="mock-signup-link">
        Sign up
      </button>
    </div>
  ),
}));
jest.mock('./SignUpPage', () => ({
  SignUpPage: ({ onSignUpComplete }) => (
    <div data-testid="mock-signup-page">
      <button
        type="button"
        onClick={() => onSignUpComplete('some test message')}
        data-testid="mock-signup-complete"
      >
        Complete sign up
      </button>
    </div>
  ),
}));
jest.mock('./TopNav', () => ({
  TopNav: ({ onRequestLogin }) => (
    <div data-testid="mock-top-nav">
      <button type="button" onClick={onRequestLogin} data-testid="mock-login-control">
        Log in
      </button>
    </div>
  ),
}));

import { AuthGate } from './AuthGate';

function ResetSession() {
  const [, setSession] = useSession();
  React.useEffect(() => {
    setSession(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function SessionProbeForSignUp() {
  const [session] = useSession();
  return (
    <div data-testid="session-probe-signup">{session ? 'has-session' : 'no-session'}</div>
  );
}

function SessionSetter() {
  const [, setSession] = useSession();
  return (
    <button
      type="button"
      data-testid="set-session"
      onClick={() =>
        setSession({ username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 })
      }
    >
      Sign in
    </button>
  );
}

beforeEach(() => {
  render(<ResetSession />);
});

describe('AuthGate', () => {
  it('renders MapPage by default (Requirement 1.1)', () => {
    render(<AuthGate />);

    expect(screen.getByTestId('mock-map-page')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-login-page')).not.toBeInTheDocument();
  });

  it('renders TopNav above both MapPage and LoginPage', () => {
    render(<AuthGate />);
    expect(screen.getByTestId('mock-top-nav')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-login-control'));
    expect(screen.getByTestId('mock-top-nav')).toBeInTheDocument();
    expect(screen.getByTestId('mock-login-page')).toBeInTheDocument();
  });

  it('renders LoginPage after the login control is used (Requirement 1.2)', () => {
    render(<AuthGate />);

    fireEvent.click(screen.getByTestId('mock-login-control'));

    expect(screen.getByTestId('mock-login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-map-page')).not.toBeInTheDocument();
  });

  it('returns to MapPage automatically once the session becomes non-null (Requirements 1.6/1.7)', () => {
    render(
      <>
        <AuthGate />
        <SessionSetter />
      </>
    );

    fireEvent.click(screen.getByTestId('mock-login-control'));
    expect(screen.getByTestId('mock-login-page')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId('set-session'));
    });

    expect(screen.getByTestId('mock-map-page')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-login-page')).not.toBeInTheDocument();
  });

  it('navigates Login_Page -> Sign_Up_Page -> back to Login_Page on onSignUpComplete, without ever setting useSession (Requirement 12.1, 12.2, 12.7)', () => {
    render(
      <>
        <AuthGate />
        <SessionProbeForSignUp />
      </>
    );

    // Login_Page -> Sign_Up_Page, via LoginPage's sign-up link.
    fireEvent.click(screen.getByTestId('mock-login-control'));
    fireEvent.click(screen.getByTestId('mock-signup-link'));

    expect(screen.getByTestId('mock-signup-page')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-login-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-map-page')).not.toBeInTheDocument();

    // Sign_Up_Page -> Login_Page, via onSignUpComplete.
    fireEvent.click(screen.getByTestId('mock-signup-complete'));

    expect(screen.getByTestId('mock-login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-signup-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-map-page')).not.toBeInTheDocument();

    // Requirement 12.7: sign-up + confirmation never creates a Session.
    expect(screen.getByTestId('session-probe-signup')).toHaveTextContent('no-session');

    // The message passed to onSignUpComplete reaches LoginPage.
    expect(screen.getByTestId('mock-login-success-message')).toHaveTextContent(
      'some test message'
    );
  });

  it('clears the sign-up success message once a subsequent login succeeds', () => {
    render(
      <>
        <AuthGate />
        <SessionSetter />
      </>
    );

    // Login_Page -> Sign_Up_Page -> back to Login_Page, with a message.
    fireEvent.click(screen.getByTestId('mock-login-control'));
    fireEvent.click(screen.getByTestId('mock-signup-link'));
    fireEvent.click(screen.getByTestId('mock-signup-complete'));

    expect(screen.getByTestId('mock-login-success-message')).toHaveTextContent(
      'some test message'
    );

    // A successful login clears the message and returns to MapPage.
    act(() => {
      fireEvent.click(screen.getByTestId('set-session'));
    });

    expect(screen.getByTestId('mock-map-page')).toBeInTheDocument();

    // Log back in to inspect LoginPage's props again -- the message
    // should no longer be present since a successful login already
    // cleared it.
    act(() => {
      fireEvent.click(screen.getByTestId('mock-login-control'));
    });
    expect(screen.queryByTestId('mock-login-success-message')).not.toBeInTheDocument();
  });
});
