// Integration test (task 19.3): successful login followed by the
// Requirement 4 load populating the map with the Visit_Record_API's
// returned visited states (Requirements 1.6, 1.7).
//
// This exercises the REAL component tree end to end, across the mocked
// `authenticationService.login` / `fetch` boundary, rather than testing any
// one layer in isolation (each of those layers already has its own
// dedicated unit/property tests elsewhere):
//
//   AuthGate (session === null) -> TopNav ("Log in" control) -> MapPage
//     -> MapView (guest: no visited states fetch) -> user clicks "Log in"
//     -> LoginPage/LoginForm
//       -> authenticationService.login() (mocked) resolves a Session
//         -> LoginPage's handleLoginSuccess sets useSession + clears
//            useVisitedStateIds
//           -> AuthGate observes session !== null, switches back to MapPage
//             -> MapView (now with a non-null session) mounts
//               useVisitedStatesLoader(session), which calls
//               listVisitedStates(session) (mocked fetch) for the
//               Visit_Record_API's /visit endpoint
//                 -> once that load's status becomes 'ready', MapView's
//                    sync effect applies the result to the SHARED
//                    useVisitedStateIds store
//                      -> asserted here via a probe component, and (per
//                         Requirement 6) is what StateBoundaryOverlay reads
//                         to color the corresponding regions.
//
// Fixtures/patterns (fake Maps API constructors, region GeoJSON fixture,
// script-tag onload triggering, shared-state reset harness) are adapted
// from MapView.test.js's own smoke test and LoginPage.test.js's
// login-mocking convention.

import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';

import { AuthGate } from './AuthGate';
import { GOOGLE_MAPS_SCRIPT_ID } from './useGoogleMapsLoader';
import {
  useSession,
  useVisitedStateIds,
  usePendingStateIds,
  useToastError,
} from '../state/sharedState';

jest.mock('../services/authenticationService', () => ({
  ...jest.requireActual('../services/authenticationService'),
  login: jest.fn(),
}));

import { login } from '../services/authenticationService';

// A small, valid FeatureCollection covering the two stateIds the mocked
// Visit_Record_API will report as visited (CA, NY), matching the shape
// useRegionsLoader()/parseRegionsFromGeoJson expect (see
// MapView.test.js's own REGIONS_FIXTURE for the same pattern).
const REGIONS_FIXTURE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { stateId: 'CA', name: 'California' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-10, -10],
            [10, -10],
            [10, 10],
            [-10, 10],
            [-10, -10],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { stateId: 'NY', name: 'New York' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [20, 20],
            [30, 20],
            [30, 30],
            [20, 30],
            [20, 20],
          ],
        ],
      },
    },
  ],
};

