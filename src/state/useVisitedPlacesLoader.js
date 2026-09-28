/**
 * Visited-places load-on-mount hook (design.md: sibling to `usePlaceBoundariesLoader()`
 * and `useGoogleMapsLoader()`; Requirement 4 - "Loading Visited States on
 * Startup"; generalized to be Place_Category-aware per Requirement 14.5 and
 * 15.7 -- see design.md's "Place Category Data Loading (`useVisitedPlacesLoader`,
 * per-category caching, stale-request discard)" section).
 *
 * Placement note: this hook lives in `src/state/` (alongside `sharedState.js`)
 * rather than `src/services/` or `src/components/`. `useGoogleMapsLoader()`
 * (src/components/) loads a script the Map_View component itself renders
 * against, and `usePlaceBoundariesLoader()` (src/data/) loads the static reference
 * data it lives next to. This hook's entire purpose, by contrast, is to load
 * data *into* the Shared_State_Store (the per-category slices of
 * `useVisitedPlaceIdsByCategory` in sharedState.js, per task 21.1) -- so it
 * sits next to the shared-state module it
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
 * Deviation from design.md's `useVisitedPlacesLoader(placeCategory)` snippet:
 * this hook takes `session` as an explicit first parameter --
 * `useVisitedPlacesLoader(session, placeCategory)` -- rather than only
 * `placeCategory`. The design's own snippet is incomplete on this point (it
 * omits how the hook would know whether to call the API at all for the
 * guest path), and the surrounding "Place Category Switch Sequence" section
 * already implies a session is available to it. Keeping `session` as an
 * explicit parameter (rather than this hook calling `useSession()`
 * internally) preserves the existing testability convention described
 * above.
 *
 * Task 21.9: renamed from `useVisitedStatesLoader(session)` to
 * `useVisitedPlacesLoader(session, placeCategory)`, and its returned
 * `visitedStateIds` field renamed to `visitedPlaceIds` (matching the
 * generalized naming used by `usePlaceBoundariesLoader`'s `placeBoundaries`
 * field). Adds per-category caching (Requirement 14.5), mirroring the
 * `boundaryCacheByCategory` pattern already established by
 * `usePlaceBoundariesLoader` (src/data/placeBoundaries.js) -- see
 * `visitedPlacesCacheByCategory` below. Existing `'us-state'` behavior
 * (load-on-mount, guest path, load-success replace, retry) is unchanged
 * when called with `placeCategory: 'us-state'`.
 *
 * Task 8.1: the authenticated load-on-mount effect and the status/retry
 * plumbing.
 *   - `listVisitedPlaces()` (src/services/visitRecordApiClient.js) already
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
 * `setVisitedPlaceIds` on that branch. Because React only changes a piece
 * of state when its setter is called, never calling `setVisitedPlaceIds`
 * for a guest is what *makes* the guarantee hold: this hook's
 * `visitedPlaceIds` is left at whatever value it already had -- the
 * initial `{}` on first mount, or whatever an earlier authenticated load
 * last resolved to if `session` later became falsy (e.g. logout) -- and
 * zero calls reach `listVisitedPlaces`/`fetch`. Per-category caching below
 * does not apply to the guest path either: a guest never populates
 * `visitedPlacesCacheByCategory`, so there is nothing to reuse and nothing
 * shared across hook instances for that path (see the module-level cache
 * comment below for why this matters for Property 9).
 *
 * Note on what "local marks" actually refers to here: this hook's own
 * `visitedPlaceIds` state is a private copy used only to shape and expose
 * the result of *this hook's* authenticated load; it is a separate piece
 * of state from the shared `useVisitedPlaceIdsByCategory` hook in
 * sharedState.js. The marks a guest actually makes by clicking a
 * State_Boundary are read and written directly against the relevant
 * slice of `useVisitedPlaceIdsByCategory` by
 * `StateBoundaryOverlay`/`handleStateBoundaryClick.js` -- this loader hook
 * is never in that path and has no setter for the shared store at all (it
 * doesn't import `useVisitedPlaceIdsByCategory`). So Property 9's "preserves local
 * marks" guarantee holds twice over, for two different reasons depending
 * on which `visitedPlaceIds` one means: the shared-state guest marks are
 * preserved architecturally (this hook simply never touches them), and
 * this hook's own internal `visitedPlaceIds` is preserved because its
 * guest branch never calls its setter.
 *
 * Task 8.2: the load-success handler. `listVisitedPlaces` resolves with a
 * raw `placeId[]` array; this hook shapes that into the `VisitedPlaceIds`
 * map shape (`{ [placeId]: true }`) used throughout the rest of the app
 * (see sharedState.js's `useVisitedPlaceIdsByCategory` and
 * `handleStateBoundaryClick.js`), via the pure `toVisitedStateIdsMap` helper
 * below. The resulting map completely replaces whatever `visitedPlaceIds`
 * held before -- it is never merged with the prior value (Property 8).
 */

