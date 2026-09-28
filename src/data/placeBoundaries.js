/**
 * Place boundary data types, constants, and loader.
 *
 * Place boundary data itself is NOT bundled into the JS bundle. It lives in
 * a static GeoJSON asset per Place_Category (e.g. `stateBoundaries.geojson.json`,
 * alongside this file, for the `'us-state'` category) that is fetched at
 * runtime via `fetch()` by `usePlaceBoundariesLoader(placeCategory)`, keeping
 * the large reference data out of the initial page load.
 *
 * The `'us-state'` GeoJSON asset is a standard `FeatureCollection` with
 * exactly 51 `Feature`s (one per US state plus Washington D.C.). Each
 * `Feature.geometry` is a `Polygon` or `MultiPolygon`, and each
 * `Feature.properties` carries:
 *   - `stateId`: the stable USPS 2-letter code identifying the region
 *     (e.g. "CA"), or "DC" for the District of Columbia. This becomes
 *     `PlaceBoundary.placeId` once parsed.
 *   - `name`: the region's full display name (e.g. "California").
 *
 * `placeId` is the stable identifier used throughout the app (shared-state
 * maps, the Visit_Record_API's `placeId`, hit-testing results, etc.) — see
 * design.md's "PlaceBoundaryData" section.
 */

import React from 'react';

/**
 * @typedef {Object} PlaceBoundary
 * @property {string} placeId - Stable identifier for this boundary within
 *   its Place_Category. For `'us-state'`, the USPS 2-letter code (e.g.
 *   "CA"); "DC" for the District of Columbia. Unique across all boundaries
 *   in the same category.
 * @property {string} name - Full display name (e.g. "California").
 * @property {number[][][]} polygons - One or more linear rings of
 *   [lng, lat] pairs describing the boundary. A boundary with a single
 *   simple shape has exactly one ring; a boundary whose real shape
 *   consists of disjoint parts (not used by the coarse `'us-state'`
 *   dataset, but supported by the shape) would have more than one.
 */

/**
 * Total number of boundaries expected in the `'us-state'` category's
 * dataset (50 states + DC). This constant is specific to the `'us-state'`
 * category; the `'canada-state'`/`'country'` categories (task 23) have
 * their own expected counts, not represented here.
 */
export const EXPECTED_REGION_COUNT = 51;

/**
 * Path (relative to the app's public/static assets) to the `'us-state'`
 * category's boundary GeoJSON asset, fetched at runtime by
 * `usePlaceBoundariesLoader('us-state')` rather than imported into the JS
 * bundle.
 */
export const REGIONS_GEOJSON_ASSET_PATH = '/data/stateBoundaries.geojson.json';

/**
 * Path (relative to the app's public/static assets) to the `'canada-state'`
 * category's boundary GeoJSON asset, fetched at runtime by
 * `usePlaceBoundariesLoader('canada-state')` rather than imported into the
 * JS bundle.
 */
export const CANADA_PROVINCE_BOUNDARIES_GEOJSON_ASSET_PATH = '/data/canadaProvinceBoundaries.geojson.json';

/**
 * Path (relative to the app's public/static assets) to the `'country'`
 * category's boundary GeoJSON asset, fetched at runtime by
 * `usePlaceBoundariesLoader('country')` rather than imported into the JS
 * bundle.
 */
export const COUNTRY_BOUNDARIES_GEOJSON_ASSET_PATH = '/data/countryBoundaries.geojson.json';

// PLACEHOLDER DATA (task 23.1, routed for real by task 23.2):
// `src/data/canadaProvinceBoundaries.geojson.json` and
// `src/data/countryBoundaries.geojson.json` are still placeholder/stub
// assets while a real data source for the `'canada-state'` and `'country'`
// categories remains an open follow-up item (see design.md's "Boundary
// data source (open item)" note). Each file has a small handful of
// Features with real, recognizable `name`/`stateId` values (Canadian
// province codes and ISO country codes, respectively), but their
// `geometry` polygons are simple placeholder rectangles, NOT real
// geographic boundaries. Do not treat either file as production-ready
// data. Routing below is real: each placeCategory now fetches its own
// asset.
/**
 * Resolves the GeoJSON asset path to fetch for a given `placeCategory`.
 *
 * @param {'us-state' | 'canada-state' | 'country'} placeCategory
 * @returns {string}
 */
