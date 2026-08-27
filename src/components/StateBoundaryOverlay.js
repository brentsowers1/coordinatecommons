// Draws the 51 State_Boundary polygons on the map and wires up hit-testing
// (design.md: "MapView / StateBoundaryOverlay"; Requirements 3.5, 3.6, 6.2,
// 8.3).
//
// Scope note (task 12.5): this task implements rendering (one
// `google.maps.Polygon` per region, colored via `resolveFillColor`) and the
// hover/hit-testing wiring:
//   - exactly one `mousemove` and one `mouseout` listener on the `Map`
//     object (not per-polygon), updating `useInfoPanelStateId` on
//     hover-capable devices (Requirement 3.5, 6.2's prerequisite, 10.8's
//     hover-capable branch handled by `StateInfoPanel`'s
//     `useIsHoverCapable()`).
//   - exactly one `click` listener on the `Map` object that resolves the
//     hit region and, on touch-only (hover-incapable) devices, sets
//     `useInfoPanelStateId` directly from the click (Requirement 10.8's
//     click branch). On any device, once a region is hit, it also invokes
//     `onStateBoundaryClick(stateId)` -- an extension point wired up by
//     task 14.6 (`MapView` passes in a callback built by
//     `useStateBoundaryClickHandler()`, in `src/state/`, which wraps
//     `handleStateBoundaryClick` and surfaces `useToastError` on revert).
//     It defaults to a no-op so this component remains fully functional
//     (and testable) on its own. If no region is hit, the click is
//     ignored entirely (Requirement 3.6).
//
// Task 14.6 passes a real `onStateBoundaryClick` into this component from
// `MapView` -- nothing in that wiring changes this file's own
// listener-registration or hit-testing logic.

import React from 'react';
import { useVisitedStateIds, useInfoPanelStateId } from '../state/sharedState';
import { resolveFillColor } from './resolveFillColor';
import { resolveRegionAtLatLng } from '../data/stateBoundaries';
import { useIsHoverCapable } from './StateInfoPanel';

/**
 * Converts one ring of `[lng, lat]` pairs (the `Region.polygons` shape,
 * see `stateBoundaries.js`) into the `{ lat, lng }` objects expected by
 * `google.maps.Polygon`'s `paths` option -- note the coordinate order
 * flip.
 *
 * @param {number[][]} ring
 * @returns {{lat: number, lng: number}[]}
 */
function ringToPath(ring) {
  return ring.map(([lng, lat]) => ({ lat, lng }));
}

/**
 * @param {import('../data/stateBoundaries').Region} region
 * @returns {{lat: number, lng: number}[][]}
 */
function regionToPaths(region) {
  return region.polygons.map(ringToPath);
}

function isGoogleMapsAvailable() {
  return typeof window !== 'undefined' && window.google != null && window.google.maps != null;
}

/**
 * Renders the 51 State_Boundary polygons on `map` and wires up the map's
 * single click/mousemove/mouseout listeners. Renders no DOM of its own --
 * all output is imperative Google Maps overlay state.
 *
 * @param {Object} props
 * @param {google.maps.Map | null} props.map - the created map instance
 *   (e.g. `MapView`'s `mapInstance` state, from `GoogleMapCanvas`'s
 *   `onMapReady`). Nothing is rendered until this is truthy.
 * @param {import('../data/stateBoundaries').Region[]} props.regions - the
 *   loaded region list (from `useRegionsLoader()`). Nothing is rendered
 *   until this is a non-empty array.
 * @param {(stateId: string) => void} [props.onStateBoundaryClick] - called
 *   with the clicked region's `stateId` whenever a click hits a region.
 *   Defaults to a no-op; this is the extension point task 14.6 uses to
 *   wire in `handleStateBoundaryClick`.
 */
