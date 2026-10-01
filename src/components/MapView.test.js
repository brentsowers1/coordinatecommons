// Unit tests for MapView's combined loading/error/retry UI (task 12.2),
// covering both the Google Maps script loader (`useGoogleMapsLoader()`)
// and the runtime boundary-fetch loader (`usePlaceBoundariesLoader()`), with
// `fetch` mocked at the component level.
//
// --- Singleton workaround (read this before touching these tests) --------
//
// `useGoogleMapsLoader.js` intentionally holds its loading state in
// MODULE-SCOPED variables (`moduleState`, `scriptElement`) so every
// component in the real app shares a single injected `<script>` tag. That
// is the right design for the app, but it means that state would otherwise
// leak from one test to the next *within this file*, since Jest only
// isolates the module registry per test FILE, not per test.
//
// An earlier version of this file tried `jest.resetModules()` +
// re-`require()`-ing the modules under test inside each test. That doesn't
// work here: re-requiring `./MapView` after `resetModules()` transitively
// re-requires `react` itself, producing a second React module instance
// distinct from the one already bound inside the statically-imported
// `@testing-library/react` -- mixing the two trips "Invalid hook call"
// errors. Re-requiring `@testing-library/react` itself inside a test body
// doesn't work either, since that module registers its own cleanup hooks
// (`afterEach`/`beforeAll`/`afterAll`) as a side effect of being loaded,
// and Jest forbids registering hooks from inside a running test.
//
// Instead, everything here uses normal static imports (one shared React
// instance, matching `@testing-library/react`'s), and resets the
// `useGoogleMapsLoader` singleton between tests by using its own public
// API: a `beforeEach` mounts a throwaway harness component that calls the
// hook and immediately invokes `retry()`, which is the loader's own
// documented way of discarding whatever script tag/status exists and
// starting over from `'loading'` with a fresh script tag. This works
// whether the singleton is in its initial state, `'ready'`, or `'error'`.
//
// `window.google` and any leftover script tag are also cleared after every
// test, since jsdom's `document` is unaffected by any of the above.

import fc from 'fast-check';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import { MapView } from './MapView';
import { useGoogleMapsLoader, GOOGLE_MAPS_SCRIPT_ID } from './useGoogleMapsLoader';
import { usePlaceBoundariesLoader } from '../data/placeBoundaries';
import { useSelectedPlaceCategory, useInfoPanelPlaceId, useSession } from '../state/sharedState';

