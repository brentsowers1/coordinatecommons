// Toggle handler for a Place_Boundary click (design.md: "Toggle Handler
// (`handlePlaceBoundaryClick`)").
//
// This is a *pure orchestration function*: it never touches the DOM, never
// reads/writes the `make-shared-state-hook` hooks directly, and never calls
// `fetch` itself. It only computes the next `{ visitedPlaceIdsForCategory,
// pendingPlaceIdsForCategory }` state synchronously, and hands back a
// `settle()` function the caller can invoke to actually perform the
// (session-gated) API call and find out how the state should look once
// that call resolves. This keeps it directly property-testable (design.md
// Properties 10, 11, 12, 13) without mocking React state or the DOM, and
// lets a component (e.g. `PlaceBoundaryOverlay`, task 14.6) or a test drive
// it with plain objects.
//
// Task 21.6: generalized from the US-states-only `handleStateBoundaryClick`
// to accept an explicit `placeCategory`, threaded through to
// `apiClient.saveVisitedState` (which itself wraps
// `visitRecordApiClient.saveVisitedPlace(session, placeCategory, placeId,
// visited)`, task 21.10), and renamed its other parameters
// (`visitedStateIds`/`pendingStateIds`/`stateId` to
// `visitedPlaceIdsForCategory`/`pendingPlaceIdsForCategory`/`placeId`). This
// function still only ever reads/writes the single category's slices it is
// given -- it never reads or writes any other category's slice -- so
// Requirement 15.6 is satisfied structurally by the signature itself; the
// caller (`PlaceBoundaryOverlay`) is responsible for scoping
// `visitedPlaceIdsForCategory`/`pendingPlaceIdsForCategory` to the Selected
// Place_Category before calling this function.
//
// Chosen return shape
// --------------------
// design.md describes the function as returning "the next
// `{ visitedPlaceIdsForCategory, pendingPlaceIdsForCategory }` and the API
// call to issue", which mixes a synchronous result (the optimistic update)
// with something inherently asynchronous (the save request and its
// revert-on-failure). Since design.md leaves the exact shape open, this
// implementation splits the two concerns explicitly:
//
//   handlePlaceBoundaryClick(session, placeCategory, visitedPlaceIdsForCategory, pendingPlaceIdsForCategory, placeId, apiClient)
//     -> null
//        when `placeId` is already in `pendingPlaceIdsForCategory` (5.4):
//        the caller should treat the click as a complete no-op and apply
//        nothing.
//
//     -> {
//          visitedPlaceIdsForCategory: <new map with `placeId`'s membership flipped>,
//          pendingPlaceIdsForCategory: <new map with `placeId` added>,
//          settle: () => Promise<{ visitedPlaceIdsForCategory, pendingPlaceIdsForCategory, toastError }>
//        }
//        otherwise. The caller SHOULD apply `visitedPlaceIdsForCategory`
//        and `pendingPlaceIdsForCategory` to its state immediately (the
//        optimistic update, 5.1/5.2/5.5/5.6), then call `settle()` and,
//        once it resolves, apply *its*
//        `visitedPlaceIdsForCategory`/`pendingPlaceIdsForCategory` to state
//        as the final outcome of the click.
//
// `settle()`'s resolution shape:
//   {
//     visitedPlaceIdsForCategory: <visitedPlaceIdsForCategory to apply after the call settles>,
//     pendingPlaceIdsForCategory: <pendingPlaceIdsForCategory to apply after the call settles;
//                                   always has `placeId` cleared>,
//     toastError: <a value to pass to useToastError, or null>
//   }
//
// - If `session` is present, `settle()` calls `apiClient.saveVisitedState`
//   with `visited` set to the new membership state, then:
//     - on success: resolves with the flipped `visitedPlaceIdsForCategory`
//       unchanged and `placeId` cleared from `pendingPlaceIdsForCategory`;
//       `toastError: null`.
//     - on failure/timeout (any rejection from `saveVisitedState`):
//       resolves with `placeId` flipped *back* to its pre-click value in
//       `visitedPlaceIdsForCategory`, `placeId` cleared from
//       `pendingPlaceIdsForCategory`, and a non-null `toastError`
//       describing the failure (5.3).
//   `settle()` never rejects; every outcome (success or failure) is
//   represented as a resolved value so the caller has one code path to
//   apply the result.
// - If `session` is absent, `settle()` skips the API call entirely (5.5,
//   5.6) and resolves immediately with the flipped
//   `visitedPlaceIdsForCategory` unchanged and `placeId` cleared from
//   `pendingPlaceIdsForCategory`, `toastError: null`.
//
// `apiClient` is accepted as a parameter (rather than importing
// `visitRecordApiClient` directly) purely so it is mockable by callers and
// tests (design.md's stated testability goal); it must expose at least a
// `saveVisitedState(session, placeCategory, placeId, visited)` function
// matching `src/services/visitRecordApiClient.js`'s
// `saveVisitedPlace(session, placeCategory, placeId, visited)` contract.

