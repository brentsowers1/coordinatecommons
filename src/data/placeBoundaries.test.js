import fc from 'fast-check';

import geojson from './stateBoundaries.geojson.json';
import { EXPECTED_REGION_COUNT, resolvePlaceBoundaryAtLatLng } from './placeBoundaries';

const USPS_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

const EXPECTED_STATE_IDS = new Set([...USPS_STATE_CODES, 'DC']);

describe('stateBoundaries.geojson.json', () => {
  const { features } = geojson;

  it('contains exactly EXPECTED_REGION_COUNT (51) features', () => {
    expect(EXPECTED_REGION_COUNT).toBe(51);
    expect(features.length).toBe(EXPECTED_REGION_COUNT);
  });

  it('gives every feature a non-empty stateId', () => {
    features.forEach((feature) => {
      expect(typeof feature.properties.stateId).toBe('string');
      expect(feature.properties.stateId.trim().length).toBeGreaterThan(0);
    });
  });

  it('has no duplicated stateId values', () => {
    const stateIds = features.map((feature) => feature.properties.stateId);
    const uniqueStateIds = new Set(stateIds);
    expect(uniqueStateIds.size).toBe(stateIds.length);
  });

  it('covers exactly the 50 USPS state codes plus DC, with none missing or extra', () => {
    const stateIds = new Set(features.map((feature) => feature.properties.stateId));
    expect(stateIds).toEqual(EXPECTED_STATE_IDS);
  });
});

