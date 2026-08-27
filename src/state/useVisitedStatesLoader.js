/**
 * Visited-states load-on-mount hook (design.md: sibling to `useRegionsLoader()`
 * and `useGoogleMapsLoader()`; Requirement 4 - "Loading Visited States on
 * Startup").
 *
 * Placement note: this hook lives in `src/state/` (alongside `sharedState.js`)
 * rather than `src/services/` or `src/components/`. `useGoogleMapsLoader()`
 * (src/components/) loads a script the Map_View component itself renders
 * against, and `useRegionsLoader()` (src/data/) loads the static reference
 * data it lives next to. This hook's entire purpose, by contrast, is to load
 * data *into* the Shared_State_Store (`useVisitedStateIds` in
 * sharedState.js) -- so it sits next to the shared-state module it
 * coordinates with, rather than next to `visitRecordApiClient.js` (the thing
 * it calls, which remains in `src/services/`).
 *
 * `session` is accepted as a parameter rather than this hook calling
 * `useSession()` internally, to keep it testable/pure at the boundary --
 * consistent with this codebase's other pure-ish, directly-testable units
 * (`handleStateBoundaryClick`, `sessionHandlers.js`,
 * `resolveRegionAtLatLng`). Callers (e.g. MapView) pass in the session they
 * already read from `useSession()`.
 *
 * Scope of this task (8.1): only the authenticated load-on-mount effect and
 * the status/retry plumbing.
 *   - `listVisitedStates()` (src/services/visitRecordApiClient.js) already
 *     enforces its own 10-second timeout internally via AbortController and
 *     rejects with `{ kind: 'AUTH_ERROR' | 'TIMEOUT' | 'FAILURE' }`, so this
 *     hook does not add a second timeout layer -- any rejection is simply
 *     treated as `status: 'error'` (Requirements 4.1, 4.2, 4.5; the specific
 *     timeout UI/retry unit tests are covered by task 8.6).
 *
 * Task 8.4: the guest (no-session) path (Requirement 4.7; Property 9:
 * "Guest initialization never calls the API and preserves local marks").
 * When `session` is falsy the effect below returns immediately after
 * setting `status` to `'ready'` -- it deliberately never calls
 * `setVisitedStateIds` on that branch. Because React only changes a piece
 * of state when its setter is called, never calling `setVisitedStateIds`
 * for a guest is what *makes* the guarantee hold: this hook's
 * `visitedStateIds` is left at whatever value it already had -- the
 * initial `{}` on first mount, or whatever an earlier authenticated load
 * last resolved to if `session` later became falsy (e.g. logout) -- and
 * zero calls reach `listVisitedStates`/`fetch`.
 *
 * Note on what "local marks" actually refers to here: this hook's own
 * `visitedStateIds` state is a private copy used only to shape and expose
 * the result of *this hook's* authenticated load; it is a separate piece
 * of state from the shared `useVisitedStateIds` hook in sharedState.js.
 * The marks a guest actually makes by clicking a State_Boundary are read
 * and written directly against `useVisitedStateIds` by
 * `StateBoundaryOverlay`/`handleStateBoundaryClick.js` -- this loader hook
 * is never in that path and has no setter for the shared store at all (it
 * doesn't import `useVisitedStateIds`). So Property 9's "preserves local
 * marks" guarantee holds twice over, for two different reasons depending
 * on which `visitedStateIds` one means: the shared-state guest marks are
 * preserved architecturally (this hook simply never touches them), and
 * this hook's own internal `visitedStateIds` is preserved because its
 * guest branch never calls its setter.
 *
 * Task 8.2: the load-success handler. `listVisitedStates` resolves with a
 * raw `stateId[]` array; this hook shapes that into the `VisitedStateIds`
 * map shape (`{ [stateId]: true }`) used throughout the rest of the app
 * (see sharedState.js's `useVisitedStateIds` and
 * `handleStateBoundaryClick.js`), via the pure `toVisitedStateIdsMap` helper
 * below. The resulting map completely replaces whatever `visitedStateIds`
 * held before -- it is never merged with the prior value (Property 8).
 */

import React from 'react';
import { listVisitedStates } from '../services/visitRecordApiClient';

/**
 * Pure load-success shaping helper (Property 8): converts the raw list of
 * `stateId`s returned by the Visit_Record_API into the `VisitedStateIds`
 * map shape (`{ [stateId]: true }`), independent of whatever was present
 * before. An empty input list yields an empty map (`{}`).
 *
 * @param {string[]} stateIds
 * @returns {{ [stateId: string]: true }}
 */
export function toVisitedStateIdsMap(stateIds) {
  const visitedStateIdsMap = {};
  stateIds.forEach((stateId) => {
    visitedStateIdsMap[stateId] = true;
  });
  return visitedStateIdsMap;
}

/**
 * @param {object|null} session - the current Session (or null if signed out).
 * @returns {{
 *   status: 'loading' | 'ready' | 'error',
 *   visitedStateIds: { [stateId: string]: true },
 *   retry: () => void,
 * }}
 */
export function useVisitedStatesLoader(session) {
  const [status, setStatus] = React.useState(session ? 'loading' : 'ready');
  const [visitedStateIds, setVisitedStateIds] = React.useState({});
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!session) {
      // Guest path (Requirement 4.7; Property 9). Intentionally issues
      // zero calls to listVisitedStates/fetch, and intentionally does NOT
      // call setVisitedStateIds -- leaving visitedStateIds exactly as it
      // was (its initial {} on first mount, or whatever value it already
      // held, e.g. if session transitioned from populated to falsy). Only
      // `status` transitions, so the caller isn't left stuck showing a
      // loading indicator for a guest.
      setStatus('ready');
      return undefined;
    }

    let cancelled = false;
    setStatus('loading');

    listVisitedStates(session)
      .then((stateIds) => {
        if (!cancelled) {
          // Load-success handler (Property 8): replace visitedStateIds
          // entirely with exactly what the API returned, shaped into the
          // map form the rest of the app expects.
          setVisitedStateIds(toVisitedStateIdsMap(stateIds));
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session, attempt]);

  const retry = React.useCallback(() => {
    setAttempt((previousAttempt) => previousAttempt + 1);
  }, []);

  return { status, visitedStateIds, retry };
}
