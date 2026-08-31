// Unit tests for TopNav (top-level navigation, always visible on every
// page). Follows AuthGate.test.js's/LoginPromptBanner.test.js's convention
// of resetting shared state (which lives at module scope, persisting
// across tests in this file) via a small setter harness before each test.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { TopNav } from './TopNav';
import { useSession, useVisitedStateIds, useSignOutReason } from '../state/sharedState';

function Setter({ session, visitedStateIds, signOutReason }) {
  const [, setSession] = useSession();
  const [, setVisitedStateIds] = useVisitedStateIds();
  const [, setSignOutReason] = useSignOutReason();
  React.useEffect(() => {
    setSession(session);
    setVisitedStateIds(visitedStateIds);
    setSignOutReason(signOutReason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function setUpSharedState({ session = null, visitedStateIds = {}, signOutReason = null } = {}) {
  render(<Setter session={session} visitedStateIds={visitedStateIds} signOutReason={signOutReason} />);
}

function VisitedStateIdsProbe() {
  const [visitedStateIds] = useVisitedStateIds();
  return <div data-testid="visited-state-ids-probe">{JSON.stringify(visitedStateIds)}</div>;
}

function SignOutReasonProbe() {
  const [signOutReason] = useSignOutReason();
  return <div data-testid="sign-out-reason-probe">{JSON.stringify(signOutReason)}</div>;
}

function SessionProbe() {
  const [session] = useSession();
  return <div data-testid="session-probe">{JSON.stringify(session)}</div>;
}

describe('TopNav', () => {
  it('always renders the "Coordinate Commons" home control and calls onNavigateHome when clicked, with no session', () => {
    setUpSharedState({ session: null });
    const onNavigateHome = jest.fn();
    render(<TopNav onNavigateHome={onNavigateHome} onRequestLogin={jest.fn()} />);

    const homeControl = screen.getByTestId('nav-home-link');
    expect(homeControl).toHaveTextContent('Coordinate Commons');
    expect(homeControl.tagName).toBe('A');
    expect(screen.getByRole('link', { name: 'Coordinate Commons' })).toBe(homeControl);
    fireEvent.click(homeControl);

    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });

  it('always renders the "Coordinate Commons" home control and calls onNavigateHome when clicked, with a session', () => {
    setUpSharedState({ session: { username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 } });
    const onNavigateHome = jest.fn();
    render(<TopNav onNavigateHome={onNavigateHome} onRequestLogin={jest.fn()} />);

    const homeControl = screen.getByTestId('nav-home-link');
    expect(homeControl).toBeInTheDocument();
    fireEvent.click(homeControl);

    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });

  it('shows "Log in" (not "Log out") when there is no session, and calls onRequestLogin when clicked', () => {
    setUpSharedState({ session: null });
    const onRequestLogin = jest.fn();
    render(<TopNav onNavigateHome={jest.fn()} onRequestLogin={onRequestLogin} />);

    const loginControl = screen.getByTestId('nav-login-link');
    expect(loginControl).toHaveTextContent('Log in');
    expect(loginControl.tagName).toBe('A');
    expect(screen.queryByTestId('nav-logout-link')).not.toBeInTheDocument();

    fireEvent.click(loginControl);

    expect(onRequestLogin).toHaveBeenCalledTimes(1);
  });

  it('shows "Log out" (not "Log in") when there is a session, and clicking it clears the session and visited-state data', () => {
    setUpSharedState({
      session: { username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 },
      visitedStateIds: { CA: true },
    });
    render(
      <>
        <TopNav onNavigateHome={jest.fn()} onRequestLogin={jest.fn()} />
        <SessionProbe />
        <VisitedStateIdsProbe />
      </>
    );

    const logoutControl = screen.getByTestId('nav-logout-link');
    expect(logoutControl).toHaveTextContent('Log out');
    expect(logoutControl.tagName).toBe('A');
    expect(screen.queryByTestId('nav-login-link')).not.toBeInTheDocument();

    fireEvent.click(logoutControl);

    expect(screen.getByTestId('session-probe').textContent).toBe('null');
    expect(screen.getByTestId('visited-state-ids-probe').textContent).toBe(JSON.stringify({}));
  });

  it('clicking "Log out" results in signOutReason being LOGOUT specifically', () => {
    setUpSharedState({
      session: { username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 },
      signOutReason: null,
    });
    render(
      <>
        <TopNav onNavigateHome={jest.fn()} onRequestLogin={jest.fn()} />
        <SignOutReasonProbe />
      </>
    );

    fireEvent.click(screen.getByTestId('nav-logout-link'));

    expect(screen.getByTestId('sign-out-reason-probe').textContent).toBe(JSON.stringify('LOGOUT'));
  });
});
