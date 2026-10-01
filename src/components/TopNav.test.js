// Unit tests for TopNav (top-level navigation, always visible on every
// page). Follows AuthGate.test.js's/LoginPromptBanner.test.js's convention
// of resetting shared state (which lives at module scope, persisting
// across tests in this file) via a small setter harness before each test.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { TopNav } from './TopNav';
import { useSession, useVisitedPlaceIdsByCategory, useSignOutReason } from '../state/sharedState';

function Setter({ session, visitedStateIds, signOutReason }) {
  const [, setSession] = useSession();
  const [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
  const [, setSignOutReason] = useSignOutReason();
  React.useEffect(() => {
    setSession(session);
    setVisitedPlaceIdsByCategory({ 'us-state': visitedStateIds, 'canada-state': {}, country: {} });
    setSignOutReason(signOutReason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function setUpSharedState({ session = null, visitedStateIds = {}, signOutReason = null } = {}) {
  render(<Setter session={session} visitedStateIds={visitedStateIds} signOutReason={signOutReason} />);
}

function VisitedStateIdsProbe() {
  const [visitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
  return (
    <div data-testid="visited-state-ids-probe">
      {JSON.stringify(visitedPlaceIdsByCategory['us-state'])}
    </div>
  );
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

  // Task 24.4 / Requirement 13.1: MyPlacesControl is rendered inside
  // TopNav, positioned between the home control and the login/logout
  // control.
  it('renders MyPlacesControl positioned between the home control and the login/logout control (Requirement 13.1)', () => {
    setUpSharedState({ session: null });
    render(<TopNav onNavigateHome={jest.fn()} onRequestLogin={jest.fn()} />);

    const homeControl = screen.getByTestId('nav-home-link');
    const myPlacesControl = screen.getByTestId('my-places-control');
    const loginControl = screen.getByTestId('nav-login-link');

    expect(myPlacesControl).toBeInTheDocument();

    // DOCUMENT_POSITION_FOLLOWING (4) means the reference node comes
    // after the node passed to compareDocumentPosition -- i.e. `home`
    // precedes `myPlaces`, and `myPlaces` precedes `login`, establishing
    // the exact 3-way left-to-right ordering Requirement 13.1 requires.
     
    expect(homeControl.compareDocumentPosition(myPlacesControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
     
    expect(myPlacesControl.compareDocumentPosition(loginControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Also verify via the shared `<nav>` parent's top-level `<ul>` group
    // structure: the home control is alone in the leading group, while
    // MyPlacesControl and the login control are grouped together in the
    // SAME trailing group -- this is what visually groups them on the
    // right side of the nav (see TopNav.jsx's Pico.css markup note).
    const nav = screen.getByTestId('top-nav');
    const groups = Array.from(nav.children);
    const homeGroupIndex = groups.findIndex((group) => group.contains(homeControl));
    const myPlacesGroupIndex = groups.findIndex((group) => group.contains(myPlacesControl));
    const loginGroupIndex = groups.findIndex((group) => group.contains(loginControl));

    expect(homeGroupIndex).toBeLessThan(myPlacesGroupIndex);
    expect(myPlacesGroupIndex).toBe(loginGroupIndex);
  });

  it('passes onNavigateToMapPage through to MyPlacesControl', () => {
    setUpSharedState({ session: null });
    const onNavigateToMapPage = jest.fn();
    render(
      <TopNav
        onNavigateHome={jest.fn()}
        onRequestLogin={jest.fn()}
        onNavigateToMapPage={onNavigateToMapPage}
      />
    );

    fireEvent.click(screen.getByTestId('my-places-control'));
    fireEvent.click(screen.getByTestId('my-places-option-canada-state'));

    expect(onNavigateToMapPage).toHaveBeenCalledTimes(1);
  });

  // Task 24.5 / Requirement 13.1: the existing ordering test above only
  // covers the signed-out (login-link) case. Requirement 13.1's "positioned
  // between" guarantee doesn't specify a session state, so it must also
  // hold when a session exists and the logout link renders in place of the
  // login link.
  it('renders MyPlacesControl positioned between the home control and the logout control when a session exists (Requirement 13.1)', () => {
    setUpSharedState({ session: { username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 } });
    render(<TopNav onNavigateHome={jest.fn()} onRequestLogin={jest.fn()} />);

    const homeControl = screen.getByTestId('nav-home-link');
    const myPlacesControl = screen.getByTestId('my-places-control');
    const logoutControl = screen.getByTestId('nav-logout-link');

    expect(myPlacesControl).toBeInTheDocument();

     
    expect(homeControl.compareDocumentPosition(myPlacesControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
     
    expect(myPlacesControl.compareDocumentPosition(logoutControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const nav = screen.getByTestId('top-nav');
    const groups = Array.from(nav.children);
    const homeGroupIndex = groups.findIndex((group) => group.contains(homeControl));
    const myPlacesGroupIndex = groups.findIndex((group) => group.contains(myPlacesControl));
    const logoutGroupIndex = groups.findIndex((group) => group.contains(logoutControl));

    expect(homeGroupIndex).toBeLessThan(myPlacesGroupIndex);
    expect(myPlacesGroupIndex).toBe(logoutGroupIndex);
  });

  // Task 24.5 regression guard: interacting with MyPlacesControl (opening
  // its dropdown, selecting an option) must not accidentally trigger
  // TopNav's own onNavigateHome/onRequestLogin callbacks, and vice versa --
  // the three controls' handlers must stay fully independent.
  it('does not cross-trigger onNavigateHome or onRequestLogin when opening or using MyPlacesControl', () => {
    setUpSharedState({ session: null });
    const onNavigateHome = jest.fn();
    const onRequestLogin = jest.fn();
    render(<TopNav onNavigateHome={onNavigateHome} onRequestLogin={onRequestLogin} />);

    fireEvent.click(screen.getByTestId('my-places-control'));
    fireEvent.click(screen.getByTestId('my-places-option-country'));

    expect(onNavigateHome).not.toHaveBeenCalled();
    expect(onRequestLogin).not.toHaveBeenCalled();

    // And conversely, clicking home/login must not open or affect
    // MyPlacesControl's dropdown.
    fireEvent.click(screen.getByTestId('nav-home-link'));
    expect(screen.queryByTestId('my-places-dropdown')).not.toBeInTheDocument();
  });
});
