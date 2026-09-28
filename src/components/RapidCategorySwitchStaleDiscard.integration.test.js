// Integration test (task 33, optional): rapid category switching with
// out-of-order mocked resolution of the boundary-data fetch (Requirement
// 14.7).
//
// This is an END-TO-END integration test through the REAL component tree
// (AuthGate -> TopNav/MyPlacesControl -> MapPage -> MapView ->
// StateBoundaryOverlay/PlaceInfoPanel/PlaceVisitStatusLists), driven by
// REAL clicks through MyPlacesControl's own rendered UI, NOT by calling
// useSelectedPlaceCategory's setter directly. That direct-setter approach
// is exactly what MapView.test.js's Property 27 test (task 29.4) and
// useVisitedPlacesLoader.test.js's/placeBoundaries.test.js's Property 30
// tests (task 26.5) already use to cover the underlying stale-discard
// mechanism thoroughly at the hook/component level. This test's only
// marginal purpose is proving the SAME guarantee holds when driven through
// the fully-wired real app and its real UI.
//
// Scenario design decisions (see task prompt for the full reasoning this
// summarizes):
//   - GUEST scenario, no login. Requirement 13.6 says the My_Places_Control
//     (and thus category switching) is available to guests, and a guest
//     still fully exercises usePlaceBoundariesLoader()'s stale-discard path
//     (boundary data always loads regardless of auth). useVisitedPlacesLoader
//     skips its own fetch entirely for a guest (Property 9), so this
//     scenario does not exercise THAT loader's own stale-discard mechanism
//     -- but task 26.5's Property 30 test already covers that mechanism
//     thoroughly (with an authenticated session, at the hook level), so
//     there is no marginal value in re-proving it here too. Staying
//     guest-only keeps this already-tricky async/UI-driven test simpler
//     (no login form to drive through first).
//   - Only the 'canada-state' boundary fetch is deferred/controllable in
//     this test; 'us-state' (the initial category, whose fetch happens on
//     first render) is allowed to resolve immediately via the fixture
//     fetch mock below, since Requirement 14.7 is about a request going
//     stale, and 'us-state' is never switched AWAY from before its own
//     fetch would have settled in this scenario -- it's simply the
//     starting point. 'country' (the finally-selected category) also gets
//     its own deferred/controllable promise, resolved LAST, to prove the
//     finally-selected category's own load still completes and renders
//     normally despite the earlier out-of-order resolution.
//
// Sequence exercised:
//   1. Render <AuthGate /> (real top-level tree) plus a probe reading the
//      FULL useVisitedPlaceIdsByCategory() object (all 3 categories).
//   2. Get the map script to 'ready' (fake Maps API + script onload,
//      matching LoginThenLoadVisitedStates.integration.test.js's pattern).
//   3. us-state's boundary fetch resolves immediately (not deferred) --
//      MapView reaches its ready/rendered state for the default category.
//   4. Click through the real MyPlacesControl UI: open the dropdown, click
//      the 'canada-state' option. Its boundary fetch is deferred (never
//      resolves yet).
//   5. Immediately click through the UI again: open the dropdown, click
//      the 'country' option -- BEFORE canada-state's fetch has resolved.
//      country's own boundary fetch is ALSO deferred.
//   6. Resolve canada-state's deferred fetch late (out of order). Assert
//      its result is discarded: canada-state's slice of
//      useVisitedPlaceIdsByCategory is untouched (still {}), and nothing
//      belonging to canada-state (e.g. "Ontario") ever appears on the
//      page.
//   7. Resolve country's own deferred fetch. Assert the map/UI now
//      correctly shows country's regions (e.g. "Canada" -- one of the
//      country fixture's own region names, deliberately distinct from
//      "Canadian Provinces"/canada-state's own fixture names like
//      "Ontario") via PlaceVisitStatusLists, proving the finally-selected
//      category's own load still completes and renders normally.
//   8. Sanity-check us-state's slice was never touched by any of this.
//
// Fixtures/patterns (fake Maps API constructors, script-tag onload
// triggering, shared-state reset harness, fetch mocking by URL substring)
// are adapted from LoginThenLoadVisitedStates.integration.test.js and
// GuestLocalMarksPersistence.integration.test.js. The per-category asset
// URL substrings ('stateBoundaries' / 'canadaProvinceBoundaries' /
// 'countryBoundaries') match the ones MapView.test.js's own Property 27
// test (task 29.4) already relies on, since they come straight from
// placeBoundaries.js's real asset paths.

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import { AuthGate } from './AuthGate';
import { GOOGLE_MAPS_SCRIPT_ID } from './useGoogleMapsLoader';
import {
  useSession,
  useVisitedPlaceIdsByCategory,
  usePendingPlaceIds,
  useSelectedPlaceCategory,
  useToastError,
} from '../state/sharedState';

