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
  LoginPage: () => <div data-testid="mock-login-page" />,
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
});