describe('usePlaceBoundariesLoader', () => {
  const { renderHook, waitFor, act } = require('@testing-library/react');
  const {
    usePlaceBoundariesLoader,
    REGIONS_GEOJSON_ASSET_PATH,
    CANADA_PROVINCE_BOUNDARIES_GEOJSON_ASSET_PATH,
    COUNTRY_BOUNDARIES_GEOJSON_ASSET_PATH,
  } = require('./placeBoundaries');

  afterEach(() => {
    global.fetch = undefined;
  });

  it('starts in loading status', () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    const { result } = renderHook(() => usePlaceBoundariesLoader('canada-state-test-unique-1'));
    expect(result.current.status).toBe('loading');
    expect(result.current.placeBoundaries).toEqual([]);
  });

  it('fetches the GeoJSON asset and reports ready with parsed placeBoundaries on success', async () => {
    global.fetch = jest.fn((url) => {
      expect(url).toBe(REGIONS_GEOJSON_ASSET_PATH);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { stateId: 'CA', name: 'California' },
              geometry: { type: 'Polygon', coordinates: [[[-124.4, 32.5], [-114.1, 32.5], [-114.1, 42.0]]] },
            },
          ],
        }),
      });
    });

    const { result } = renderHook(() => usePlaceBoundariesLoader('us-state-test-unique-1'));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.placeBoundaries).toEqual([
      { placeId: 'CA', name: 'California', polygons: [[[-124.4, 32.5], [-114.1, 32.5], [-114.1, 42.0]]] },
    ]);
  });

  it('reports error status on a non-2xx response and retry() re-fetches', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ type: 'FeatureCollection', features: [] }),
      });

    const { result } = renderHook(() => usePlaceBoundariesLoader('us-state-test-unique-2'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.placeBoundaries).toEqual([]);

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('reports error status when fetch rejects', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('network down')));

    const { result } = renderHook(() => usePlaceBoundariesLoader('us-state-test-unique-3'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.placeBoundaries).toEqual([]);
  });

  it('reuses the cached result for an already-successfully-loaded category instead of re-fetching (Requirement 14.5)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { stateId: 'NY', name: 'New York' },
            geometry: { type: 'Polygon', coordinates: [[[-79.8, 40.5], [-71.9, 40.5], [-71.9, 45.0]]] },
          },
        ],
      }),
    });

    const category = 'us-state-test-unique-cache';

    const first = renderHook(() => usePlaceBoundariesLoader(category));
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Unmount and mount again for the same category: should reuse the
    // cached result rather than issuing a second fetch.
    first.unmount();

    const second = renderHook(() => usePlaceBoundariesLoader(category));
    expect(second.result.current.status).toBe('ready');
    expect(second.result.current.placeBoundaries).toEqual([
      { placeId: 'NY', name: 'New York', polygons: [[[-79.8, 40.5], [-71.9, 40.5], [-71.9, 45.0]]] },
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  describe('per-category asset routing (Requirement 14.5)', () => {
    function mockFetchResolvingEmptyFeatureCollection() {
      return jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ type: 'FeatureCollection', features: [] }),
      });
    }

    it("routes 'us-state' to REGIONS_GEOJSON_ASSET_PATH", async () => {
      global.fetch = mockFetchResolvingEmptyFeatureCollection();

      const { result } = renderHook(() => usePlaceBoundariesLoader('us-state'));
      await waitFor(() => expect(result.current.status).toBe('ready'));

      expect(global.fetch).toHaveBeenCalledWith(REGIONS_GEOJSON_ASSET_PATH);
    });

    it("routes 'canada-state' to CANADA_PROVINCE_BOUNDARIES_GEOJSON_ASSET_PATH", async () => {
      global.fetch = mockFetchResolvingEmptyFeatureCollection();

      const { result } = renderHook(() => usePlaceBoundariesLoader('canada-state'));
      await waitFor(() => expect(result.current.status).toBe('ready'));

      expect(global.fetch).toHaveBeenCalledWith(CANADA_PROVINCE_BOUNDARIES_GEOJSON_ASSET_PATH);
    });

    it("routes 'country' to COUNTRY_BOUNDARIES_GEOJSON_ASSET_PATH", async () => {
      global.fetch = mockFetchResolvingEmptyFeatureCollection();

      const { result } = renderHook(() => usePlaceBoundariesLoader('country'));
      await waitFor(() => expect(result.current.status).toBe('ready'));

      expect(global.fetch).toHaveBeenCalledWith(COUNTRY_BOUNDARIES_GEOJSON_ASSET_PATH);
    });

    it("reuses the cached result for 'canada-state' instead of re-fetching when re-mounted after already being ready this session", async () => {
      // The module-level cache persists across tests within this file, and
      // 'canada-state' may already be cached (as a successful, ready
      // result) from the routing test above. Evict it first via a failed
      // retry() -- a failed load is never cached (see
      // `boundaryCacheByCategory`'s doc comment) -- so this test's first
      // mount below is a genuine fetch, matching the scenario described in
      // the task (mount, wait for ready, unmount, mount again -> fetch only
      // once).
      const preexisting = renderHook(() => usePlaceBoundariesLoader('canada-state'));
      await waitFor(() =>
        expect(['ready', 'error']).toContain(preexisting.result.current.status)
      );
      global.fetch = jest.fn().mockRejectedValue(new Error('evicting stale cache for test isolation'));
      act(() => {
        preexisting.result.current.retry();
      });
      await waitFor(() => expect(preexisting.result.current.status).toBe('error'));
      preexisting.unmount();

      global.fetch = mockFetchResolvingEmptyFeatureCollection();

      const first = renderHook(() => usePlaceBoundariesLoader('canada-state'));
      await waitFor(() => expect(first.result.current.status).toBe('ready'));
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(CANADA_PROVINCE_BOUNDARIES_GEOJSON_ASSET_PATH);

      first.unmount();

      const second = renderHook(() => usePlaceBoundariesLoader('canada-state'));
      expect(second.result.current.status).toBe('ready');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Property 28: switching to an already-loaded category never issues a new request', () => {
    // Feature: state-visit-tracker, Property 28: Switching to an already-loaded category never issues a new request for its data
    it('calls fetch exactly once for a category no matter how many additional times it is mounted after its first successful load', async () => {
      // Each property run must use a category that has never been used by
      // any other run (within this test, or elsewhere in this file) since
      // the underlying cache is a module-level singleton shared across the
      // whole file's lifetime. A plain `fc.string()` arbitrary can (and,
      // via shrinking, sometimes will) generate the same value more than
      // once, which would make a later run's "first mount" observe a
      // cache entry left behind by an earlier run instead of genuinely
      // fetching for the first time. Suffixing with a monotonically
      // increasing counter guarantees uniqueness across every run of this
      // property, regardless of what fast-check generates or shrinks to.
      let runCounter = 0;
      const categoryArb = fc.string({ minLength: 5, maxLength: 20 }).map((s) => {
        runCounter += 1;
        return `prop28-${runCounter}-${s}`;
      });
      const extraMountCyclesArb = fc.integer({ min: 0, max: 5 });

      await fc.assert(
        fc.asyncProperty(categoryArb, extraMountCyclesArb, async (category, extraMountCycles) => {
          global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { stateId: 'ZZ', name: 'Placeholder' },
                  geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] },
                },
              ],
            }),
          });

          // First mount: the genuine load for this (fresh, per-run-unique)
          // category.
          const first = renderHook(() => usePlaceBoundariesLoader(category));
          await waitFor(() => expect(first.result.current.status).toBe('ready'));
          first.unmount();

          // Any number of additional mount/unmount cycles for the same
          // category, none of which call retry(), must all reuse the
          // cache instead of re-fetching.
          for (let i = 0; i < extraMountCycles; i += 1) {
            const rendered = renderHook(() => usePlaceBoundariesLoader(category));
            expect(rendered.result.current.status).toBe('ready');
            rendered.unmount();
          }

          expect(global.fetch).toHaveBeenCalledTimes(1);
        }),
        { numRuns: 100 }
      );
    }, 30000);
  });

  describe('Stale Request Discard on category switch (Requirement 14.7, task 26.2)', () => {
    it("discards a stale category's late-resolving result when the same instance switches placeCategory before it settles", async () => {
      const staleCategory = 'us-state-test-stale-switch-old';
      const newCategory = 'us-state-test-stale-switch-new';

      let resolveStaleFetch;
      global.fetch = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveStaleFetch = resolve;
          })
      );

      const { result, rerender } = renderHook(
        ({ placeCategory }) => usePlaceBoundariesLoader(placeCategory),
        { initialProps: { placeCategory: staleCategory } }
      );

      expect(result.current.status).toBe('loading');
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Switch categories on the SAME hook instance before the stale
      // request resolves. React runs the old effect's cleanup (setting
      // its cancelled flag) before mounting the new effect for
      // newCategory.
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { stateId: 'NEWCAT', name: 'New Category Place' },
                geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] },
              },
            ],
          }),
      });

      rerender({ placeCategory: newCategory });

      expect(result.current.status).toBe('loading');

      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(result.current.placeBoundaries).toEqual([
        { placeId: 'NEWCAT', name: 'New Category Place', polygons: [[[0, 0], [1, 0], [1, 1]]] },
      ]);

      // Now resolve the stale (old category's) request late.
      await act(async () => {
        resolveStaleFetch({
          ok: true,
          json: () =>
            Promise.resolve({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { stateId: 'STALE', name: 'Stale Place' },
                  geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] },
                },
              ],
            }),
        });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // The current instance must still reflect newCategory's data, not
      // the stale result.
      expect(result.current.status).toBe('ready');
      expect(result.current.placeBoundaries).toEqual([
        { placeId: 'NEWCAT', name: 'New Category Place', polygons: [[[0, 0], [1, 0], [1, 1]]] },
      ]);

      // The stale category must not have been written to the module-level
      // cache: a fresh mount for staleCategory must re-fetch from scratch
      // rather than immediately reporting the discarded 'STALE' result.
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { stateId: 'FRESH', name: 'Fresh Place' },
                geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] },
              },
            ],
          }),
      });

      const freshMountForStaleCategory = renderHook(() => usePlaceBoundariesLoader(staleCategory));
      expect(freshMountForStaleCategory.result.current.status).toBe('loading');
      await waitFor(() => expect(freshMountForStaleCategory.result.current.status).toBe('ready'));
      expect(freshMountForStaleCategory.result.current.placeBoundaries).toEqual([
        { placeId: 'FRESH', name: 'Fresh Place', polygons: [[[0, 0], [1, 0], [1, 1]]] },
      ]);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      freshMountForStaleCategory.unmount();
    });
  });

  describe('Property 30: stale in-flight results are always discarded', () => {
    // Feature: state-visit-tracker, Property 30: A stale in-flight request's result is always discarded without mutating the store
    //
    // Generalizes the "Stale Request Discard on category switch" fixed
    // example test above (one hardcoded stale/new category pair, one
    // hardcoded pair of placeId/name results) into an arbitrary property:
    // for ANY two distinct categories and ANY returned boundary data, a
    // request that goes stale because the same hook instance switches away
    // from its category before the request settles must never be
    // reflected in that instance's later state, and must never populate
    // the module-level cache for the stale category -- regardless of
    // whether the late-arriving stale result is a success or a rejection
    // (Requirement 14.7's "resolves (success or failure)" wording).
    afterEach(() => {
      global.fetch = undefined;
    });

    // A monotonically increasing counter suffix guarantees every property
    // run uses a category never seen before by the module-level
    // boundaryCacheByCategory cache, which otherwise persists across
    // property runs and across the whole test file (same technique as
    // the "Property 28" test above).
    let runCounter = 0;
    function uniqueCategoryArb(label) {
      return fc.string({ minLength: 3, maxLength: 12 }).map((s) => {
        runCounter += 1;
        return `prop30-${label}-${runCounter}-${s}`;
      });
    }

    // Arbitrary minimal valid single-feature FeatureCollections: one
    // rectangular polygon feature with an arbitrary placeId/name pair.
    const featureCollectionArb = fc.record({
      placeId: fc.string({ minLength: 1, maxLength: 10 }),
      name: fc.string({ minLength: 1, maxLength: 20 }),
    }).map(({ placeId, name }) => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { stateId: placeId, name },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] },
        },
      ],
    }));

    function expectedPlaceBoundariesFor(featureCollection) {
      const { properties, geometry } = featureCollection.features[0];
      return [{ placeId: properties.stateId, name: properties.name, polygons: [geometry.coordinates[0]] }];
    }

    const propertyArb = fc.record({
      staleCategory: uniqueCategoryArb('stale'),
      newCategory: uniqueCategoryArb('new'),
      newFeatureCollection: featureCollectionArb,
      staleFeatureCollection: featureCollectionArb,
      staleOutcomeIsSuccess: fc.boolean(),
      freshFeatureCollectionAfterDiscard: featureCollectionArb,
    });

    it(
      "a stale category's late-arriving result (success or failure) never mutates a switched-away instance's state, and never populates that category's cache",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            propertyArb,
            async ({
              staleCategory,
              newCategory,
              newFeatureCollection,
              staleFeatureCollection,
              staleOutcomeIsSuccess,
              freshFeatureCollectionAfterDiscard,
            }) => {
              let settleStaleFetch;
              global.fetch = jest.fn().mockImplementation(
                () =>
                  new Promise((resolve, reject) => {
                    settleStaleFetch = { resolve, reject };
                  })
              );

              const { result, rerender, unmount } = renderHook(
                ({ placeCategory }) => usePlaceBoundariesLoader(placeCategory),
                { initialProps: { placeCategory: staleCategory } }
              );

              // The request for staleCategory is in flight.
              expect(result.current.status).toBe('loading');

              // Switch the SAME hook instance away from staleCategory
              // before its request settles, and let newCategory's own
              // request succeed.
              global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(newFeatureCollection),
              });

              rerender({ placeCategory: newCategory });

              await waitFor(() => expect(result.current.status).toBe('ready'));
              const expectedNewPlaceBoundaries = expectedPlaceBoundariesFor(newFeatureCollection);
              expect(result.current.placeBoundaries).toEqual(expectedNewPlaceBoundaries);

              // Now let the stale, original staleCategory request settle
              // late -- either as a success or as a rejection, per this
              // run's generated outcome.
              await act(async () => {
                if (staleOutcomeIsSuccess) {
                  settleStaleFetch.resolve({
                    ok: true,
                    json: () => Promise.resolve(staleFeatureCollection),
                  });
                } else {
                  settleStaleFetch.reject(new Error('stale request failed late'));
                }
                await Promise.resolve();
                await Promise.resolve();
                await Promise.resolve();
              });

              // (a) The instance's current rendered state still reflects
              // newCategory's data, completely unaffected by the stale
              // resolution, whether it was a late success or a late
              // failure.
              expect(result.current.status).toBe('ready');
              expect(result.current.placeBoundaries).toEqual(expectedNewPlaceBoundaries);

              // (b) A FRESH instance for staleCategory afterward must
              // trigger a genuine new fetch (proving no cache entry was
              // created for the discarded stale result -- true whether the
              // stale result was a success or a failure, since only
              // successful loads are ever cached), and that fresh fetch's
              // own (different, arbitrary) result -- not the discarded one
              // -- is what gets reported.
              global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(freshFeatureCollectionAfterDiscard),
              });

              const freshMount = renderHook(() => usePlaceBoundariesLoader(staleCategory));
              expect(freshMount.result.current.status).toBe('loading');
              expect(global.fetch).toHaveBeenCalledTimes(1);

              await waitFor(() => expect(freshMount.result.current.status).toBe('ready'));
              expect(freshMount.result.current.placeBoundaries).toEqual(
                expectedPlaceBoundariesFor(freshFeatureCollectionAfterDiscard)
              );

              freshMount.unmount();
              unmount();
            }
          ),
          { numRuns: 50 }
        );
      },
      30000
    );
  });
});