// One small, distinct fixture per category, so each category's own region
// name(s) are unambiguous on the page.
const US_STATE_FIXTURE = {
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
  ],
};

const CANADA_STATE_FIXTURE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { stateId: 'ON', name: 'Ontario' },
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

const COUNTRY_FIXTURE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { stateId: 'CA-COUNTRY', name: 'Canada' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [40, 40],
            [50, 40],
            [50, 50],
            [40, 50],
            [40, 40],
          ],
        ],
      },
    },
  ],
};

function resetSharedState() {
  function Reset() {
    const [, setSession] = useSession();
    const [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
    const [, setPendingPlaceIds] = usePendingPlaceIds();
    const [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
    const [, setToastError] = useToastError();
    React.useEffect(() => {
      setSession(null);
      setVisitedPlaceIdsByCategory({ 'us-state': {}, 'canada-state': {}, country: {} });
      setPendingPlaceIds({ 'us-state': {}, 'canada-state': {}, country: {} });
      setSelectedPlaceCategory('us-state');
      setToastError(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }
  const { unmount } = render(<Reset />);
  unmount();
}

// Probe reading the FULL useVisitedPlaceIdsByCategory() object (all 3
// categories), so the test can assert on any of them, not just one slice.
function VisitedPlaceIdsByCategoryProbe() {
  const [visitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
  return (
    <div data-testid="visited-place-ids-by-category-probe">
      {JSON.stringify(visitedPlaceIdsByCategory)}
    </div>
  );
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

// Opens the real My_Places_Control dropdown and clicks the given option,
// driving the switch through the actual rendered UI rather than the
// setter directly (the whole point of this being an integration test).
function switchSelectedPlaceCategoryViaUi(placeCategory) {
  fireEvent.click(screen.getByTestId('my-places-control'));
  fireEvent.click(screen.getByTestId(`my-places-option-${placeCategory}`));
}

beforeEach(() => {
  resetSharedState();
});

afterEach(() => {
  delete window.google;
  global.fetch = undefined;
  document.querySelectorAll(`#${GOOGLE_MAPS_SCRIPT_ID}`).forEach((scriptTag) => scriptTag.remove());
});

describe('Rapid category switching with out-of-order mocked resolution (integration)', () => {
  it(
    'discards a stale canada-state boundary fetch resolved out of order after switching to country, while country\'s own load still completes and renders, and us-state\'s slice stays untouched',
    async () => {
      setUpFakeGoogleMaps();

      let resolveCanadaFetch;
      let resolveCountryFetch;

      global.fetch = jest.fn((url) => {
        if (typeof url !== 'string') {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(US_STATE_FIXTURE) });
        }

        if (url.includes('canadaProvinceBoundaries')) {
          // Deferred/controllable: resolved later, out of order (step 6).
          return new Promise((resolve) => {
            resolveCanadaFetch = () =>
              resolve({ ok: true, status: 200, json: () => Promise.resolve(CANADA_STATE_FIXTURE) });
          });
        }

        if (url.includes('countryBoundaries')) {
          // Also deferred/controllable: resolved last (step 7).
          return new Promise((resolve) => {
            resolveCountryFetch = () =>
              resolve({ ok: true, status: 200, json: () => Promise.resolve(COUNTRY_FIXTURE) });
          });
        }

        // 'us-state' (the default/starting category) resolves immediately.
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(US_STATE_FIXTURE) });
      });

      render(
        <>
          <AuthGate />
          <VisitedPlaceIdsByCategoryProbe />
        </>
      );

      // Get the map script to 'ready' (guest scenario -- no login needed).
      const scriptTag = getMapScriptTag();
      await act(async () => {
        scriptTag.onload();
        // Flush the importLibrary() microtask chain triggered by onload.
        await Promise.resolve();
        await Promise.resolve();
      });

      // us-state's boundary fetch resolves immediately -- MapView reaches
      // its normal rendered state for the default category.
      await waitFor(() => expect(screen.getByTestId('map-view')).toBeInTheDocument());
      expect(screen.getByText('California')).toBeInTheDocument();

      // Step 4: switch to 'canada-state' via the real MyPlacesControl UI,
      // BEFORE its boundary fetch resolves (it's deferred).
      switchSelectedPlaceCategoryViaUi('canada-state');

      // MapView is now loading canada-state's boundary data (deferred).
      await waitFor(() => expect(screen.getByTestId('map-view-loading')).toBeInTheDocument());

      // Step 5: immediately switch again to 'country' via the real UI,
      // BEFORE canada-state's fetch has resolved either. country's own
      // fetch is also deferred.
      switchSelectedPlaceCategoryViaUi('country');

      // Still loading (country's own deferred fetch hasn't resolved yet).
      expect(screen.getByTestId('map-view-loading')).toBeInTheDocument();

      // Sanity: both deferred resolvers were actually captured, confirming
      // both fetches were genuinely issued before either settled.
      expect(typeof resolveCanadaFetch).toBe('function');
      expect(typeof resolveCountryFetch).toBe('function');

      // Step 6: resolve canada-state's deferred fetch LATE, out of order
      // (the user has already moved on to 'country'). This must be
      // discarded entirely.
      await act(async () => {
        resolveCanadaFetch();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Still showing the loading indicator: country's own fetch has not
      // resolved yet, and canada-state's late result must not have been
      // mistaken for it.
      expect(screen.getByTestId('map-view-loading')).toBeInTheDocument();

      // canada-state's slice of the shared store must remain untouched
      // (still {}) -- the discarded fetch never wrote to it. (Boundary
      // data itself isn't written to this store at all -- only
      // visited-place ids are -- but the deeper assertion below confirms
      // canada-state's boundary data never became "current" either.)
      let probeState = JSON.parse(
        screen.getByTestId('visited-place-ids-by-category-probe').textContent
      );
      expect(probeState['canada-state']).toEqual({});

      // Ontario (canada-state's fixture region) must never appear on the
      // page as a result of the stale resolution.
      expect(screen.queryByText('Ontario')).not.toBeInTheDocument();

      // Step 7: resolve country's own deferred fetch. The finally-selected
      // category's own load must still complete and render normally.
      await act(async () => {
        resolveCountryFetch();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => expect(screen.getByTestId('map-view')).toBeInTheDocument());
      // "Canada" is country's own fixture region name (deliberately
      // distinct from canada-state's "Ontario" fixture), confirming the
      // map/lists now show country's data, not a leftover from either
      // earlier category.
      await waitFor(() => expect(screen.getByText('Canada')).toBeInTheDocument());
      expect(screen.queryByText('Ontario')).not.toBeInTheDocument();
      expect(screen.queryByText('California')).not.toBeInTheDocument();

      // Step 8: us-state's original slice was never touched by any of
      // this (it was never marked visited by anything in this scenario,
      // so it should still be exactly {}).
      probeState = JSON.parse(screen.getByTestId('visited-place-ids-by-category-probe').textContent);
      expect(probeState['us-state']).toEqual({});
      expect(probeState['canada-state']).toEqual({});
    },
    15000
  );
});