export function StateBoundaryOverlay({ map, regions, onStateBoundaryClick = () => {} }) {
  const [visitedStateIds] = useVisitedStateIds();
  const [, setInfoPanelStateId] = useInfoPanelStateId();
  const isHoverCapable = useIsHoverCapable();

  // The currently-constructed polygons, keyed by stateId, so the
  // color-update effect (below) can find them without re-registering map
  // listeners or recreating polygons on every visitedStateIds change.
  const polygonsByStateIdRef = React.useRef({});

  // Tracks the most recently hovered stateId (or null) so mousemove only
  // updates useInfoPanelStateId when the hit region actually changes,
  // avoiding redundant setter calls/re-renders.
  const lastHoveredStateIdRef = React.useRef(null);

  // Listener closures below are registered exactly once per
  // map/regions/Maps-API-availability combination (see the effect's
  // dependency array). `regions`, `onStateBoundaryClick`, and
  // `isHoverCapable` can each change independently of that -- refs let the
  // listeners always see the latest values without needing to be
  // re-registered.
  const regionsRef = React.useRef(regions);
  regionsRef.current = regions;
  const onStateBoundaryClickRef = React.useRef(onStateBoundaryClick);
  onStateBoundaryClickRef.current = onStateBoundaryClick;
  const isHoverCapableRef = React.useRef(isHoverCapable);
  isHoverCapableRef.current = isHoverCapable;
  const setInfoPanelStateIdRef = React.useRef(setInfoPanelStateId);
  setInfoPanelStateIdRef.current = setInfoPanelStateId;

  // Construct one google.maps.Polygon per region and register the map's
  // single click/mousemove/mouseout listeners. Guarded the same way
  // GoogleMapCanvas guards its own `google.maps.Map` construction, so
  // this doesn't crash in test environments that don't stub the full Maps
  // API and haven't produced a real `map` instance yet.
  React.useEffect(() => {
    if (!map || !regions || regions.length === 0 || !isGoogleMapsAvailable()) {
      return undefined;
    }

    const googleMaps = window.google.maps;
    const polygonsByStateId = {};

    regions.forEach((region) => {
      const polygon = new googleMaps.Polygon({
        paths: regionToPaths(region),
        map,
        fillColor: resolveFillColor(region.stateId, visitedStateIds),
        fillOpacity: 0.6,
        strokeColor: '#000000',
        strokeOpacity: 0.8,
        strokeWeight: 1,
        // A clickable Polygon (the Maps API default) intercepts click
        // events itself, preventing them from ever reaching the map's own
        // click listener registered below. Since this design deliberately
        // uses a single map-level click listener (not one per polygon) so
        // hit-testing goes through resolveRegionAtLatLng, every polygon
        // must be non-clickable so its clicks fall through to the map.
        clickable: false,
      });
      polygonsByStateId[region.stateId] = polygon;
    });

    polygonsByStateIdRef.current = polygonsByStateId;

    function handleMouseMove(event) {
      if (!isHoverCapableRef.current) {
        return;
      }
      const hitStateId = resolveRegionAtLatLng(event.latLng, regionsRef.current);
      if (hitStateId !== lastHoveredStateIdRef.current) {
        lastHoveredStateIdRef.current = hitStateId;
        setInfoPanelStateIdRef.current(hitStateId);
      }
    }

    function handleMouseOut() {
      if (!isHoverCapableRef.current) {
        return;
      }
      lastHoveredStateIdRef.current = null;
      setInfoPanelStateIdRef.current(null);
    }

    function handleClick(event) {
      const hitStateId = resolveRegionAtLatLng(event.latLng, regionsRef.current);
      if (hitStateId == null) {
        // Requirement 3.6: no region hit -> no action taken.
        return;
      }
      if (!isHoverCapableRef.current) {
        // Requirement 10.8: touch-only devices set the info panel target
        // from click rather than hover.
        setInfoPanelStateIdRef.current(hitStateId);
      }
      // Extension point for task 14.6 (handleStateBoundaryClick wiring);
      // a no-op by default.
      onStateBoundaryClickRef.current(hitStateId);
    }

    const mouseMoveListener = map.addListener('mousemove', handleMouseMove);
    const mouseOutListener = map.addListener('mouseout', handleMouseOut);
    const clickListener = map.addListener('click', handleClick);

    return () => {
      mouseMoveListener.remove();
      mouseOutListener.remove();
      clickListener.remove();
      Object.values(polygonsByStateId).forEach((polygon) => polygon.setMap(null));
      polygonsByStateIdRef.current = {};
    };
    // visitedStateIds is intentionally omitted: the initial fillColor above
    // uses whatever value is current at construction time, and every
    // subsequent color change is handled by the effect below without
    // recreating polygons or re-registering listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, regions]);

  // Requirement 6.2: update every polygon's fill color whenever
  // visitedStateIds changes, without recreating polygons or listeners.
  React.useEffect(() => {
    Object.entries(polygonsByStateIdRef.current).forEach(([stateId, polygon]) => {
      polygon.setOptions({ fillColor: resolveFillColor(stateId, visitedStateIds) });
    });
  }, [visitedStateIds]);

  return null;
}