function resolveAssetPathForCategory(placeCategory) {
  switch (placeCategory) {
    case 'canada-state':
      return CANADA_PROVINCE_BOUNDARIES_GEOJSON_ASSET_PATH;
    case 'country':
      return COUNTRY_BOUNDARIES_GEOJSON_ASSET_PATH;
    case 'us-state':
    default:
      return REGIONS_GEOJSON_ASSET_PATH;
  }
}

/**
 * Converts a single GeoJSON `Feature` (`Polygon` or `MultiPolygon` geometry)
 * into the flattened list of rings used by `PlaceBoundary.polygons`.
 *
 * - `Polygon` coordinates are already `[ring][point][lng, lat]`, so they are
 *   used directly.
 * - `MultiPolygon` coordinates are `[polygon][ring][point][lng, lat]`; each
 *   polygon's rings are flattened into the same top-level list, since
 *   `PlaceBoundary.polygons` only distinguishes rings, not which polygon
 *   they belong to (consistent with the "disjoint parts" note on the
 *   `PlaceBoundary` typedef above).
 *
 * @param {{type: string, coordinates: any}} geometry
 * @returns {number[][][]}
 */
function geometryToPolygons(geometry) {
  if (!geometry) {
    return [];
  }
  if (geometry.type === 'Polygon') {
    return geometry.coordinates;
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flat();
  }
  return [];
}

/**
 * Parses a GeoJSON `FeatureCollection` (as returned by a boundary asset)
 * into `PlaceBoundary[]`.
 *
 * @param {{features: Array<{properties: {stateId: string, name: string}, geometry: any}>}} geojson
 * @returns {import('./placeBoundaries').PlaceBoundary[]}
 */
function parseRegionsFromGeoJson(geojson) {
  if (!geojson || !Array.isArray(geojson.features)) {
    throw new Error('Invalid GeoJSON: missing features array');
  }
  return geojson.features.map((feature) => ({
    placeId: feature.properties.stateId,
    name: feature.properties.name,
    polygons: geometryToPolygons(feature.geometry),
  }));
}

/**
 * Module-level cache of already-loaded/in-flight-loaded results, keyed by
 * `placeCategory`. Persists across component mounts/unmounts within the
 * same page session (it is NOT component state), so that mounting
 * `usePlaceBoundariesLoader(placeCategory)` a second time for a category
 * that already successfully loaded reuses the cached `placeBoundaries`
 * instead of re-fetching (Requirement 14.5).
 *
 * Each entry is `{ status: 'ready', placeBoundaries: PlaceBoundary[] }` --
 * only successful loads are cached. A category that errored is not cached,
 * so a fresh mount (or `retry()`) re-attempts the fetch.
 *
 * @type {Map<string, { status: 'ready', placeBoundaries: import('./placeBoundaries').PlaceBoundary[] }>}
 */
const boundaryCacheByCategory = new Map();

/**
 * Fetches and parses the boundary GeoJSON asset for `placeCategory` on
 * mount, or reuses an already-successfully-loaded result for that category
 * from `boundaryCacheByCategory` instead of re-fetching (Requirement 14.5).
 *
 * Exposes `status: 'loading' | 'ready' | 'error'`, `placeBoundaries`
 * (populated once `status === 'ready'`, empty otherwise), and `retry()`,
 * which re-issues the fetch after a failure.
 *
 * @param {'us-state' | 'canada-state' | 'country'} placeCategory
 * @returns {{status: 'loading' | 'ready' | 'error', placeBoundaries: import('./placeBoundaries').PlaceBoundary[], retry: () => void}}
 */