import React from 'react';
import { listVisitedPlaces } from '../services/visitRecordApiClient';

/**
 * Pure load-success shaping helper (Property 8): converts the raw list of
 * `placeId`s returned by the Visit_Record_API into the `VisitedPlaceIds`
 * map shape (`{ [placeId]: true }`), independent of whatever was present
 * before. An empty input list yields an empty map (`{}`).
 *
 * Kept under its original name (`toVisitedStateIdsMap`) rather than
 * renamed, since it is imported directly by this module's test file and
 * the underlying shaping logic is category-agnostic (it operates on
 * whatever placeId list it's given, regardless of Place_Category).
 *
 * @param {string[]} placeIds
 * @returns {{ [placeId: string]: true }}
 */
export function toVisitedStateIdsMap(placeIds) {
  const visitedPlaceIdsMap = {};
  placeIds.forEach((placeId) => {
    visitedPlaceIdsMap[placeId] = true;
  });
  return visitedPlaceIdsMap;
}

/**
 * Module-level cache of already-successfully-loaded results, keyed by
 * `placeCategory`. Persists across component mounts/unmounts within the
 * same page session (it is NOT component state), so that mounting
 * `useVisitedPlacesLoader(session, placeCategory)` a second time for a
 * category that already successfully loaded (for an authenticated session)
 * reuses the cached `visitedPlaceIds` instead of re-issuing
 * `listVisitedPlaces` (Requirement 14.5). Mirrors
 * `boundaryCacheByCategory` in src/data/placeBoundaries.js.
 *
 * Only successful *authenticated* loads are cached -- a category that
 * errored is not cached, so a fresh mount (or `retry()`) re-attempts the
 * request. The guest path never reads or writes this cache at all (see
 * the module doc comment above): caching a guest's empty/no-op result
 * here would risk a later authenticated mount for the same category
 * incorrectly reusing it, so guest loads are kept entirely out of this
 * cache.
 *
 * @type {Map<string, { status: 'ready', visitedPlaceIds: { [placeId: string]: true } }>}
 */
const visitedPlacesCacheByCategory = new Map();

/**
 * Module-level map of in-flight `listVisitedPlaces` promises, keyed by
 * `placeCategory`. `visitedPlacesCacheByCategory` above only ever holds
 * *completed* (`status: 'ready'`) results, so on its own it cannot prevent
 * two hook instances mounted concurrently for the same not-yet-loaded
 * category (e.g. two components both wanting `'canada-state'` data) from
 * each independently seeing "not cached yet" and issuing their own
 * `listVisitedPlaces` call for that category at the same time.
 *
 * This map closes that gap: the first mount for a category to reach the
 * effect stores its in-progress promise here; any other mount for the
 * same category that reaches the effect while that promise is still
 * pending reuses (awaits) it instead of calling `listVisitedPlaces` again
 * (Requirement 14.2/14.5 -- "skip re-issuing listVisitedPlaces for a
 * category already ready or currently loading"). The entry is removed
 * once the request settles (success or failure), regardless of outcome,
 * so a later `retry()` or a fresh mount after a failure issues a new
 * request rather than reusing a stale rejected promise.
 *
 * @type {Map<string, Promise<string[]>>}
 */