function resetGoogleMapsLoaderSingleton() {
  function ResetHarness() {
    const { retry } = useGoogleMapsLoader();
    React.useEffect(() => {
      retry();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  const { unmount } = render(<ResetHarness />);
  unmount();
}

// usePlaceBoundariesLoader('us-state') caches its result at module scope
// too (Requirement 14.5 -- see placeBoundaries.js), for the same
// across-the-real-app reason useGoogleMapsLoader does. Same workaround:
// mount a throwaway harness and call retry(), which evicts this category's
// cached entry, so each test in this file starts from a fresh 'loading'
// state and actually exercises its own `fetch` mock rather than reusing a
// previous test's cached result.
function resetPlaceBoundariesLoaderSingleton(placeCategory = 'us-state') {
  function ResetHarness() {
    const { retry } = usePlaceBoundariesLoader(placeCategory);
    React.useEffect(() => {
      retry();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  const { unmount } = render(<ResetHarness />);
  unmount();
}

// useSelectedPlaceCategory is shared state that persists across tests in
// this file (make-shared-state-hook's module-scoped store) -- reset it to
// its default ('us-state') before each test so a category switch made in
// one test doesn't leak into the next.
function resetSelectedPlaceCategorySingleton() {
  function ResetHarness() {
    const [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
    React.useEffect(() => {
      setSelectedPlaceCategory('us-state');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  const { unmount } = render(<ResetHarness />);
  unmount();
}

// useInfoPanelPlaceId is shared state that persists across tests in this
// file too -- reset it to its default (null) before each test so a
// hover/click made in one test doesn't leak into the next.
function resetInfoPanelPlaceIdSingleton() {
  function ResetHarness() {
    const [, setInfoPanelPlaceId] = useInfoPanelPlaceId();
    React.useEffect(() => {
      setInfoPanelPlaceId(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  const { unmount } = render(<ResetHarness />);
  unmount();
}

// useSession is module-scoped shared state too (and MapView now renders
// LoginPromptBanner, which reads it) -- reset it to its default (null, i.e.
// an unauthenticated guest) before each test, and provide a setter helper
// for the tests that need an authenticated session.
function setSessionTo(session) {
  function Harness() {
    const [, setSession] = useSession();
    React.useEffect(() => {
      setSession(session);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  const { unmount } = render(<Harness />);
  unmount();
}

beforeEach(() => {
  setSessionTo(null);
  resetGoogleMapsLoaderSingleton();
  resetPlaceBoundariesLoaderSingleton('us-state');
  resetPlaceBoundariesLoaderSingleton('canada-state');
  resetPlaceBoundariesLoaderSingleton('country');
  resetSelectedPlaceCategorySingleton();
  resetInfoPanelPlaceIdSingleton();
});

afterEach(() => {
  setSessionTo(null);
  delete window.google;
  global.fetch = undefined;
  document.querySelectorAll(`#${GOOGLE_MAPS_SCRIPT_ID}`).forEach((scriptTag) => scriptTag.remove());
});

function getMapScriptTag() {
  const scriptTag = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
  expect(scriptTag).not.toBeNull();
  return scriptTag;
}

describe('MapView - loading UI', () => {
  it('shows the loading indicator while both the map script and the region data are still loading', () => {
    // Never resolves, so usePlaceBoundariesLoader stays 'loading'. The map script's
    // real onload/onerror never fire on their own in jsdom, so
    // useGoogleMapsLoader also stays 'loading' by default.
    global.fetch = jest.fn(() => new Promise(() => {}));

    render(<MapView />);

    // Queried by test id rather than by `role="status"`: for a guest,
    // `LoginPromptBanner` (also `role="status"`) is rendered alongside the
    // loading indicator (Requirement 9.2), so the role alone is ambiguous.
    expect(screen.getByTestId('map-view-loading')).toHaveTextContent(/Loading map/i);
  });
});

describe('MapView - combined loading indicator clears only when both sources are ready', () => {
  it('keeps showing the loading indicator once the map is ready but the region data is still loading, and clears it once both are ready', async () => {
    let resolveFetch;
    const pendingFetch = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    global.fetch = jest.fn(() => pendingFetch);

    // Required by useGoogleMapsLoader's onload handler to classify the
    // script load as successful.
    window.google = {
      maps: {
        Map: jest.fn(() => ({})),
        importLibrary: jest.fn().mockResolvedValue({}),
      },
    };

    render(<MapView />);

    // Queried by test id, not by `role="status"` -- see the note in the
    // loading-UI test above (the guest login-prompt banner shares that role).
    expect(screen.getByTestId('map-view-loading')).toHaveTextContent(/Loading map/i);

    const scriptTag = getMapScriptTag();

    act(() => {
      scriptTag.onload();
    });

    // Map script is now 'ready', but the region fetch is still pending --
    // the combined loading indicator must still be shown.
    expect(screen.getByTestId('map-view-loading')).toHaveTextContent(/Loading map/i);
    expect(screen.queryByTestId('google-map-canvas')).toBeNull();

    await act(async () => {
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ type: 'FeatureCollection', features: [] }),
      });
      await pendingFetch;
    });

    await waitFor(() => expect(screen.getByTestId('google-map-canvas')).toBeInTheDocument());
    expect(screen.queryByTestId('map-view-loading')).toBeNull();
  });
});

describe('MapView - error identification', () => {
  it('shows the map-only failure message with only the map retry button when the map script fails and the region data loads successfully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ type: 'FeatureCollection', features: [] }),
    });

    render(<MapView />);

    const scriptTag = getMapScriptTag();
    act(() => {
      scriptTag.onerror();
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/map failed to load/i);
    expect(screen.getByText('Retry loading map')).toBeInTheDocument();
    expect(screen.queryByText('Retry loading region data')).toBeNull();
  });

  it('shows the region-data-only failure message with only the regions retry button when the region fetch fails and the map script is still loading', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    render(<MapView />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/region data failed to load/i);
    expect(screen.getByText('Retry loading region data')).toBeInTheDocument();
    expect(screen.queryByText('Retry loading map')).toBeNull();
  });

  it('shows the combined failure message with both retry buttons when both the map script and the region fetch fail', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    render(<MapView />);

    const scriptTag = getMapScriptTag();
    act(() => {
      scriptTag.onerror();
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/map failed to load and the region data failed to load/i);
    expect(screen.getByText('Retry loading map')).toBeInTheDocument();
    expect(screen.getByText('Retry loading region data')).toBeInTheDocument();
  });
});

describe('MapView - retry', () => {
  it('re-invokes fetch when the region-data retry button is clicked', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    render(<MapView />);

    await screen.findByRole('alert');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Retry loading region data'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it('re-invokes the map script loader (issuing a new script tag) when the map retry button is clicked', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ type: 'FeatureCollection', features: [] }),
    });

    render(<MapView />);

    const firstScriptTag = getMapScriptTag();
    act(() => {
      firstScriptTag.onerror();
    });

    await screen.findByRole('alert');

    fireEvent.click(screen.getByText('Retry loading map'));

    await waitFor(() => {
      const scriptTagAfterRetry = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
      expect(scriptTagAfterRetry).not.toBeNull();
      expect(scriptTagAfterRetry).not.toBe(firstScriptTag);
    });
  });

  it('re-invokes importLibrary (without re-injecting a script tag) when the map retry button is clicked after the bootstrap already loaded but importLibrary itself failed', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ type: 'FeatureCollection', features: [] }),
    });

    // The bootstrap script itself succeeds, but the first importLibrary('maps')
    // call rejects (e.g. a blocked gen_204 telemetry ping) -- this is the
    // "bootstrap loaded, importLibrary failed" scenario, distinct from the
    // script.onerror scenario covered above.
    const importLibrary = jest.fn().mockRejectedValueOnce(new Error('blocked'));
    window.google = {
      maps: {
        importLibrary,
        Map: jest.fn().mockImplementation(function Map(element, options) {
          this.element = element;
          this.options = options;
          this.addListener = jest.fn(() => ({ remove: jest.fn() }));
        }),
      },
    };

    render(<MapView />);

    const firstScriptTag = getMapScriptTag();
    await act(async () => {
      firstScriptTag.onload();
      // Let the rejected importLibrary promise settle.
      await Promise.resolve().then(() => Promise.resolve());
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/map failed to load/i);

    expect(importLibrary).toHaveBeenCalledTimes(1);

    importLibrary.mockResolvedValueOnce({});

    fireEvent.click(screen.getByText('Retry loading map'));

    await waitFor(() => expect(importLibrary).toHaveBeenCalledTimes(2));

    // No new script tag was injected -- the SAME element is still present.
    const scriptTagAfterRetry = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    expect(scriptTagAfterRetry).toBe(firstScriptTag);
  });
});

describe('MapView - smoke test: real Maps API objects constructed (task 12.6)', () => {
  // A small, valid FeatureCollection fixture matching the shape
  // usePlaceBoundariesLoader()/parseRegionsFromGeoJson expect (Feature.properties.stateId/name,
  // Feature.geometry as a Polygon ring of [lng, lat] pairs).
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
        properties: { stateId: 'NV', name: 'Nevada' },
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
      {
        type: 'Feature',
        properties: { stateId: 'OR', name: 'Oregon' },
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

  it('constructs exactly one google.maps.Map and one google.maps.Polygon per fetched region once both loaders report ready', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(REGIONS_FIXTURE),
    });

    // Stub constructors that record their calls, matching the style used
    // in GoogleMapCanvas.test.js (Map) and StateBoundaryOverlay.test.js
    // (Polygon): a jest.fn() constructor mock that assigns onto `this`,
    // with just enough of a fake instance (`addListener`/`setMap`/
    // `setOptions`) for StateBoundaryOverlay to wire up without throwing.
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

    render(<MapView />);

    const scriptTag = getMapScriptTag();
    act(() => {
      scriptTag.onload();
    });

    // Both loaders ready: the loading indicator is gone and the map canvas
    // (and, transitively, the region overlay) has mounted.
    await waitFor(() => expect(screen.getByTestId('google-map-canvas')).toBeInTheDocument());
    expect(screen.queryByTestId('map-view-loading')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    // A map was actually constructed, not just that loading UI cleared.
    expect(mapConstructor).toHaveBeenCalledTimes(1);

    // The region overlay was actually constructed with one real Polygon
    // per fetched region, not just that no error occurred.
    await waitFor(() =>
      expect(polygonConstructor).toHaveBeenCalledTimes(REGIONS_FIXTURE.features.length)
    );
  });

  // Regression test: MapView must actually mount the real PlaceInfoPanel
  // (design.md Component Tree: "MapView --> PlaceInfoPanel") once both
  // loaders are ready, not just GoogleMapCanvas/StateBoundaryOverlay.
  // PlaceInfoPanel is NOT mocked here -- the point is verifying the real
  // wiring, matching how this describe block already mounts the real
  // Maps API smoke-test objects rather than mocks.
  it('renders the real PlaceInfoPanel once both loaders are ready', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(REGIONS_FIXTURE),
    });

    window.google = {
      maps: {
        Map: jest.fn().mockImplementation(function Map(element, options) {
          this.element = element;
          this.options = options;
          this.addListener = jest.fn(() => ({ remove: jest.fn() }));
        }),
        Polygon: jest.fn().mockImplementation(function Polygon(options) {
          this.options = options;
          this.setMap = jest.fn();
          this.setOptions = jest.fn();
        }),
        importLibrary: jest.fn().mockResolvedValue({}),
      },
    };

    render(<MapView />);

    const scriptTag = getMapScriptTag();
    act(() => {
      scriptTag.onload();
    });

    await waitFor(() => expect(screen.getByTestId('google-map-canvas')).toBeInTheDocument());

    // The real (unmocked) PlaceInfoPanel is mounted, and since no state is
    // hovered/clicked yet, it shows its neutral placeholder test-id.
    expect(screen.getByTestId('state-info-panel')).toBeInTheDocument();
    expect(screen.getByTestId('state-info-panel-placeholder')).toBeInTheDocument();
  });

  // Regression test: MapView must actually mount the real
  // PlaceVisitStatusLists (design.md Component Tree: "MapView -->
  // VisitedStatesLists") once both loaders are ready, following the same
  // reasoning as the PlaceInfoPanel regression test above -- mounted for
  // real, not mocked.
  it('renders the real PlaceVisitStatusLists once both loaders are ready', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(REGIONS_FIXTURE),
    });

    window.google = {
      maps: {
        Map: jest.fn().mockImplementation(function Map(element, options) {
          this.element = element;
          this.options = options;
          this.addListener = jest.fn(() => ({ remove: jest.fn() }));
        }),
        Polygon: jest.fn().mockImplementation(function Polygon(options) {
          this.options = options;
          this.setMap = jest.fn();
          this.setOptions = jest.fn();
        }),
        importLibrary: jest.fn().mockResolvedValue({}),
      },
    };

    render(<MapView />);

    const scriptTag = getMapScriptTag();
    act(() => {
      scriptTag.onload();
    });

    await waitFor(() => expect(screen.getByTestId('google-map-canvas')).toBeInTheDocument());

    expect(screen.getByTestId('visited-states-lists')).toBeInTheDocument();
  });
});

