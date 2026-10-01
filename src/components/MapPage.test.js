// Smoke tests for MapPage.
//
// MapView pulls in the real Google Maps script loader / region loader /
// fetch, which is heavier than this component-composition test needs, so
// MapView is mocked here -- this test only verifies MapPage renders it per
// design.md's Component Tree (`MapPage --> MapView`). Login/logout
// navigation now lives in `TopNav` (rendered by `AuthGate`), not `MapPage`,
// so that behavior is covered by TopNav.test.js/AuthGate.test.js instead.
//
// `LoginPromptBanner` is no longer a MapPage-level sibling: its placement
// moved into `MapView` so it renders in the area directly below the map and
// above the long `PlaceVisitStatusLists` columns (Requirement 9.2) rather
// than at the page bottom. The mock MapView below therefore renders the
// real `LoginPromptBanner` itself, standing in for that nesting, so these
// tests still cover "the banner appears somewhere under MapPage for a guest
// (Requirement 9.2) and nowhere for an authenticated session (Requirement
// 9.3)" without pulling in the real Maps lifecycle. DOM ORDERING of the
// banner relative to the visit-status lists is MapView's concern and is
// asserted in MapView.test.js.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// The mock also forwards whatever navigation callbacks MapPage passes it
// through to the real `LoginPromptBanner`, exactly as the real `MapView`
// does (Requirement 9.2) -- so "MapPage forwards onRequestLogin/
// onRequestSignUp down to the banner" can be asserted here by clicking the
// banner's own links.
jest.mock('./MapView', () => {
  const { LoginPromptBanner } = require('./LoginPromptBanner');
  return {
    MapView: ({ onRequestLogin, onRequestSignUp }) => (
      <div data-testid="mock-map-view">
        <LoginPromptBanner
          onRequestLogin={onRequestLogin}
          onRequestSignUp={onRequestSignUp}
        />
      </div>
    ),
  };
});

import { MapPage } from './MapPage';
import { useSession } from '../state/sharedState';

// useSession is module-scoped shared state, so reset it between tests.
function setSession(session) {
  function Harness() {
    const [, setSessionValue] = useSession();
    React.useEffect(() => {
      setSessionValue(session);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }
  const { unmount } = render(<Harness />);
  unmount();
}

beforeEach(() => {
  setSession(null);
});

afterEach(() => {
  setSession(null);
});

describe('MapPage', () => {
  it('renders MapView', () => {
    render(<MapPage />);

    expect(screen.getByTestId('mock-map-view')).toBeInTheDocument();
  });

  it('shows the login-prompt banner (nested via MapView) for an unauthenticated session', () => {
    render(<MapPage />);

    expect(screen.getByTestId('login-prompt-banner')).toBeInTheDocument();
  });

  it('shows no login-prompt banner for an authenticated session', () => {
    setSession({ username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 });

    render(<MapPage />);

    expect(screen.getByTestId('mock-map-view')).toBeInTheDocument();
    expect(screen.queryByTestId('login-prompt-banner')).toBeNull();
  });

  // Requirement 9.2: MapPage is a pure pass-through for the banner's two
  // navigation callbacks (AuthGate -> MapPage -> MapView -> banner).
  it('forwards onRequestLogin down to the banner\'s "Log in" link', () => {
    const onRequestLogin = jest.fn();

    render(<MapPage onRequestLogin={onRequestLogin} />);

    fireEvent.click(screen.getByTestId('login-prompt-login-link'));

    expect(onRequestLogin).toHaveBeenCalledTimes(1);
  });

  it('forwards onRequestSignUp down to the banner\'s "sign up for an account" link', () => {
    const onRequestSignUp = jest.fn();

    render(<MapPage onRequestSignUp={onRequestSignUp} />);

    fireEvent.click(screen.getByTestId('login-prompt-signup-link'));

    expect(onRequestSignUp).toHaveBeenCalledTimes(1);
  });

  it('renders the banner without crashing when no navigation callbacks are given', () => {
    render(<MapPage />);

    expect(() => {
      fireEvent.click(screen.getByTestId('login-prompt-login-link'));
      fireEvent.click(screen.getByTestId('login-prompt-signup-link'));
    }).not.toThrow();
  });
});