export function usePlaceBoundariesLoader(placeCategory) {
  const cached = boundaryCacheByCategory.get(placeCategory);

  const [status, setStatus] = React.useState(cached ? 'ready' : 'loading');
  const [placeBoundaries, setPlaceBoundaries] = React.useState(
    cached ? cached.placeBoundaries : []
  );
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    // Reuse the cached result for this category rather than re-fetching.
    const alreadyCached = boundaryCacheByCategory.get(placeCategory);
    if (alreadyCached) {
      setPlaceBoundaries(alreadyCached.placeBoundaries);
      setStatus('ready');
      return undefined;
    }

    let cancelled = false;

    setStatus('loading');

    (async () => {
      try {
        const response = await fetch(resolveAssetPathForCategory(placeCategory));
        if (!response.ok) {
          throw new Error(`Failed to fetch place boundaries: ${response.status}`);
        }
        const geojson = await response.json();
        const parsedPlaceBoundaries = parseRegionsFromGeoJson(geojson);
        if (!cancelled) {
          boundaryCacheByCategory.set(placeCategory, {
            status: 'ready',
            placeBoundaries: parsedPlaceBoundaries,
          });
          setPlaceBoundaries(parsedPlaceBoundaries);
          setStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setPlaceBoundaries([]);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeCategory, attempt]);

  const retry = React.useCallback(() => {
    // Discard any cached result for this category too, so retry() always
    // re-fetches from scratch rather than immediately re-reporting the
    // same cached data (matches useGoogleMapsLoader's retry() contract,
    // and is also the mechanism tests use to reset this module's
    // otherwise-persistent-across-tests cache between runs).
    boundaryCacheByCategory.delete(placeCategory);
    setAttempt((previousAttempt) => previousAttempt + 1);
  }, [placeCategory]);

  return { status, placeBoundaries, retry };
}

/**
 * Extracts plain `{ lat, lng }` numbers from a `latLng` argument that may be
 * either a plain object (as used by tests/fixtures) or a Google Maps
 * `LatLng`-like object, whose `lat`/`lng` are *methods*, not properties
 * (see `google.maps.LatLng#lat`/`#lng` in the Maps JavaScript API). This
 * lets `resolvePlaceBoundaryAtLatLng` be called directly with a real Maps
 * click event's `event.latLng` (task 12.5) as well as with plain test
 * fixtures.
 *
 * @param {{lat: number, lng: number} | {lat: () => number, lng: () => number}} latLng
 * @returns {{lat: number, lng: number}}
 */
function toPlainLatLng(latLng) {
  const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
  const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
  return { lat, lng };
}

/**
 * Standard ray-casting (even-odd rule) point-in-polygon test for a single
 * ring of `[lng, lat]] pairs.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number[][]} ring - array of [lng, lat] pairs
 * @returns {boolean}
 */
function isPointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lngI, latI] = ring[i];
    const [lngJ, latJ] = ring[j];

    const intersects =
      latI !== latJ &&
      ((lat >= latI && lat < latJ) || (lat >= latJ && lat < latI)) &&
      lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;

    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Pure function used for click hit-testing and (indirectly) hover.
 *
 * Tests `latLng` against each place boundary's `polygons` (rings of
 * [lng, lat] pairs) using the standard ray-casting point-in-polygon
 * algorithm, and returns the `placeId` of the first place boundary whose
 * polygon contains the point. Place boundaries are assumed non-overlapping
 * (per Property 7), so at most one should match for valid input.
 *
 * `latLng` may be a plain `{ lat, lng }` object (e.g. from test fixtures)
 * or a Google Maps `LatLng`-like object exposing `.lat()`/`.lng()` methods
 * (e.g. a real Maps click event's `event.latLng`) — both shapes are
 * supported so this function works unchanged whether it's driven by tests
 * or by real Google Maps event data.
 *
 * @param {{lat: number, lng: number} | {lat: () => number, lng: () => number}} latLng
 * @param {import('./placeBoundaries').PlaceBoundary[]} placeBoundaries
 * @returns {string | null} the placeId of the containing place boundary, or null.
 */
export function resolvePlaceBoundaryAtLatLng(latLng, placeBoundaries) {
  const { lat, lng } = toPlainLatLng(latLng);

  for (const placeBoundary of placeBoundaries) {
    const containedInAnyRing = placeBoundary.polygons.some((ring) => isPointInRing(lat, lng, ring));
    if (containedInAnyRing) {
      return placeBoundary.placeId;
    }
  }

  return null;
}
