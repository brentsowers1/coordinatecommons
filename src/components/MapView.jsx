// Owns the Google Maps loading/error/retry lifecycle (design.md: "MapView /
// StateBoundaryOverlay", Component Tree: "MapView: Owns Google Maps
// lifecycle (loading, error, retry) and renders GoogleMapCanvas,
// StateBoundaryOverlay, PlaceInfoPanel, VisitedStatesLists (implemented
// as PlaceVisitStatusLists).").
//
// Renders the combined loading/error/retry UI while either the map script
// or the region data is still loading/failed, and once both loaders are
// ready, renders `GoogleMapCanvas`, `StateBoundaryOverlay` (once the map
// instance exists), `PlaceInfoPanel`, `LoginPromptBanner`, and
// `PlaceVisitStatusLists` as siblings inside the `data-testid="map-view"`
// wrapper.
//
// LoginPromptBanner placement (Requirement 9.2): the banner belongs "in an
// area below the Map_View", so `MapView` -- not `MapPage` -- owns where it
// goes. It is rendered immediately after `PlaceInfoPanel` and BEFORE
// `PlaceVisitStatusLists`, because `PlaceVisitStatusLists` renders two long
// columns (one entry per place -- hundreds for the 'country' category);
// anything after it lands at the very bottom of the page rather than in the
// area just below the map. It is also rendered in the loading and error
// branches so an unauthenticated user sees the prompt persistently in every
// map state, not just the ready one. `LoginPromptBanner` self-gates on
// `useSession` (returning null when there is a session, Requirement 9.3), so
// no conditional logic is needed here.
//
// `onRequestLogin`/`onRequestSignUp` (Requirement 9.2): forwarded, unused
// otherwise, to `LoginPromptBanner` in all three branches below, so its
// "Log in" / "sign up for an account" links can reach `AuthGate`'s
// navigation (AuthGate -> MapPage -> MapView -> banner). `MapView` has no
// navigation concept of its own; this is a pure pass-through.

import React from 'react';
import { useGoogleMapsLoader } from './useGoogleMapsLoader';
import { usePlaceBoundariesLoader } from '../data/placeBoundaries';
import { GoogleMapCanvas } from './GoogleMapCanvas';
import { StateBoundaryOverlay } from './StateBoundaryOverlay';
import { PlaceInfoPanel } from './PlaceInfoPanel';
import { PlaceVisitStatusLists } from './PlaceVisitStatusLists';
import { LoginPromptBanner } from './LoginPromptBanner';
import { useStateBoundaryClickHandler } from '../state/useStateBoundaryClickHandler';
import {
  useSession,
  useVisitedPlaceIdsByCategory,
  useSelectedPlaceCategory,
  useInfoPanelPlaceId,
} from '../state/sharedState';
import { useVisitedPlacesLoader } from '../state/useVisitedPlacesLoader';

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

/**
 * @param {Object} props
 * @param {() => void} [props.onRequestLogin] - forwarded to
 *   `LoginPromptBanner`'s "Log in" link (Requirement 9.2).
 * @param {() => void} [props.onRequestSignUp] - forwarded to
 *   `LoginPromptBanner`'s "sign up for an account" link (Requirement 9.2).
 */