/**
 * @typedef {Object.<string, true>} VisitedPlaceIdsForCategory
 * @typedef {Object.<string, true>} PendingPlaceIdsForCategory
 *
 * @typedef {Object} SettleResult
 * @property {VisitedPlaceIdsForCategory} visitedPlaceIdsForCategory
 * @property {PendingPlaceIdsForCategory} pendingPlaceIdsForCategory
 * @property {*} toastError - non-null when the save failed/timed out and
 *   the caller should surface an error to the user; otherwise null.
 *
 * @typedef {Object} HandlePlaceBoundaryClickResult
 * @property {VisitedPlaceIdsForCategory} visitedPlaceIdsForCategory - the
 *   optimistic next value.
 * @property {PendingPlaceIdsForCategory} pendingPlaceIdsForCategory - the
 *   optimistic next value, with `placeId` marked pending.
 * @property {() => Promise<SettleResult>} settle - performs the
 *   session-gated API call (if any) and resolves with the final state to
 *   apply once it settles.
 */

/**
 * Pure orchestration for the optimistic mark/unmark toggle (Requirements
 * 5.1, 5.2, 5.4, 5.5, 5.6, 15.2, 15.6).
 *
 * @param {{ accessToken: string } | null} session - the current Session, or
 *   `null` for an unauthenticated visitor.
 * @param {string} placeCategory - the Place_Category in effect at the time
 *   of the click (e.g. `'us-state'`); sent verbatim as the `placeType` on
 *   the `saveVisitedState` call (15.2).
 * @param {VisitedPlaceIdsForCategory} visitedPlaceIdsForCategory - current
 *   visited-place membership map, scoped to `placeCategory`'s slice only.
 * @param {PendingPlaceIdsForCategory} pendingPlaceIdsForCategory - current
 *   pending-request membership map, scoped to `placeCategory`'s slice only.
 * @param {string} placeId - the region that was clicked.
 * @param {{ saveVisitedState: (session: any, placeCategory: string, placeId: string, visited: boolean) => Promise<any> }} apiClient
 *   an object exposing at least `saveVisitedState`, matching
 *   `visitRecordApiClient.saveVisitedPlace`'s contract (rejects with
 *   `{ kind: 'AUTH_ERROR' | 'TIMEOUT' | 'FAILURE' }` on failure).
 * @returns {HandlePlaceBoundaryClickResult | null} `null` if `placeId` is
 *   already pending (5.4); otherwise the optimistic next state plus a
 *   `settle()` function.
 */
export function handlePlaceBoundaryClick(
  session,
  placeCategory,
  visitedPlaceIdsForCategory,
  pendingPlaceIdsForCategory,
  placeId,
  apiClient
) {
  // 5.4: ignore further clicks on a place while a request for it is
  // in-flight.
  if (
    pendingPlaceIdsForCategory != null &&
    Object.prototype.hasOwnProperty.call(pendingPlaceIdsForCategory, placeId)
  ) {
    return null;
  }

  const wasVisited =
    visitedPlaceIdsForCategory != null &&
    Object.prototype.hasOwnProperty.call(visitedPlaceIdsForCategory, placeId);
  const nextVisited = !wasVisited;

  // Flip membership immediately (optimistic update).
  const nextVisitedPlaceIdsForCategory = { ...visitedPlaceIdsForCategory };
  if (nextVisited) {
    nextVisitedPlaceIdsForCategory[placeId] = true;
  } else {
    delete nextVisitedPlaceIdsForCategory[placeId];
  }

  // Mark this place pending immediately.
  const nextPendingPlaceIdsForCategory = { ...pendingPlaceIdsForCategory, [placeId]: true };

  async function settle() {
    // 5.5/5.6: unauthenticated visitors never trigger an API call.
    if (!session) {
      const settledPendingPlaceIdsForCategory = { ...nextPendingPlaceIdsForCategory };
      delete settledPendingPlaceIdsForCategory[placeId];
      return {
        visitedPlaceIdsForCategory: nextVisitedPlaceIdsForCategory,
        pendingPlaceIdsForCategory: settledPendingPlaceIdsForCategory,
        toastError: null,
      };
    }

    // 5.1/5.2/15.2: authenticated visitors persist the new membership
    // state, tagged with the Place_Category in effect at the time of the
    // click.
    try {
      await apiClient.saveVisitedState(session, placeCategory, placeId, nextVisited);

      const settledPendingPlaceIdsForCategory = { ...nextPendingPlaceIdsForCategory };
      delete settledPendingPlaceIdsForCategory[placeId];
      return {
        visitedPlaceIdsForCategory: nextVisitedPlaceIdsForCategory,
        pendingPlaceIdsForCategory: settledPendingPlaceIdsForCategory,
        toastError: null,
      };
    } catch (error) {
      // 5.3: revert the optimistic update and surface a save error on
      // failure/timeout, but always clear the pending flag regardless of
      // outcome.
      const revertedVisitedPlaceIdsForCategory = { ...nextVisitedPlaceIdsForCategory };
      if (wasVisited) {
        revertedVisitedPlaceIdsForCategory[placeId] = true;
      } else {
        delete revertedVisitedPlaceIdsForCategory[placeId];
      }

      const settledPendingPlaceIdsForCategory = { ...nextPendingPlaceIdsForCategory };
      delete settledPendingPlaceIdsForCategory[placeId];

      return {
        visitedPlaceIdsForCategory: revertedVisitedPlaceIdsForCategory,
        pendingPlaceIdsForCategory: settledPendingPlaceIdsForCategory,
        toastError: error || { kind: 'FAILURE' },
      };
    }
  }

  return {
    visitedPlaceIdsForCategory: nextVisitedPlaceIdsForCategory,
    pendingPlaceIdsForCategory: nextPendingPlaceIdsForCategory,
    settle,
  };
}
