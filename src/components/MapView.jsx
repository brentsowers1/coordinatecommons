// Owns the Google Maps loading/error/retry lifecycle (design.md: "MapView /
// StateBoundaryOverlay", Component Tree: "MapView: Owns Google Maps
// lifecycle (loading, error, retry) and renders GoogleMapCanvas,
// StateBoundaryOverlay, StateInfoPanel.").
//
// Renders the combined loading/error/retry UI while either the map script
// or the region data is still loading/failed, and once both loaders are
// ready, renders `GoogleMapCanvas`, `StateBoundaryOverlay` (once the map
// instance exists), and `StateInfoPanel` as siblings inside the
// `data-testid="map-view"` wrapper.

import React from 'react';
import { useGoogleMapsLoader } from './useGoogleMapsLoader';
import { useRegionsLoader } from '../data/stateBoundaries';
import { GoogleMapCanvas } from './GoogleMapCanvas';
import { StateBoundaryOverlay } from './StateBoundaryOverlay';
import { StateInfoPanel } from './StateInfoPanel';
import { useStateBoundaryClickHandler } from '../state/useStateBoundaryClickHandler';
import { useSession, useVisitedStateIds } from '../state/sharedState';
import { useVisitedStatesLoader } from '../state/useVisitedStatesLoader';

/**
 * Combines two independent `{ status: 'loading' | 'ready' | 'error' }`
 * loader results into one summary used to drive the combined loading
 * indicator and error/retry control (Requirements 3.3, 3.4).
 *
 * - `isLoading`: true while either source is still `'loading'` -- the
 *   loading indicator clears only once BOTH report `'ready'`.
 * - `failedSources`: the labels of whichever source(s) are currently
 *   `'error'` (empty when neither has failed).
 * - `isReady`: true only once BOTH sources report `'ready'`.
 */
function combineLoaderStatuses(mapScriptStatus, boundaryDataStatus) {
  const failedSources = [];
  if (mapScriptStatus === 'error') {
    failedSources.push('map script');
  }
  if (boundaryDataStatus === 'error') {
    failedSources.push('boundary data');
  }

  return {
    isLoading: mapScriptStatus === 'loading' || boundaryDataStatus === 'loading',
    failedSources,
    isReady: mapScriptStatus === 'ready' && boundaryDataStatus === 'ready',
  };
}

export function MapView() {
  const mapScriptLoader = useGoogleMapsLoader();
  const regionsLoader = useRegionsLoader();

  // Task 19.3 (Requirements 1.6, 1.7, 4): read the current session and load
  // that user's Visited_State records from the Visit_Record_API via
  // useVisitedStatesLoader(). Renamed on destructure to avoid colliding
  // with mapScriptLoader/regionsLoader's own `status` field names.
  const [session] = useSession();
  const {
    status: visitedStatesStatus,
    visitedStateIds: loadedVisitedStateIds,
    retry: retryVisitedStatesLoad,
  } = useVisitedStatesLoader(session);

  // The SHARED visited-state store -- the one StateBoundaryOverlay and
  // handleStateBoundaryClick actually read/write (sharedState.js). This is
  // a distinct piece of state from useVisitedStatesLoader's own internal
  // visitedStateIds (see that hook's module comment on why the two are
  // kept separate): the loader's copy is a private staging area used only
  // to shape the result of *its own* authenticated load, while this is the
  // store the rest of the app renders from.
  const [, setSharedVisitedStateIds] = useVisitedStateIds();

  // Sync the authenticated load's result into the shared store once it
  // completes. Guarded on `session` being truthy so a guest (session ===
  // null) never has this effect call the shared setter at all -- for a
  // guest, useVisitedStatesLoader's own visitedStateIds is a separate
  // no-op placeholder (see that hook's extensive comments) that must never
  // overwrite locally-made guest marks (design.md Property 9). Only an
  // actual authenticated load transitioning to 'ready' reaches the setter
  // below.
  React.useEffect(() => {
    if (session && visitedStatesStatus === 'ready') {
      setSharedVisitedStateIds(loadedVisitedStateIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitedStatesStatus, loadedVisitedStateIds, session]);

  // Task 14.6: wires handleStateBoundaryClick into
  // StateBoundaryOverlay's click listener, and surfaces the toast error
  // from useToastError on revert (Requirements 5.3, 9.4).
  const onStateBoundaryClick = useStateBoundaryClickHandler();

  // Captured for StateBoundaryOverlay (task 12.5), which will need the
  // created `google.maps.Map` instance to add polygons/listeners to it.
  // Not consumed by anything yet in this task.
  const [mapInstance, setMapInstance] = React.useState(null);

  const { isLoading, failedSources, isReady } = combineLoaderStatuses(
    mapScriptLoader.status,
    regionsLoader.status
  );

  if (failedSources.length > 0) {
    // Requirement 3.4: identify which source(s) failed, and retry only
    // whichever of the two is still in an `error` state.
    const failureDescription =
      failedSources.length === 2
        ? 'The map failed to load and the region data failed to load.'
        : failedSources[0] === 'map script'
        ? 'The map failed to load.'
        : 'The region data failed to load.';

    return (
      <div role="alert" data-testid="map-view-error">
        <p>{failureDescription}</p>
        {mapScriptLoader.status === 'error' ? (
          <button type="button" onClick={mapScriptLoader.retry}>
            Retry loading map
          </button>
        ) : null}
        {regionsLoader.status === 'error' ? (
          <button type="button" onClick={regionsLoader.retry}>
            Retry loading region data
          </button>
        ) : null}
      </div>
    );
  }

  if (isLoading || !isReady) {
    return (
      <div role="status" data-testid="map-view-loading">
        Loading map&hellip;
      </div>
    );
  }

  return (
    <div data-testid="map-view">
      <GoogleMapCanvas onMapReady={setMapInstance} />
      {mapInstance ? (
        <StateBoundaryOverlay
          map={mapInstance}
          regions={regionsLoader.regions}
          onStateBoundaryClick={onStateBoundaryClick}
        />
      ) : null}
      <StateInfoPanel regions={regionsLoader.regions} />
      {/* Requirement 4.4/4.5: a failed visited-states load never blocks the
          map/overlay from rendering (they're already visible above); this
          is a small, additive inline error/retry affordance specific to
          that load, distinct from the map/regions error UI above. */}
      {session && visitedStatesStatus === 'error' ? (
        <div role="alert" data-testid="visited-states-load-error">
          <p>Your visited states could not be loaded.</p>
          <button type="button" onClick={retryVisitedStatesLoad}>
            Retry loading visited states
          </button>
        </div>
      ) : null}
    </div>
  );
}