export function MapView({ onRequestLogin, onRequestSignUp } = {}) {
  const mapScriptLoader = useGoogleMapsLoader();

  // Task 29.1 (Requirements 14.1, 15.3): render only the Selected_Place_Category's
  // boundaries/visited-place slice. usePlaceBoundariesLoader is keyed
  // internally by category, so switching selectedPlaceCategory here
  // naturally swaps in that category's (possibly cached) loader state.
  const [selectedPlaceCategory] = useSelectedPlaceCategory();
  const regionsLoader = usePlaceBoundariesLoader(selectedPlaceCategory);

  // Task 19.3/29.1 (Requirements 1.6, 1.7, 4, 14.1): read the current
  // session and load the Selected_Place_Category's Visited_Place records
  // from the Visit_Record_API via useVisitedPlacesLoader(). Renamed on
  // destructure to avoid colliding with mapScriptLoader/regionsLoader's
  // own `status` field names.
  const [session] = useSession();
  const {
    status: visitedStatesStatus,
    visitedPlaceIds: loadedVisitedStateIds,
    retry: retryVisitedStatesLoad,
  } = useVisitedPlacesLoader(session, selectedPlaceCategory);

  // The SHARED visited-state store -- the one StateBoundaryOverlay and
  // handleStateBoundaryClick actually read/write (sharedState.js). This is
  // a distinct piece of state from useVisitedPlacesLoader's own internal
  // visitedPlaceIds (see that hook's module comment on why the two are
  // kept separate): the loader's copy is a private staging area used only
  // to shape the result of *its own* authenticated load, while this is the
  // store the rest of the app renders from. Task 29.1: writes only the
  // currently Selected_Place_Category's slice of the per-category store,
  // leaving every other category's slice untouched (Requirement 15.3).
  const [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();

  // Sync the authenticated load's result into the shared store once it
  // completes. Guarded on `session` being truthy so a guest (session ===
  // null) never has this effect call the shared setter at all -- for a
  // guest, useVisitedPlacesLoader's own visitedPlaceIds is a separate
  // no-op placeholder (see that hook's extensive comments) that must never
  // overwrite locally-made guest marks (design.md Property 9). Only an
  // actual authenticated load transitioning to 'ready' reaches the setter
  // below. `selectedPlaceCategory` is included in the dependency array so
  // this effect re-runs (and writes the correct category's key) whenever
  // the Selected_Place_Category changes, per task 29.1.
  React.useEffect(() => {
    if (session && visitedStatesStatus === 'ready') {
      setVisitedPlaceIdsByCategory((previous) => ({
        ...previous,
        [selectedPlaceCategory]: loadedVisitedStateIds,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitedStatesStatus, loadedVisitedStateIds, session, selectedPlaceCategory]);

  // Task 29.3 (Requirement 15.4, design.md "PlaceInfoPanel"): a placeId set
  // while a different Selected_Place_Category was active has no defined
  // meaning against the new category's boundaries, so reset the hover/
  // last-click info panel target to null whenever selectedPlaceCategory
  // changes. Depends ONLY on selectedPlaceCategory -- it must not re-run
  // for any other reason (e.g. the visited-places load completing above),
  // and clobbering it on the very first mount is a harmless no-op since
  // useInfoPanelPlaceId already defaults to null (sharedState.js).
  const [, setInfoPanelPlaceId] = useInfoPanelPlaceId();
  React.useEffect(() => {
    setInfoPanelPlaceId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaceCategory]);

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
      <>
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
        <LoginPromptBanner
          onRequestLogin={onRequestLogin}
          onRequestSignUp={onRequestSignUp}
        />
      </>
    );
  }

  if (isLoading || !isReady) {
    return (
      <>
        <div role="status" data-testid="map-view-loading">
          Loading map&hellip;
        </div>
        <LoginPromptBanner
          onRequestLogin={onRequestLogin}
          onRequestSignUp={onRequestSignUp}
        />
      </>
    );
  }

  return (
    <div data-testid="map-view">
      <GoogleMapCanvas onMapReady={setMapInstance} />
      {mapInstance ? (
        <StateBoundaryOverlay
          key={selectedPlaceCategory}
          map={mapInstance}
          regions={regionsLoader.placeBoundaries}
          onStateBoundaryClick={onStateBoundaryClick}
        />
      ) : null}
      <PlaceInfoPanel regions={regionsLoader.placeBoundaries} />
      {/* Requirement 9.2: directly below the map, ABOVE the long
          Place_Visit_Status_Lists columns -- see the placement note atop
          this module. */}
      <LoginPromptBanner
        onRequestLogin={onRequestLogin}
        onRequestSignUp={onRequestSignUp}
      />
      <PlaceVisitStatusLists regions={regionsLoader.placeBoundaries} />
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