const inFlightRequestsByCategory = new Map();

/**
 * @param {object|null} session - the current Session (or null if signed out).
 * @param {'us-state' | 'canada-state' | 'country'} placeCategory
 * @returns {{
 *   status: 'loading' | 'ready' | 'error',
 *   visitedPlaceIds: { [placeId: string]: true },
 *   retry: () => void,
 * }}
 */
export function useVisitedPlacesLoader(session, placeCategory) {
  const cached = visitedPlacesCacheByCategory.get(placeCategory);

  const [status, setStatus] = React.useState(() => {
    if (cached) {
      return 'ready';
    }
    return session ? 'loading' : 'ready';
  });
  const [visitedPlaceIds, setVisitedPlaceIds] = React.useState(
    cached ? cached.visitedPlaceIds : {}
  );
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!session) {
      // Guest path (Requirement 4.7; Property 9). Intentionally issues
      // zero calls to listVisitedPlaces/fetch, and intentionally does NOT
      // call setVisitedPlaceIds -- leaving visitedPlaceIds exactly as it
      // was (its initial {} on first mount, or whatever value it already
      // held, e.g. if session transitioned from populated to falsy). Only
      // `status` transitions, so the caller isn't left stuck showing a
      // loading indicator for a guest.
      setStatus('ready');
      return undefined;
    }

    // Reuse the cached result for this category rather than re-fetching
    // (Requirement 14.5).
    const alreadyCached = visitedPlacesCacheByCategory.get(placeCategory);
    if (alreadyCached) {
      setVisitedPlaceIds(alreadyCached.visitedPlaceIds);
      setStatus('ready');
      return undefined;
    }

    let cancelled = false;
    setStatus('loading');

    // Reuse an already-in-flight request for this category instead of
    // issuing a second one (see inFlightRequestsByCategory's doc comment
    // above). If no request is currently pending for this category, issue
    // one now and record it before anything can await it, so a
    // concurrently-mounting second instance for the same category sees it
    // on its own effect run.
    let requestPromise = inFlightRequestsByCategory.get(placeCategory);
    if (!requestPromise) {
      requestPromise = listVisitedPlaces(session, placeCategory);
      inFlightRequestsByCategory.set(placeCategory, requestPromise);
      // Cleanup only; deliberately not chained onto requestPromise itself
      // (which is returned/awaited by every mount for this category) --
      // attaching a bare .finally() here without its own rejection handler
      // would otherwise create an unhandled-rejection on request failure.
      requestPromise.then(
        () => inFlightRequestsByCategory.delete(placeCategory),
        () => inFlightRequestsByCategory.delete(placeCategory)
      );
    }

    requestPromise
      .then((placeIds) => {
        if (!cancelled) {
          // Load-success handler (Property 8): replace visitedPlaceIds
          // entirely with exactly what the API returned, shaped into the
          // map form the rest of the app expects.
          const nextVisitedPlaceIds = toVisitedStateIdsMap(placeIds);
          visitedPlacesCacheByCategory.set(placeCategory, {
            status: 'ready',
            visitedPlaceIds: nextVisitedPlaceIds,
          });
          setVisitedPlaceIds(nextVisitedPlaceIds);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, placeCategory, attempt]);

  const retry = React.useCallback(() => {
    // Discard any cached result for this category too, so retry() always
    // re-fetches from scratch rather than immediately re-reporting the
    // same cached data (matches usePlaceBoundariesLoader's retry()
    // contract).
    visitedPlacesCacheByCategory.delete(placeCategory);
    setAttempt((previousAttempt) => previousAttempt + 1);
  }, [placeCategory]);

  return { status, visitedPlaceIds, retry };
}