function resetSharedState() {
  function Reset() {
    const [, setSession] = useSession();
    const [, setVisitedStateIds] = useVisitedStateIds();
    const [, setPendingStateIds] = usePendingStateIds();
    const [, setToastError] = useToastError();
    React.useEffect(() => {
      setSession(null);
      setVisitedStateIds({});
      setPendingStateIds({});
      setToastError(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }
  const { unmount } = render(<Reset />);
  unmount();
}

// Probe reading the SHARED useVisitedStateIds store -- this, not any
// per-hook internal state, is what StateBoundaryOverlay actually renders
// from (Requirement 6), so asserting against it is what confirms the
// Requirement 4 load's result was actually wired into the app rather than
// left stranded inside useVisitedStatesLoader's own return value.
function VisitedStateIdsProbe() {
  const [visitedStateIds] = useVisitedStateIds();
  return <div data-testid="visited-state-ids-probe">{JSON.stringify(visitedStateIds)}</div>;
}

function setUpFakeGoogleMaps() {
  const mapConstructor = jest.fn().mockImplementation(function Map(element, options) {
    this.element = element;
    this.options = options;
    this.addListener = jest.fn(() => ({ remove: jest.fn() }));
  });
  const polygonConstructor = jest.fn().mockImplementation(function Polygon(options) {
    this.options = options;
    this.setMap = jest.fn();
    this.setOptions = jest.fn();
  });
  window.google = {
    maps: {
      Map: mapConstructor,
      Polygon: polygonConstructor,
      importLibrary: jest.fn().mockResolvedValue({}),
    },
  };
  return { mapConstructor, polygonConstructor };
}

function getMapScriptTag() {
  const scriptTag = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
  expect(scriptTag).not.toBeNull();
  return scriptTag;
}

beforeEach(() => {
  login.mockReset();
  resetSharedState();
});

afterEach(() => {
  delete window.google;
  global.fetch = undefined;
  document.querySelectorAll(`#${GOOGLE_MAPS_SCRIPT_ID}`).forEach((scriptTag) => scriptTag.remove());
});

describe('Login followed by the Requirement 4 load (integration)', () => {
  it('populates the shared visited-state store with exactly the Visit_Record_API-returned states after a successful login', async () => {
    setUpFakeGoogleMaps();

    // Distinguish the two fetch() consumers by URL: useRegionsLoader()
    // fetches the static boundary asset (relative path), while
    // visitRecordApiClient.listVisitedStates() fetches the configured
    // Visit_Record_API base URL + "/visit" (an absolute URL, per
    // config.js's default). Both need to resolve successfully for this
    // scenario to reach the assertion.
    global.fetch = jest.fn((url) => {
      if (typeof url === 'string' && url.includes('/visit')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ placesVisited: [{ Id: 'CA' }, { Id: 'NY' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(REGIONS_FIXTURE),
      });
    });

    render(
      <>
        <AuthGate />
        <VisitedStateIdsProbe />
      </>
    );

    // Guest phase: session is null, so TopNav shows the "Log in" control
    // and MapView is rendering (guest path -- no /visit fetch yet).
    expect(screen.getByTestId('nav-login-link')).toBeInTheDocument();
    expect(screen.getByTestId('visited-state-ids-probe').textContent).toBe(JSON.stringify({}));

    // Get the map script rendered (task 12.2's loader) to 'ready' so
    // MapView can clear its combined loading state once regions are ready
    // too. This only needs to happen once; useGoogleMapsLoader's status is
    // a module-level singleton shared across MapView's remounts below.
    const scriptTag = getMapScriptTag();
    act(() => {
      scriptTag.onload();
    });

    // Let the (guest-phase) region fetch resolve so MapView finishes its
    // initial guest render.
    await waitFor(() => expect(screen.getByTestId('map-view')).toBeInTheDocument());

    // Trigger the login control (Requirement 1.2).
    fireEvent.click(screen.getByTestId('nav-login-link'));
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();

    // Mock a successful Cognito authentication.
    login.mockResolvedValue({
      username: 'alice',
      accessToken: 'test-access-token',
      expiresAt: Date.now() + 100000,
    });

    // Fill in credentials and submit (LoginPage/LoginForm's real
    // validation + submit flow).
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'correct-password' },
    });
    // Scoped to the login form itself: TopNav also renders a "Log in"
    // button (before the user is authenticated), so a page-wide query by
    // accessible name would match both.
    const loginForm = screen.getByLabelText(/username/i).closest('form');
    fireEvent.click(within(loginForm).getByRole('button', { name: /log in/i }));

    // Requirements 1.6/1.7: successful authentication stores the Session,
    // discards prior visited-state data, and AuthGate returns to MapPage,
    // whose (freshly remounted) MapView now has a non-null session and
    // triggers the Requirement 4 load. Wait for that whole chain to settle
    // and the map to be showing again (regions fetch re-resolves for the
    // new MapView instance; the map script loader is already 'ready').
    await waitFor(() => expect(screen.getByTestId('map-view')).toBeInTheDocument());

    // The login control disappears once signed in, replaced by the "Log
    // out" control (TopNav hides one and shows the other based on
    // useSession -- see TopNav.js), confirming we're actually past the
    // login flow.
    expect(screen.queryByTestId('nav-login-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('nav-logout-link')).toBeInTheDocument();

    // Requirement 1.6/1.7: the SHARED visited-state store ends up
    // containing exactly the stateIds the mocked Visit_Record_API
    // returned, confirming the Requirement 4 load was triggered by login
    // and its result was applied to the store StateBoundaryOverlay renders
    // from (Requirement 6).
    await waitFor(() =>
      expect(screen.getByTestId('visited-state-ids-probe').textContent).toBe(
        JSON.stringify({ CA: true, NY: true })
      )
    );

    // Sanity check: the /visit endpoint was actually called (with the
    // Authorization header carrying the new session's access token),
    // confirming the load was genuinely triggered post-login rather than
    // the store being populated some other way.
    const visitCalls = global.fetch.mock.calls.filter(([url]) => url.includes('/visit'));
    expect(visitCalls.length).toBeGreaterThan(0);
    const [, visitRequestInit] = visitCalls[visitCalls.length - 1];
    expect(visitRequestInit.headers.Authorization).toBe('test-access-token');
  });
});