describe('usePlaceBoundariesLoader - per-category loading/error/retry independence (Requirements 14.2, 14.3, task 26.6)', () => {
  const { renderHook, waitFor, act } = require('@testing-library/react');
  const { usePlaceBoundariesLoader } = require('./placeBoundaries');

  // These tests exercise TWO independent usePlaceBoundariesLoader
  // instances mounted at once for two DIFFERENT categories -- simulating
  // what MapView will do once task 29 wires the real
  // useSelectedPlaceCategory() through (MapView.jsx currently hardcodes
  // 'us-state' for this loader; see that file's task 21.2 comment). This
  // proves the underlying per-category status/retry state that will drive
  // the loading/error/retry UI is already correctly isolated per category,
  // independent of when the MapView-level wiring lands. Existing tests in
  // this file (e.g. the cache-reuse and Stale-Request-Discard tests above)
  // use distinct category names across DIFFERENT tests, but never assert
  // that two categories' loaders are independent of EACH OTHER within the
  // same test -- that's the gap this describe block fills.
  afterEach(() => {
    global.fetch = undefined;
  });

  it('keeps one category loading while a different category is still loading too, independently of each other (Requirement 14.2)', () => {
    global.fetch = jest.fn(() => new Promise(() => {}));

    const categoryA = 'us-state-test-independence-loading-a';
    const categoryB = 'canada-state-test-independence-loading-b';

    const loaderA = renderHook(() => usePlaceBoundariesLoader(categoryA));
    const loaderB = renderHook(() => usePlaceBoundariesLoader(categoryB));

    expect(loaderA.result.current.status).toBe('loading');
    expect(loaderB.result.current.status).toBe('loading');

    loaderA.unmount();
    loaderB.unmount();
  });

  it("does not let one category's failure affect a different category's ready status, and each retry() only re-fetches its own category (Requirement 14.3)", async () => {
    const categoryA = 'us-state-test-independence-error-a';
    const categoryB = 'canada-state-test-independence-error-b';

    // Both categories resolve to the same 'us-state' asset path here since
    // neither literal test category string matches the real routing
    // switch's 'canada-state'/'country' cases (resolveAssetPathForCategory
    // falls through to the 'us-state' default) -- irrelevant to what this
    // test actually verifies, which is per-category status/retry
    // independence, not asset routing (already covered separately by the
    // "per-category asset routing" describe block above). categoryA's
    // fetch (called first, on mount order) fails; categoryB's fetch
    // (called second) succeeds.
    let callCount = 0;
    global.fetch = jest.fn(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.reject(new Error('network down for categoryA'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ type: 'FeatureCollection', features: [] }),
      });
    });

    const loaderA = renderHook(() => usePlaceBoundariesLoader(categoryA));
    const loaderB = renderHook(() => usePlaceBoundariesLoader(categoryB));

    await waitFor(() => expect(loaderA.result.current.status).toBe('error'));
    await waitFor(() => expect(loaderB.result.current.status).toBe('ready'));

    // categoryB remains 'ready' -- categoryA's error never touched it.
    expect(loaderB.result.current.status).toBe('ready');

    const fetchCallsBeforeRetry = global.fetch.mock.calls.length;
    expect(fetchCallsBeforeRetry).toBe(2);

    act(() => {
      loaderA.result.current.retry();
    });

    await waitFor(() => expect(loaderA.result.current.status).toBe('ready'));

    // Retrying categoryA must not have re-fetched or altered categoryB,
    // which never called retry(): exactly one additional fetch call (for
    // categoryA's retry), and categoryB's status/data untouched.
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(loaderB.result.current.status).toBe('ready');
    expect(loaderB.result.current.placeBoundaries).toEqual([]);

    loaderA.unmount();
    loaderB.unmount();
  });
});

