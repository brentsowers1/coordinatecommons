// Toggle handler for a State_Boundary click (design.md: "Toggle Handler
// (`handleStateBoundaryClick`)").
//
// This is a *pure orchestration function*: it never touches the DOM, never
// reads/writes the `make-shared-state-hook` hooks directly, and never calls
// `fetch` itself. It only computes the next `{ visitedStateIds,
// pendingStateIds }` state synchronously, and hands back a `settle()`
// function the caller can invoke to actually perform the (session-gated)
// API call and find out how the state should look once that call resolves.
// This keeps it directly property-testable (design.md Properties 10, 11,
// 12, 13) without mocking React state or the DOM, and lets a component
// (e.g. `StateBoundaryOverlay`, task 14.6) or a test drive it with plain
// objects.
//
// Chosen return shape
// --------------------
// design.md describes the function as returning "the next
// `{ visitedStateIds, pendingStateIds }` and the API call to issue", which
// mixes a synchronous result (the optimistic update) with something
// inherently asynchronous (the save request and its revert-on-failure).
// Since design.md leaves the exact shape open, this implementation splits
// the two concerns explicitly:
//
//   handleStateBoundaryClick(session, visitedStateIds, pendingStateIds, stateId, apiClient)
//     -> null
//        when `stateId` is already in `pendingStateIds` (5.4): the caller
//        should treat the click as a complete no-op and apply nothing.
//
//     -> {
//          visitedStateIds: <new map with `stateId`'s membership flipped>,
//          pendingStateIds: <new map with `stateId` added>,
//          settle: () => Promise<{ visitedStateIds, pendingStateIds, toastError }>
//        }
//        otherwise. The caller SHOULD apply `visitedStateIds` and
//        `pendingStateIds` to its state immediately (the optimistic
//        update, 5.1/5.2/5.5/5.6), then call `settle()` and, once it
//        resolves, apply *its* `visitedStateIds`/`pendingStateIds` to
//        state as the final outcome of the click.
//
// `settle()`'s resolution shape:
//   {
//     visitedStateIds: <visitedStateIds to apply after the call settles>,
//     pendingStateIds: <pendingStateIds to apply after the call settles;
//                        always has `stateId` cleared>,
//     toastError: <a value to pass to useToastError, or null>
//   }
//
// - If `session` is present, `settle()` calls `apiClient.saveVisitedState`
//   with `visited` set to the new membership state, then:
//     - on success: resolves with the flipped `visitedStateIds` unchanged
//       and `stateId` cleared from `pendingStateIds`; `toastError: null`.
//     - on failure/timeout (any rejection from `saveVisitedState`):
//       resolves with `stateId` flipped *back* to its pre-click value in
//       `visitedStateIds`, `stateId` cleared from `pendingStateIds`, and a
//       non-null `toastError` describing the failure (5.3).
//   `settle()` never rejects; every outcome (success or failure) is
//   represented as a resolved value so the caller has one code path to
//   apply the result.
// - If `session` is absent, `settle()` skips the API call entirely (5.5,
//   5.6) and resolves immediately with the flipped `visitedStateIds`
//   unchanged and `stateId` cleared from `pendingStateIds`, `toastError:
//   null`.
//
// `apiClient` is accepted as a parameter (rather than importing
// `visitRecordApiClient` directly) purely so it is mockable by callers and
// tests (design.md's stated testability goal); it must expose at least a
// `saveVisitedState(session, stateId, visited)` function with the same
// contract as `src/services/visitRecordApiClient.js`.

/**
 * @typedef {Object.<string, true>} VisitedStateIds
 * @typedef {Object.<string, true>} PendingStateIds
 *
 * @typedef {Object} SettleResult
 * @property {VisitedStateIds} visitedStateIds
 * @property {PendingStateIds} pendingStateIds
 * @property {*} toastError - non-null when the save failed/timed out and
 *   the caller should surface an error to the user; otherwise null.
 *
 * @typedef {Object} HandleStateBoundaryClickResult
 * @property {VisitedStateIds} visitedStateIds - the optimistic next value.
 * @property {PendingStateIds} pendingStateIds - the optimistic next value,
 *   with `stateId` marked pending.
 * @property {() => Promise<SettleResult>} settle - performs the
 *   session-gated API call (if any) and resolves with the final state to
 *   apply once it settles.
 */

