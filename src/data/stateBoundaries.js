/**
 * Region boundary data types and constants.
 *
 * Region boundary data itself is NOT bundled into the JS bundle. It lives in
 * a static GeoJSON asset (`stateBoundaries.geojson.json`, alongside this
 * file) that is fetched at runtime via `fetch()` by `useRegionsLoader()`
 * (implemented separately), keeping the large reference data out of the
 * initial page load.
 *
 * The GeoJSON asset is a standard `FeatureCollection` with exactly 51
 * `Feature`s (one per US state plus Washington D.C.). Each `Feature.geometry`
 * is a `Polygon` or `MultiPolygon`, and each `Feature.properties` carries:
 *   - `stateId`: the stable USPS 2-letter code identifying the region
 *     (e.g. "CA"), or "DC" for the District of Columbia.
 *   - `name`: the region's full display name (e.g. "California").
 *
 * `stateId` is the stable identifier used throughout the app (shared-state
 * maps, the Visit_Record_API's `placeId`, hit-testing results, etc.) — see
 * design.md's "StateBoundaryData" section.
 */

import React from 'react';

/**
 * @typedef {Object} Region
 * @property {string} stateId - USPS 2-letter code (e.g. "CA"); "DC" for the
 *   District of Columbia. Stable and unique across all 51 regions.
 * @property {string} name - Full display name (e.g. "California").
 * @property {number[][][]} polygons - One or more linear rings of
 *   [lng, lat] pairs describing the region's boundary. A region with a
 *   single simple boundary has exactly one ring; a region whose real
 *   boundary consists of disjoint parts (not used by this coarse dataset,
 *   but supported by the shape) would have more than one.
 */

/** Total number of regions expected in the boundary dataset (50 states + DC). */
export const EXPECTED_REGION_COUNT = 51;

/**
 * Path (relative to the app's public/static assets) to the boundary
 * GeoJSON asset, fetched at runtime by `useRegionsLoader()` rather than
 * imported into the JS bundle.
 */
export const REGIONS_GEOJSON_ASSET_PATH = '/data/stateBoundaries.geojson.json';

/**
 * Converts a single GeoJSON `Feature` (`Polygon` or `MultiPolygon` geometry)
 * into the flattened list of rings used by `Region.polygons`.
 *
 * - `Polygon` coordinates are already `[ring][point][lng, lat]`, so they are
 *   used directly.
 * - `MultiPolygon` coordinates are `[polygon][ring][point][lng, lat]`; each
 *   polygon's rings are flattened into the same top-level list, since
 *   `Region.polygons` only distinguishes rings, not which polygon they
 *   belong to (consistent with the "disjoint parts" note on the `Region`
 *   typedef above).
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
 * Parses a GeoJSON `FeatureCollection` (as returned by the boundary asset)
 * into `Region[]`.
 *
 * @param {{features: Array<{properties: {stateId: string, name: string}, geometry: any}>}} geojson
 * @returns {import('./stateBoundaries').Region[]}
 */
function parseRegionsFromGeoJson(geojson) {
  if (!geojson || !Array.isArray(geojson.features)) {
    throw new Error('Invalid GeoJSON: missing features array');
  }
  return geojson.features.map((feature) => ({
    stateId: feature.properties.stateId,
    name: feature.properties.name,
    polygons: geometryToPolygons(feature.geometry),
  }));
}

/**
 * Fetches and parses the boundary GeoJSON asset on mount.
 *
 * Exposes `status: 'loading' | 'ready' | 'error'`, `regions` (populated once
 * `status === 'ready'`, empty otherwise), and `retry()`, which re-issues the
 * fetch after a failure.
 *
 * @returns {{status: 'loading' | 'ready' | 'error', regions: import('./stateBoundaries').Region[], retry: () => void}}
 */
export function useRegionsLoader() {
  const [status, setStatus] = React.useState('loading');
  const [regions, setRegions] = React.useState([]);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    setStatus('loading');

    (async () => {
      try {
        const response = await fetch(REGIONS_GEOJSON_ASSET_PATH);
        if (!response.ok) {
          throw new Error(`Failed to fetch region boundaries: ${response.status}`);
        }
        const geojson = await response.json();
        const parsedRegions = parseRegionsFromGeoJson(geojson);
        if (!cancelled) {
          setRegions(parsedRegions);
          setStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setRegions([]);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = React.useCallback(() => {
    setAttempt((previousAttempt) => previousAttempt + 1);
  }, []);

  return { status, regions, retry };
}

/**
 * Extracts plain `{ lat, lng }` numbers from a `latLng` argument that may be
 * either a plain object (as used by tests/fixtures) or a Google Maps
 * `LatLng`-like object, whose `lat`/`lng` are *methods*, not properties
 * (see `google.maps.LatLng#lat`/`#lng` in the Maps JavaScript API). This
 * lets `resolveRegionAtLatLng` be called directly with a real Maps click
 * event's `event.latLng` (task 12.5) as well as with plain test fixtures.
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
 * Tests `latLng` against each region's `polygons` (rings of [lng, lat]
 * pairs) using the standard ray-casting point-in-polygon algorithm, and
 * returns the `stateId` of the first region whose polygon contains the
 * point. Regions are assumed non-overlapping (per Property 7), so at most
 * one region should match for valid input.
 *
 * `latLng` may be a plain `{ lat, lng }` object (e.g. from test fixtures)
 * or a Google Maps `LatLng`-like object exposing `.lat()`/`.lng()` methods
 * (e.g. a real Maps click event's `event.latLng`) — both shapes are
 * supported so this function works unchanged whether it's driven by tests
 * or by real Google Maps event data.
 *
 * @param {{lat: number, lng: number} | {lat: () => number, lng: () => number}} latLng
 * @param {import('./stateBoundaries').Region[]} regions
 * @returns {string | null} the stateId of the containing region, or null.
 */
export function resolveRegionAtLatLng(latLng, regions) {
  const { lat, lng } = toPlainLatLng(latLng);

  for (const region of regions) {
    const containedInAnyRing = region.polygons.some((ring) => isPointInRing(lat, lng, ring));
    if (containedInAnyRing) {
      return region.stateId;
    }
  }

  return null;
}