describe('MapView - switching useSelectedPlaceCategory (task 29.1, Requirements 14.1, 15.3)', () => {
  const US_STATE_REGIONS_FIXTURE = {
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

  const CANADA_PROVINCE_REGIONS_FIXTURE = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { stateId: 'ON', name: 'Ontario' },
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

  function mockFetchByAssetPath() {
    return jest.fn((path) => {
      if (typeof path === 'string' && path.includes('canada')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(CANADA_PROVINCE_REGIONS_FIXTURE),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(US_STATE_REGIONS_FIXTURE),
      });
    });
  }

  function setUpMapsStub() {
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

  it('loads and renders a different category’s boundaries, and tears down the previous category’s polygons, when useSelectedPlaceCategory changes', async () => {
    global.fetch = mockFetchByAssetPath();
    const { polygonConstructor } = setUpMapsStub();

    let setSelectedPlaceCategory;
    function Harness() {
      [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
      return <MapView />;
    }

    render(<Harness />);

    const scriptTag = getMapScriptTag();
    act(() => {
      scriptTag.onload();
    });

    await waitFor(() => expect(screen.getByTestId('google-map-canvas')).toBeInTheDocument());

    // us-state's single polygon (California) was constructed.
    await waitFor(() =>
      expect(polygonConstructor).toHaveBeenCalledTimes(US_STATE_REGIONS_FIXTURE.features.length)
    );
    const usStatePolygonInstances = polygonConstructor.mock.instances.slice();
    const [caPolygon] = usStatePolygonInstances;
    expect(caPolygon.setMap).not.toHaveBeenCalled();

    // Switch the Selected_Place_Category -- MapView should fetch and
    // render 'canada-state's boundaries instead.
    act(() => {
      setSelectedPlaceCategory('canada-state');
    });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('canada'))
    );

    // Once the canada-state boundary fetch resolves and the overlay
    // remounts (key={selectedPlaceCategory}), the previous (us-state)
    // polygon is torn down via the cleanup's setMap(null)...
    await waitFor(() => expect(caPolygon.setMap).toHaveBeenCalledWith(null));

    // ...and a new polygon is constructed for the new category's single
    // region (Ontario).
    await waitFor(() => {
      const newInstances = polygonConstructor.mock.instances.filter(
        (instance) => !usStatePolygonInstances.includes(instance)
      );
      expect(newInstances).toHaveLength(CANADA_PROVINCE_REGIONS_FIXTURE.features.length);
    });
  });

  it('colors the new category’s boundaries using only that category’s visited-id slice after a switch', async () => {
    global.fetch = mockFetchByAssetPath();
    setUpMapsStub();

    let setSelectedPlaceCategory;
    function Harness() {
      [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
      return <MapView />;
    }

    render(<Harness />);

    const scriptTag = getMapScriptTag();
    act(() => {
      scriptTag.onload();
    });

    await waitFor(() => expect(screen.getByTestId('google-map-canvas')).toBeInTheDocument());

    act(() => {
      setSelectedPlaceCategory('canada-state');
    });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('canada'))
    );

    // The new category's list/info-panel should be driven by 'canada-state's
    // (empty, guest) visited slice, not 'us-state's -- observable via the
    // visited/not-visited lists rendering Ontario as not-visited.
    await waitFor(() => expect(screen.getByText('Ontario')).toBeInTheDocument());
  });

  // Task 29.3 (Requirement 15.4, design.md "PlaceInfoPanel"): a placeId set
  // while hovering/clicking under one category has no defined meaning
  // against a different category's boundaries, so MapView must reset it to
  // null as part of the category-switch lifecycle it owns.
  it('resets useInfoPanelPlaceId to null when useSelectedPlaceCategory changes', async () => {
    global.fetch = mockFetchByAssetPath();
    setUpMapsStub();

    let setSelectedPlaceCategory;
    let setInfoPanelPlaceId;
    let infoPanelPlaceId;
    function Harness() {
      [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
      [infoPanelPlaceId, setInfoPanelPlaceId] = useInfoPanelPlaceId();
      return <MapView />;
    }

    render(<Harness />);

    const scriptTag = getMapScriptTag();
    act(() => {
      scriptTag.onload();
    });

    await waitFor(() => expect(screen.getByTestId('google-map-canvas')).toBeInTheDocument());

    // Simulate a hover/click having set the info panel target for the
    // current ('us-state') category.
    act(() => {
      setInfoPanelPlaceId('CA');
    });
    expect(infoPanelPlaceId).toBe('CA');

    // Switching the Selected_Place_Category must reset the stale
    // placeId back to null.
    act(() => {
      setSelectedPlaceCategory('canada-state');
    });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('canada'))
    );

    expect(infoPanelPlaceId).toBeNull();
  });

  // Task 29.2 (Requirements 14.3, 14.4): the error/retry UI must track
  // whichever Place_Category is CURRENTLY selected, not whatever category
  // was selected when the error first appeared. This covers the trickiest
  // edge case: an error is showing for 'us-state', then the user switches
  // to 'canada-state' -- the error UI must immediately reflect
  // 'canada-state's own status (not keep showing 'us-state's stale
  // error), and if 'canada-state' also fails, its retry button must
  // re-fetch only 'canada-state', never re-triggering 'us-state's fetch.
  it('replaces a stale error for the previous category with the newly selected category’s own status, and scopes retry to only the new category', async () => {
    let usStateFetchCount = 0;
    let canadaFetchCount = 0;
    global.fetch = jest.fn((path) => {
      if (typeof path === 'string' && path.includes('canada')) {
        canadaFetchCount += 1;
        // 'canada-state' fails on its first fetch, then succeeds on retry.
        if (canadaFetchCount === 1) {
          return Promise.reject(new Error('canada network down'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(CANADA_PROVINCE_REGIONS_FIXTURE),
        });
      }
      usStateFetchCount += 1;
      // 'us-state' always fails.
      return Promise.reject(new Error('us-state network down'));
    });
    setUpMapsStub();

    let setSelectedPlaceCategory;
    function Harness() {
      [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
      return <MapView />;
    }

    render(<Harness />);

    const scriptTag = getMapScriptTag();
    act(() => {
      scriptTag.onload();
    });

    // 'us-state's boundary fetch fails -- error UI shown, scoped to
    // 'us-state'.
    let alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/region data failed to load/i);
    expect(usStateFetchCount).toBe(1);

    // Switch to 'canada-state' WHILE the 'us-state' error is showing.
    act(() => {
      setSelectedPlaceCategory('canada-state');
    });

    // The UI must immediately reflect 'canada-state's own status. It has
    // not been fetched yet this session, so it starts 'loading' (NOT a
    // stale repeat of 'us-state's error) before its own fetch settles as
    // an error too.
    await waitFor(() => expect(canadaFetchCount).toBeGreaterThan(0));
    alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/region data failed to load/i);

    // Clicking the retry button now must re-fetch ONLY 'canada-state' --
    // 'us-state's fetch count must stay unchanged.
    const usStateFetchCountBeforeRetry = usStateFetchCount;
    fireEvent.click(screen.getByText('Retry loading region data'));

    await waitFor(() => expect(canadaFetchCount).toBe(2));
    expect(usStateFetchCount).toBe(usStateFetchCountBeforeRetry);

    // 'canada-state's retry succeeds, so the map (and Ontario's boundary)
    // renders -- confirming the UI is genuinely tracking 'canada-state',
    // not stuck on a stale 'us-state' error state.
    await waitFor(() => expect(screen.getByText('Ontario')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('MapView - Property 27: exactly one category’s boundaries are ever current after a switch (task 29.4)', () => {
  // Feature: state-visit-tracker, Property 27: Switching the Selected_Place_Category always results in exactly one category's boundaries being current
  //
  // Generalizes the fixed-example test above ("loads and renders a
  // different category's boundaries, and tears down the previous
  // category's polygons, when useSelectedPlaceCategory changes", task
  // 29.1), which only exercises ONE hardcoded switch (us-state ->
  // canada-state), into an arbitrary property: for ANY sequence of
  // switches among the app's three real Place_Category values, at every
  // point after each switch is applied and its data has loaded, the set
  // of "live" (not torn down) polygons corresponds to exactly the
  // most-recently-selected category -- every polygon belonging to any
  // earlier-selected category has had `setMap(null)` called on it
  // (task 29.1's `key={selectedPlaceCategory}` remount mechanism), and
  // the new category's own polygons are never torn down.
  //
  // Scope: this is a component-level test (MapView + StateBoundaryOverlay
  // together), since Property 27 is fundamentally about their combined
  // remount behavior, not a pure function. Each run drives a random
  // sequence of 3-6 switches among the 3 real category values (repeats
  // allowed, so re-selecting the already-current category is also
  // exercised) through a real render, mocking `fetch` per category with a
  // distinct single-feature FeatureCollection so each category's "live"
  // polygon count/identity is unambiguous.
  //
  // numRuns is reduced from the file-wide default of 100 (used by simpler
  // pure-function properties elsewhere in this codebase) to 20: each run
  // performs a real component mount plus 3-6 sequential
  // act()-wrapped-fetch-and-remount round trips, which is far more
  // expensive per run than a pure-function property. This matches the
  // reasoning already used for Property 30's component/hook-level tests
  // (useVisitedPlacesLoader.test.js, placeBoundaries.test.js), which
  // reduce numRuns to 50 for similar (cheaper, single-switch) async
  // overhead; this property's per-run cost is higher still (multiple
  // switches per run), so it is reduced further to 20.
  const CATEGORY_ASSET_SUBSTRING = {
    'us-state': 'stateBoundaries',
    'canada-state': 'canadaProvinceBoundaries',
    country: 'countryBoundaries',
  };
  const CATEGORIES = Object.keys(CATEGORY_ASSET_SUBSTRING);

  // A monotonically increasing counter suffix guarantees every property
  // run uses placeId/name values never seen before, so each category's
  // "live" polygon for THIS run is unambiguous even though the category
  // labels themselves ('us-state'/'canada-state'/'country') are reused
  // across runs (same technique as the Property 28/30 tests in
  // placeBoundaries.test.js).
  let runCounter = 0;

  function featureCollectionFor(placeCategory) {
    runCounter += 1;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { stateId: `${placeCategory}-${runCounter}`, name: `${placeCategory}-${runCounter}-name` },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
  }

  function resetAllPlaceBoundariesLoaderSingletons() {
    CATEGORIES.forEach((placeCategory) => resetPlaceBoundariesLoaderSingleton(placeCategory));
  }

  it(
    'tears down every previously selected category’s polygons and keeps exactly the newly selected category’s polygons live, for any sequence of switches',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.constantFrom(...CATEGORIES), { minLength: 3, maxLength: 6 }),
          async (switchSequence) => {
            // Fresh singleton state for this run (module-scoped caches
            // otherwise persist across fc runs within this one `it`).
            // resetPlaceBoundariesLoaderSingleton's retry() re-triggers its
            // OWN fetch effect synchronously (within this render/act), so
            // `global.fetch` must already be a safe, never-resolving stub
            // BEFORE resetting -- otherwise that reset-triggered fetch
            // would run against either `undefined` (throwing synchronously
            // inside the loader's try/catch, harmlessly reporting 'error')
            // or a leftover mock, and could otherwise race with this run's
            // own fetch mock.
            global.fetch = jest.fn(() => new Promise(() => {}));
            resetGoogleMapsLoaderSingleton();
            resetAllPlaceBoundariesLoaderSingletons();
            resetSelectedPlaceCategorySingleton();
            resetInfoPanelPlaceIdSingleton();

            // Each category gets its own fixture, freshly generated per
            // run so placeIds are unique to this run.
            const fixturesByCategory = {};
            CATEGORIES.forEach((placeCategory) => {
              fixturesByCategory[placeCategory] = featureCollectionFor(placeCategory);
            });

            global.fetch = jest.fn((path) => {
              const matchedCategory = CATEGORIES.find((placeCategory) =>
                typeof path === 'string' && path.includes(CATEGORY_ASSET_SUBSTRING[placeCategory])
              );
              return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(fixturesByCategory[matchedCategory]),
              });
            });

            const polygonConstructor = jest.fn().mockImplementation(function Polygon(options) {
              this.options = options;
              this.setMap = jest.fn();
              this.setOptions = jest.fn();
            });
            window.google = {
              maps: {
                Map: jest.fn().mockImplementation(function Map(element, options) {
                  this.element = element;
                  this.options = options;
                  this.addListener = jest.fn(() => ({ remove: jest.fn() }));
                }),
                Polygon: polygonConstructor,
                importLibrary: jest.fn().mockResolvedValue({}),
              },
            };

            let setSelectedPlaceCategory;
            function Harness() {
              [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
              return <MapView />;
            }

            const { unmount } = render(<Harness />);

            const scriptTag = getMapScriptTag();
            act(() => {
              scriptTag.onload();
            });

            // Initial mount renders the default ('us-state') category.
            await waitFor(() => expect(screen.getByTestId('google-map-canvas')).toBeInTheDocument());
            await waitFor(() =>
              expect(polygonConstructor).toHaveBeenCalledTimes(
                fixturesByCategory['us-state'].features.length
              )
            );

            // A polygon instance is "live" if its setMap has never been
            // called with null (StateBoundaryOverlay's only teardown
            // call). This is computed dynamically from the mock's own
            // call history, rather than from a manually-tracked snapshot,
            // so the assertions below are correct regardless of how many
            // intermediate polygon sets a given switch churns through --
            // e.g. GoogleMapCanvas itself unmounts/remounts (producing a
            // transient extra google.maps.Map/Polygon generation) whenever
            // MapView's combined loading gate briefly re-shows the loading
            // UI while the newly selected category's boundary data is
            // still being fetched for the first time (Requirement 14.2);
            // that transient generation is torn down just like any other
            // once the final map/regions settle, so it is correctly
            // excluded from "live" by this filter without the test having
            // to special-case it.
            function livePolygonsFor(instances) {
              return instances.filter((polygon) => !polygon.setMap.mock.calls.some((call) => call[0] === null));
            }

            // Tracks, for every category ever selected so far this run
            // (including the initial 'us-state' one), every polygon
            // instance ever constructed for it (live or torn down).
            let currentCategory = 'us-state';
            const allInstancesByCategory = {
              'us-state': polygonConstructor.mock.instances.slice(),
            };
            // Categories whose boundary data has already been
            // successfully fetched at least once so far this run --
            // usePlaceBoundariesLoader's per-category cache (Requirement
            // 14.5) means switching back to one of these never re-issues
            // a fetch, so the test must not wait on a new fetch call in
            // that case (it would time out).
            const everLoadedCategories = new Set(['us-state']);

            for (const nextCategory of switchSequence) {
              const previousCategory = currentCategory;
              const isNoOpSwitch = nextCategory === previousCategory;

              const instancesBeforeSwitch = polygonConstructor.mock.instances.slice();
              const fetchCallCountBeforeSwitch = global.fetch.mock.calls.length;

              act(() => {
                setSelectedPlaceCategory(nextCategory);
              });

              if (isNoOpSwitch) {
                // Re-selecting the already-current category: no remount,
                // no new fetch, no teardown -- the same polygons remain
                // live.
                // eslint-disable-next-line no-await-in-loop
                await Promise.resolve();
              } else {
                if (!everLoadedCategories.has(nextCategory)) {
                  // First time this run selecting nextCategory: its
                  // boundary data isn't cached yet, so a genuine new
                  // fetch is issued.
                  // eslint-disable-next-line no-await-in-loop
                  await waitFor(() =>
                    expect(global.fetch.mock.calls.length).toBeGreaterThan(fetchCallCountBeforeSwitch)
                  );
                  everLoadedCategories.add(nextCategory);
                }

                // Every polygon that was ever constructed for
                // previousCategory must now be torn down (whether it was
                // the "final" one or a transient GoogleMapCanvas-remount
                // generation, per the livePolygonsFor comment above).
                // eslint-disable-next-line no-await-in-loop
                await waitFor(() => {
                  allInstancesByCategory[previousCategory].forEach((polygon) => {
                    expect(polygon.setMap).toHaveBeenCalledWith(null);
                  });
                });

                // And exactly nextCategory's own polygon(s) are live once
                // everything settles -- computed dynamically (see
                // livePolygonsFor) so a transient extra generation churned
                // through and already torn down doesn't inflate this
                // count.
                // eslint-disable-next-line no-await-in-loop
                await waitFor(() => {
                  const newInstances = polygonConstructor.mock.instances.filter(
                    (instance) => !instancesBeforeSwitch.includes(instance)
                  );
                  expect(livePolygonsFor(newInstances)).toHaveLength(
                    fixturesByCategory[nextCategory].features.length
                  );
                });

                const newInstances = polygonConstructor.mock.instances.filter(
                  (instance) => !instancesBeforeSwitch.includes(instance)
                );
                allInstancesByCategory[nextCategory] = newInstances;
                currentCategory = nextCategory;
              }

              // Invariant, after every switch in the sequence (Property
              // 27): exactly the CURRENT category's polygons are live;
              // every OTHER category ever selected earlier in this run
              // has ALL of its ever-constructed polygons torn down. Never
              // zero live polygons for the current category (every
              // fixture has exactly one feature) and never more than one
              // category's polygons live at once.
              Object.entries(allInstancesByCategory).forEach(([category, instances]) => {
                if (category === currentCategory) {
                  expect(livePolygonsFor(instances)).toHaveLength(
                    fixturesByCategory[category].features.length
                  );
                } else {
                  instances.forEach((polygon) => {
                    expect(polygon.setMap).toHaveBeenCalledWith(null);
                  });
                }
              });
            }

            unmount();
            global.fetch = undefined;
            delete window.google;
            document.querySelectorAll(`#${GOOGLE_MAPS_SCRIPT_ID}`).forEach((scriptTag) => scriptTag.remove());
          }
        ),
        { numRuns: 20 }
      );
    },
    60000
  );
});

