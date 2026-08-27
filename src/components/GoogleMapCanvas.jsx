// Creates the actual `google.maps.Map` instance (design.md: "MapView /
// StateBoundaryOverlay").
//
// Scope note (task 12.2): this component owns ONLY the DOM element the map
// is mounted into and the `google.maps.Map` construction itself. It does
// not know about `useGoogleMapsLoader()`/`useRegionsLoader()` -- `MapView`
// is responsible for only rendering `GoogleMapCanvas` once both report
// `ready` (Requirements 3.3, 3.4), so by the time this component mounts,
// `window.google.maps` is expected to already be available. The
// `window.google?.maps` guard below exists so this component degrades
// gracefully (renders its container, does nothing else) in environments
// where the Maps API isn't present, e.g. jsdom-based tests that don't stub
// it -- it isn't meant to substitute for MapView's own ready-gating.
//
// The created map instance is handed back to the parent via `onMapReady`
// rather than a forwarded ref, since `StateBoundaryOverlay` (task 12.5)
// needs the instance itself (to add polygons/listeners to it), not a ref to
// this component.

import React from 'react';

// Fixed initial viewport (Requirement 3.1). Centered roughly on the
// continental US ({ lat: 44, lng: -100 }, near the Minnesota/South Dakota
// border) at a low enough zoom level (3) that Alaska (far northwest) and
// Hawaii (far southwest/mid-Pacific) both fall within the initial viewport
// alongside the other 48 states and Washington D.C., without requiring the
// user to pan or zoom. A fixed center/zoom is used instead of `fitBounds()`
// on the region polygons, per design.md, to avoid a load-order race between
// the Maps script and the boundary-fetch data (StateBoundaryOverlay, which
// owns the polygons, may not exist yet when this map is first created).
export const INITIAL_MAP_CENTER = { lat: 44, lng: -100 };
export const INITIAL_MAP_ZOOM = 3;

/**
 * @param {Object} props
 * @param {(map: google.maps.Map) => void} [props.onMapReady] - called once,
 *   with the created `google.maps.Map` instance, as soon as it exists.
 */
export function GoogleMapCanvas({ onMapReady }) {
  const mapElementRef = React.useRef(null);
  const mapInstanceRef = React.useRef(null);

  React.useEffect(() => {
    // Guard against double-construction (e.g. a re-render before this
    // effect's cleanup would ever run -- there is none, since the map is
    // meant to live for the component's whole lifetime).
    if (mapInstanceRef.current) {
      return;
    }

    const googleMaps =
      typeof window !== 'undefined' && window.google != null ? window.google.maps : null;

    if (googleMaps == null || !mapElementRef.current) {
      return;
    }

    const map = new googleMaps.Map(mapElementRef.current, {
      center: INITIAL_MAP_CENTER,
      zoom: INITIAL_MAP_ZOOM,
    });

    mapInstanceRef.current = map;

    if (onMapReady) {
      onMapReady(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mapElementRef}
      data-testid="google-map-canvas"
      style={{ width: '100%', height: '100%', minHeight: '480px' }}
    />
  );
}
