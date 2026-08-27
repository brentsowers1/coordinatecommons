import fc from 'fast-check';

import geojson from './stateBoundaries.geojson.json';
import { EXPECTED_REGION_COUNT, resolveRegionAtLatLng } from './stateBoundaries';

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

describe('useRegionsLoader', () => {
  const { renderHook, waitFor, act } = require('@testing-library/react');
  const { useRegionsLoader, REGIONS_GEOJSON_ASSET_PATH } = require('./stateBoundaries');

  afterEach(() => {
    global.fetch = undefined;
  });

  it('starts in loading status', () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    const { result } = renderHook(() => useRegionsLoader());
    expect(result.current.status).toBe('loading');
    expect(result.current.regions).toEqual([]);
  });

  it('fetches the GeoJSON asset and reports ready with parsed regions on success', async () => {
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

    const { result } = renderHook(() => useRegionsLoader());

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.regions).toEqual([
      { stateId: 'CA', name: 'California', polygons: [[[-124.4, 32.5], [-114.1, 32.5], [-114.1, 42.0]]] },
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

    const { result } = renderHook(() => useRegionsLoader());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.regions).toEqual([]);

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('reports error status when fetch rejects', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('network down')));

    const { result } = renderHook(() => useRegionsLoader());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.regions).toEqual([]);
  });
});

describe('resolveRegionAtLatLng - Property 7', () => {
  // Builds a single axis-aligned rectangular region (one ring polygon) so
  // containment is exact and easy to reason about both here and in the
  // ray-casting implementation under test.
  function makeRectangleRegion(stateId, latMin, latMax, lngMin, lngMax) {
    return {
      stateId,
      name: stateId,
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
  // band. This guarantees the regions never overlap or touch, so every
  // point is unambiguously inside exactly one region, inside a gap, or
  // outside the whole covered area.
  const REGION_WIDTH = 10;
  const REGION_GAP = 1;
  const LAT_MIN = 0;
  const LAT_MAX = 10;

  function buildNonOverlappingRegions(count) {
    const regions = [];
    for (let i = 0; i < count; i += 1) {
      const lngMin = i * (REGION_WIDTH + REGION_GAP);
      const lngMax = lngMin + REGION_WIDTH;
      regions.push({
        stateId: `region-${i}`,
        bounds: { latMin: LAT_MIN, latMax: LAT_MAX, lngMin, lngMax },
        region: makeRectangleRegion(`region-${i}`, LAT_MIN, LAT_MAX, lngMin, lngMax),
      });
    }
    return regions;
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

  it('returns the containing region\'s stateId for a point strictly inside it, for any number/layout of non-overlapping regions', () => {
    // Feature: state-visit-tracker, Property 7: Region hit-testing resolves clicks to exactly the containing region, or none
    const scenarioArb = regionCountArb
      .chain((count) => {
        const built = buildNonOverlappingRegions(count);
        return fc.tuple(fc.constant(built), fc.constantFrom(...built));
      })
      .chain(([built, target]) =>
        pointStrictlyInside(target.bounds).map((latLng) => ({ built, target, latLng }))
      );

    fc.assert(
      fc.property(scenarioArb, ({ built, target, latLng }) => {
        const regions = built.map((entry) => entry.region);
        expect(resolveRegionAtLatLng(latLng, regions)).toBe(target.stateId);
      }),
      { numRuns: 100 }
    );
  });

  it('returns null for a point strictly inside a deliberate gap between regions or entirely outside the covered area, for any number/layout of non-overlapping regions', () => {
    // Feature: state-visit-tracker, Property 7: Region hit-testing resolves clicks to exactly the containing region, or none
    const farOutsideArb = fc.record({
      lat: fc.double({ min: -1000, max: -100, noNaN: true }),
      lng: fc.double({ min: -1000, max: -100, noNaN: true }),
    });

    const scenarioArb = regionCountArb.chain((count) => {
      const built = buildNonOverlappingRegions(count);

      // A gap point sits strictly between two adjacent regions; a
      // far-outside point sits well beyond the whole grid. Every generated
      // region layout has at least a far-outside option, plus a gap option
      // whenever there are at least two regions.
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
        const regions = built.map((entry) => entry.region);
        expect(resolveRegionAtLatLng(latLng, regions)).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});
