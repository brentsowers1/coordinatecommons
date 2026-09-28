/**
 * Wires the pure `handlePlaceBoundaryClick` orchestration function
 * (src/components/handlePlaceBoundaryClick.js) to the Shared_State_Store
 * (design.md: "Toggle Handler (`handlePlaceBoundaryClick`)"; "Toggle
 * Sequence" mermaid diagram; task 14.6).
 *
 * Placement note: this hook lives in `src/state/` (alongside
 * `sharedState.js` and `useVisitedStatesLoader.js`) rather than
 * `src/components/`, for the same reason `useVisitedStatesLoader.js` does
 * (see that file's comment): its entire purpose is to read/write the
 * Shared_State_Store, not to render anything. `handlePlaceBoundaryClick`
 * itself stays a pure, DOM-free function in `src/components/` (it doesn't
 * touch React state at all); this hook is the thin, stateful glue between
 * it and `useSession`/`useVisitedPlaceIdsByCategory`/`usePendingPlaceIds`/
 * `useToastError`, matching the "pure orchestration functions + thin
 * wiring in components/hooks" pattern used throughout this codebase.
 * Bugfix (Requirement 15.2): this hook reads `useSelectedPlaceCategory()`
 * itself and uses that value -- not a hardcoded category -- to pick which
 * slice of the two per-category stores to read/write and which
 * Place_Category to send with the save request, so saving a place under
 * any Selected_Place_Category sends the correct `placeType` to the
 * Visit_Record_API.
 *
 * `apiClient` is accepted as an optional parameter (defaulting to a thin
 * wrapper around the real `visitRecordApiClient.saveVisitedPlace`) purely
 * so this hook stays testable/mockable, consistent with
 * `handlePlaceBoundaryClick` itself accepting `apiClient` rather than
 * importing the client module directly. This hook always calls it with the
 * current `selectedPlaceCategory`.
 *
 * Stale-closure handling: `MapView` (the only current caller) re-renders
 * whenever `useSession`/`useVisitedPlaceIdsByCategory`/`usePendingPlaceIds`/
 * `useSelectedPlaceCategory` change (it's subscribed to all of them), and
 * the callback returned here is recreated -- via `useCallback`'s dependency
 * array -- every time any of those values change. `StateBoundaryOverlay`
 * (task 12.5) already stores whatever `onStateBoundaryClick` it's given in
 * a ref that it re-assigns on every render
 * (`onStateBoundaryClickRef.current = onStateBoundaryClick`), so its
 * map-level click listener -- registered once and never re-registered --
 * always invokes the *latest* callback, which in turn always closes over
 * the *latest* `session`/`selectedPlaceCategory`/`visitedStateIds`/
 * `pendingStateIds`. Between them, neither side is left holding a stale
 * value.
 */

import React from 'react';
import {
  useSession,
  useSelectedPlaceCategory,
  useVisitedPlaceIdsByCategory,
  usePendingPlaceIds,
  useToastError,
} from './sharedState';
import { handlePlaceBoundaryClick } from '../components/handlePlaceBoundaryClick';
import { saveVisitedPlace } from '../services/visitRecordApiClient';
import { updateVisitedPlacesCache } from './useVisitedPlacesLoader';

// Task 21.6/21.10: `handlePlaceBoundaryClick` threads an explicit
// `placeCategory` through to `apiClient.saveVisitedState`, matching
// `visitRecordApiClient.saveVisitedPlace(session, placeCategory, placeId,
// visited)`'s signature; this hook's `defaultApiClient` wrapper accepts and
// forwards that `placeCategory` argument too (the current
// `selectedPlaceCategory` from this hook's own call site below).
const defaultApiClient = {
  saveVisitedState: (session, placeCategory, stateId, visited) =>
    saveVisitedPlace(session, placeCategory, stateId, visited),
};

/**
 * @param {{ saveVisitedState: (session: any, placeCategory: string, stateId: string, visited: boolean) => Promise<any> }} [apiClient]
 *   defaults to the real `visitRecordApiClient`; override in tests.
 * @returns {(stateId: string) => void} a stable-identity-per-render-of-current-state
 *   callback suitable for `StateBoundaryOverlay`'s `onStateBoundaryClick` prop.
 */
export function useStateBoundaryClickHandler(apiClient = defaultApiClient) {
  const [session] = useSession();
  const [selectedPlaceCategory] = useSelectedPlaceCategory();
  const [visitedPlaceIdsByCategory, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
  const [pendingPlaceIds, setPendingPlaceIds] = usePendingPlaceIds();
  const [, setToastError] = useToastError();

  const visitedStateIds = visitedPlaceIdsByCategory[selectedPlaceCategory];
  const pendingStateIds = pendingPlaceIds[selectedPlaceCategory];

  return React.useCallback(
    (stateId) => {
      const result = handlePlaceBoundaryClick(
        session,
        selectedPlaceCategory,
        visitedStateIds,
        pendingStateIds,
        stateId,
        apiClient
      );

      // 5.4: already pending -- handlePlaceBoundaryClick signals a
      // complete no-op with null; apply nothing.
      if (result == null) {
        return;
      }

      // Apply the optimistic update immediately, scoped to the current
      // Selected_Place_Category's slice of each per-category store.
      setVisitedPlaceIdsByCategory((previous) => ({
        ...previous,
        [selectedPlaceCategory]: result.visitedPlaceIdsForCategory,
      }));
      setPendingPlaceIds((previous) => ({
        ...previous,
        [selectedPlaceCategory]: result.pendingPlaceIdsForCategory,
      }));

      // Once the (session-gated) save call settles, apply its resolved
      // state, and surface a toast error if the save failed/timed out and
      // was reverted (Requirements 5.3, 9.4).
      result.settle().then((settled) => {
        setVisitedPlaceIdsByCategory((previous) => ({
          ...previous,
          [selectedPlaceCategory]: settled.visitedPlaceIdsForCategory,
        }));
        setPendingPlaceIds((previous) => ({
          ...previous,
          [selectedPlaceCategory]: settled.pendingPlaceIdsForCategory,
        }));
        // Bugfix: keep useVisitedPlacesLoader's per-category cache in sync
        // with this settled (authoritative) result too -- on BOTH the
        // success path and the reverted-failure path, settled.visitedPlaceIdsForCategory
        // is the current truth for this category -- so a later switch away
        // from and back to selectedPlaceCategory doesn't remount
        // useVisitedPlacesLoader into reporting stale pre-save data (see
        // updateVisitedPlacesCache's doc comment in useVisitedPlacesLoader.js).
        updateVisitedPlacesCache(selectedPlaceCategory, settled.visitedPlaceIdsForCategory);
        if (settled.toastError != null) {
          setToastError(settled.toastError);
        }
      });
    },
    [
      session,
      selectedPlaceCategory,
      visitedStateIds,
      pendingStateIds,
      apiClient,
      setVisitedPlaceIdsByCategory,
      setPendingPlaceIds,
      setToastError,
    ]
  );
}