describe('resolvePlaceBoundaryAtLatLng - Property 7', () => {
  // Builds a single axis-aligned rectangular place boundary (one ring
  // polygon) so containment is exact and easy to reason about both here
  // and in the ray-casting implementation under test.
  function makeRectanglePlaceBoundary(placeId, latMin, latMax, lngMin, lngMax) {
    return {
      placeId,
      name: placeId,
      polygons: [
        [
          [lngMin, latMin],
          [lngMax, latMin],
          [lngMax, latMax],
          [lngMin, latMax],
          [lngMin, latMin],
        ],
      ],
    };
  }

  // Lays out `count` rectangles side-by-side along longitude, each 10
  // degrees wide with a 1-degree gap in between, sharing the same latitude
  // band. This guarantees the place boundaries never overlap or touch, so
  // every point is unambiguously inside exactly one place boundary, inside
  // a gap, or outside the whole covered area.
  const REGION_WIDTH = 10;
  const REGION_GAP = 1;
  const LAT_MIN = 0;
  const LAT_MAX = 10;

  function buildNonOverlappingPlaceBoundaries(count) {
    const placeBoundaries = [];
    for (let i = 0; i < count; i += 1) {
      const lngMin = i * (REGION_WIDTH + REGION_GAP);
      const lngMax = lngMin + REGION_WIDTH;
      placeBoundaries.push({
        placeId: `region-${i}`,
        bounds: { latMin: LAT_MIN, latMax: LAT_MAX, lngMin, lngMax },
        placeBoundary: makeRectanglePlaceBoundary(`region-${i}`, LAT_MIN, LAT_MAX, lngMin, lngMax),
      });
    }
    return placeBoundaries;
  }

  const regionCountArb = fc.integer({ min: 2, max: 6 });

  // A point strictly inside a given rectangle's bounds (never on an edge,
  // to avoid ray-casting boundary ambiguity).
  function pointStrictlyInside(bounds) {
    return fc.record({
      lat: fc.double({ min: bounds.latMin, max: bounds.latMax, minExcluded: true, maxExcluded: true, noNaN: true }),
      lng: fc.double({ min: bounds.lngMin, max: bounds.lngMax, minExcluded: true, maxExcluded: true, noNaN: true }),
    });
  }

  it('returns the containing place boundary\'s placeId for a point strictly inside it, for any number/layout of non-overlapping place boundaries', () => {
    // Feature: state-visit-tracker, Property 7: Region hit-testing resolves clicks to exactly the containing region, or none
    const scenarioArb = regionCountArb
      .chain((count) => {
        const built = buildNonOverlappingPlaceBoundaries(count);
        return fc.tuple(fc.constant(built), fc.constantFrom(...built));
      })
      .chain(([built, target]) =>
        pointStrictlyInside(target.bounds).map((latLng) => ({ built, target, latLng }))
      );

    fc.assert(
      fc.property(scenarioArb, ({ built, target, latLng }) => {
        const placeBoundaries = built.map((entry) => entry.placeBoundary);
        expect(resolvePlaceBoundaryAtLatLng(latLng, placeBoundaries)).toBe(target.placeId);
      }),
      { numRuns: 100 }
    );
  });

  it('returns null for a point strictly inside a deliberate gap between place boundaries or entirely outside the covered area, for any number/layout of non-overlapping place boundaries', () => {
    // Feature: state-visit-tracker, Property 7: Region hit-testing resolves clicks to exactly the containing region, or none
    const farOutsideArb = fc.record({
      lat: fc.double({ min: -1000, max: -100, noNaN: true }),
      lng: fc.double({ min: -1000, max: -100, noNaN: true }),
    });

    const scenarioArb = regionCountArb.chain((count) => {
      const built = buildNonOverlappingPlaceBoundaries(count);

      // A gap point sits strictly between two adjacent place boundaries; a
      // far-outside point sits well beyond the whole grid. Every generated
      // layout has at least a far-outside option, plus a gap option
      // whenever there are at least two place boundaries.
      const gapPointArbs = [];
      for (let i = 0; i < count - 1; i += 1) {
        const gapLngMin = i * (REGION_WIDTH + REGION_GAP) + REGION_WIDTH;
        const gapLngMax = gapLngMin + REGION_GAP;
        gapPointArbs.push(
          fc.record({
            lat: fc.double({ min: LAT_MIN, max: LAT_MAX, minExcluded: true, maxExcluded: true, noNaN: true }),
            lng: fc.double({ min: gapLngMin, max: gapLngMax, minExcluded: true, maxExcluded: true, noNaN: true }),
          })
        );
      }

      const pointArb = fc.oneof(farOutsideArb, ...gapPointArbs);

      return fc.tuple(fc.constant(built), pointArb);
    });

    fc.assert(
      fc.property(scenarioArb, ([built, latLng]) => {
        const placeBoundaries = built.map((entry) => entry.placeBoundary);
        expect(resolvePlaceBoundaryAtLatLng(latLng, placeBoundaries)).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});
