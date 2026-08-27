// Unit tests for MapView's combined loading/error/retry UI (task 12.2),
// covering both the Google Maps script loader (`useGoogleMapsLoader()`)
// and the runtime boundary-fetch loader (`useRegionsLoader()`), with
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

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import { MapView } from './MapView';
import { useGoogleMapsLoader, GOOGLE_MAPS_SCRIPT_ID } from './useGoogleMapsLoader';

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

beforeEach(() => {
  resetGoogleMapsLoaderSingleton();
});

afterEach(() => {
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
    // Never resolves, so useRegionsLoader stays 'loading'. The map script's
    // real onload/onerror never fire on their own in jsdom, so
    // useGoogleMapsLoader also stays 'loading' by default.
    global.fetch = jest.fn(() => new Promise(() => {}));

    render(<MapView />);

    expect(screen.getByRole('status')).toHaveTextContent(/Loading map/i);
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

    expect(screen.getByRole('status')).toHaveTextContent(/Loading map/i);

    const scriptTag = getMapScriptTag();

    act(() => {
      scriptTag.onload();
    });

    // Map script is now 'ready', but the region fetch is still pending --
    // the combined loading indicator must still be shown.
    expect(screen.getByRole('status')).toHaveTextContent(/Loading map/i);
    expect(screen.queryByTestId('google-map-canvas')).toBeNull();

    await act(async () => {
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ type: 'FeatureCollection', features: [] }),
      });
      await pendingFetch;
    });

    await waitFor(() => expect(screen.getByTestId('google-map-canvas')).toBeInTheDocument());
    expect(screen.queryByRole('status')).toBeNull();
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
  // useRegionsLoader()/parseRegionsFromGeoJson expect (Feature.properties.stateId/name,
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
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    // A map was actually constructed, not just that loading UI cleared.
    expect(mapConstructor).toHaveBeenCalledTimes(1);

    // The region overlay was actually constructed with one real Polygon
    // per fetched region, not just that no error occurred.
    await waitFor(() =>
      expect(polygonConstructor).toHaveBeenCalledTimes(REGIONS_FIXTURE.features.length)
    );
  });
});