describe('MapView - LoginPromptBanner placement (Requirement 9.2/9.3)', () => {
  // Regression tests for the banner's position. It used to be rendered by
  // `MapPage` as a sibling AFTER `MapView`, which put it after
  // PlaceVisitStatusLists' two long columns (one entry per place -- hundreds
  // for the 'country' category) and therefore at the very bottom of the
  // page, not "in an area below the Map_View" (Requirement 9.2). MapView now
  // owns the placement: directly after PlaceInfoPanel and BEFORE
  // PlaceVisitStatusLists, and in its loading/error branches too so the
  // prompt is persistent in every map state while unauthenticated.

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
    ],
  };

  function setUpMapsStub() {
    window.google = {
      maps: {
        Map: jest.fn().mockImplementation(function Map(element, options) {
          this.element = element;
          this.options = options;
          this.addListener = jest.fn(() => ({ remove: jest.fn() }));
        }),
        Polygon: jest.fn().mockImplementation(function Polygon(options) {
          this.options = options;
          this.setMap = jest.fn();
          this.setOptions = jest.fn();
        }),
        importLibrary: jest.fn().mockResolvedValue({}),
      },
    };
  }

  async function renderReadyMapView() {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(REGIONS_FIXTURE),
    });
    setUpMapsStub();

    render(<MapView />);

    const scriptTag = getMapScriptTag();
    act(() => {
      scriptTag.onload();
    });

    await waitFor(() => expect(screen.getByTestId('google-map-canvas')).toBeInTheDocument());
  }

  /**
   * True when `earlier` precedes `later` in document order.
   */
  function precedes(earlier, later) {
    return Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  it('renders the banner between the info panel and the visit-status lists in DOM order, for an unauthenticated session in the ready state', async () => {
    await renderReadyMapView();

    const banner = screen.getByTestId('login-prompt-banner');
    const infoPanel = screen.getByTestId('state-info-panel');
    const lists = screen.getByTestId('visited-states-lists');

    expect(banner).toBeInTheDocument();

    // The actual bug: the banner came AFTER the long visit-status lists.
    expect(precedes(banner, lists)).toBe(true);
    expect(precedes(infoPanel, banner)).toBe(true);

    // And it is inside MapView's own wrapper, between those two siblings.
    const mapViewChildren = Array.from(screen.getByTestId('map-view').children);
    expect(mapViewChildren.indexOf(banner)).toBeGreaterThan(mapViewChildren.indexOf(infoPanel));
    expect(mapViewChildren.indexOf(banner)).toBeLessThan(mapViewChildren.indexOf(lists));
  });

  it('renders the banner in the loading state for an unauthenticated session', () => {
    // Never resolves, so the region loader stays 'loading' and the map
    // script's onload never fires on its own in jsdom.
    global.fetch = jest.fn(() => new Promise(() => {}));

    render(<MapView />);

    expect(screen.getByTestId('map-view-loading')).toBeInTheDocument();
    expect(screen.getByTestId('login-prompt-banner')).toBeInTheDocument();
  });

  it('renders the banner in the error state for an unauthenticated session', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    render(<MapView />);

    const scriptTag = getMapScriptTag();
    act(() => {
      scriptTag.onerror();
    });

    await screen.findByTestId('map-view-error');
    expect(screen.getByTestId('login-prompt-banner')).toBeInTheDocument();
  });

  it('renders no banner for an authenticated session (Requirement 9.3)', async () => {
    setSessionTo({ username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 });

    await renderReadyMapView();

    expect(screen.queryByTestId('login-prompt-banner')).toBeNull();
  });

  // Requirement 9.2: MapView owns the banner's placement, so it is also
  // what has to forward AuthGate's navigation callbacks down to it (see
  // MapView.jsx's note). MapView itself does nothing with them.
  describe('banner navigation callbacks are forwarded (Requirement 9.2)', () => {
    async function renderReadyMapViewWithCallbacks(props) {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(REGIONS_FIXTURE),
      });
      setUpMapsStub();

      render(<MapView {...props} />);

      const scriptTag = getMapScriptTag();
      act(() => {
        scriptTag.onload();
      });

      await waitFor(() => expect(screen.getByTestId('google-map-canvas')).toBeInTheDocument());
    }

    it('renders both banner links in the ready state and invokes the callbacks it was given', async () => {
      const onRequestLogin = jest.fn();
      const onRequestSignUp = jest.fn();

      await renderReadyMapViewWithCallbacks({ onRequestLogin, onRequestSignUp });

      fireEvent.click(screen.getByTestId('login-prompt-login-link'));
      expect(onRequestLogin).toHaveBeenCalledTimes(1);
      expect(onRequestSignUp).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('login-prompt-signup-link'));
      expect(onRequestSignUp).toHaveBeenCalledTimes(1);
    });

    it('forwards the callbacks in the loading state too', () => {
      const onRequestLogin = jest.fn();
      const onRequestSignUp = jest.fn();
      // Never resolves, so the region loader stays 'loading'.
      global.fetch = jest.fn(() => new Promise(() => {}));

      render(<MapView onRequestLogin={onRequestLogin} onRequestSignUp={onRequestSignUp} />);

      fireEvent.click(screen.getByTestId('login-prompt-login-link'));
      fireEvent.click(screen.getByTestId('login-prompt-signup-link'));

      expect(onRequestLogin).toHaveBeenCalledTimes(1);
      expect(onRequestSignUp).toHaveBeenCalledTimes(1);
    });

    it('forwards the callbacks in the error state too', async () => {
      const onRequestLogin = jest.fn();
      const onRequestSignUp = jest.fn();
      global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

      render(<MapView onRequestLogin={onRequestLogin} onRequestSignUp={onRequestSignUp} />);

      const scriptTag = getMapScriptTag();
      act(() => {
        scriptTag.onerror();
      });

      await screen.findByTestId('map-view-error');

      fireEvent.click(screen.getByTestId('login-prompt-login-link'));
      fireEvent.click(screen.getByTestId('login-prompt-signup-link'));

      expect(onRequestLogin).toHaveBeenCalledTimes(1);
      expect(onRequestSignUp).toHaveBeenCalledTimes(1);
    });
  });
});