/**
 * Pure orchestration for the optimistic mark/unmark toggle (Requirements
 * 5.1, 5.2, 5.4, 5.5, 5.6).
 *
 * @param {{ accessToken: string } | null} session - the current Session, or
 *   `null` for an unauthenticated visitor.
 * @param {VisitedStateIds} visitedStateIds - current visited-state
 *   membership map.
 * @param {PendingStateIds} pendingStateIds - current pending-request
 *   membership map.
 * @param {string} stateId - the region that was clicked.
 * @param {{ saveVisitedState: (session: any, stateId: string, visited: boolean) => Promise<any> }} apiClient
 *   an object exposing at least `saveVisitedState`, matching
 *   `visitRecordApiClient`'s contract (rejects with
 *   `{ kind: 'AUTH_ERROR' | 'TIMEOUT' | 'FAILURE' }` on failure).
 * @returns {HandleStateBoundaryClickResult | null} `null` if `stateId` is
 *   already pending (5.4); otherwise the optimistic next state plus a
 *   `settle()` function.
 */
export function handleStateBoundaryClick(
  session,
  visitedStateIds,
  pendingStateIds,
  stateId,
  apiClient
) {
  // 5.4: ignore further clicks on a state while a request for it is
  // in-flight.
  if (pendingStateIds != null && Object.prototype.hasOwnProperty.call(pendingStateIds, stateId)) {
    return null;
  }

  const wasVisited =
    visitedStateIds != null && Object.prototype.hasOwnProperty.call(visitedStateIds, stateId);
  const nextVisited = !wasVisited;

  // Flip membership immediately (optimistic update).
  const nextVisitedStateIds = { ...visitedStateIds };
  if (nextVisited) {
    nextVisitedStateIds[stateId] = true;
  } else {
    delete nextVisitedStateIds[stateId];
  }

  // Mark this state pending immediately.
  const nextPendingStateIds = { ...pendingStateIds, [stateId]: true };

  async function settle() {
    // 5.5/5.6: unauthenticated visitors never trigger an API call.
    if (!session) {
      const settledPendingStateIds = { ...nextPendingStateIds };
      delete settledPendingStateIds[stateId];
      return {
        visitedStateIds: nextVisitedStateIds,
        pendingStateIds: settledPendingStateIds,
        toastError: null,
      };
    }

    // 5.1/5.2: authenticated visitors persist the new membership state.
    try {
      await apiClient.saveVisitedState(session, stateId, nextVisited);

      const settledPendingStateIds = { ...nextPendingStateIds };
      delete settledPendingStateIds[stateId];
      return {
        visitedStateIds: nextVisitedStateIds,
        pendingStateIds: settledPendingStateIds,
        toastError: null,
      };
    } catch (error) {
      // 5.3: revert the optimistic update and surface a save error on
      // failure/timeout, but always clear the pending flag regardless of
      // outcome.
      const revertedVisitedStateIds = { ...nextVisitedStateIds };
      if (wasVisited) {
        revertedVisitedStateIds[stateId] = true;
      } else {
        delete revertedVisitedStateIds[stateId];
      }

      const settledPendingStateIds = { ...nextPendingStateIds };
      delete settledPendingStateIds[stateId];

      return {
        visitedStateIds: revertedVisitedStateIds,
        pendingStateIds: settledPendingStateIds,
        toastError: error || { kind: 'FAILURE' },
      };
    }
  }

  return {
    visitedStateIds: nextVisitedStateIds,
    pendingStateIds: nextPendingStateIds,
    settle,
  };
}
