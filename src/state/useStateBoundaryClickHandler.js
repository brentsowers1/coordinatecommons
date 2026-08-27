/**
 * Wires the pure `handleStateBoundaryClick` orchestration function
 * (src/components/handleStateBoundaryClick.js) to the Shared_State_Store
 * (design.md: "Toggle Handler (`handleStateBoundaryClick`)"; "Toggle
 * Sequence" mermaid diagram; task 14.6).
 *
 * Placement note: this hook lives in `src/state/` (alongside
 * `sharedState.js` and `useVisitedStatesLoader.js`) rather than
 * `src/components/`, for the same reason `useVisitedStatesLoader.js` does
 * (see that file's comment): its entire purpose is to read/write the
 * Shared_State_Store, not to render anything. `handleStateBoundaryClick`
 * itself stays a pure, DOM-free function in `src/components/` (it doesn't
 * touch React state at all); this hook is the thin, stateful glue between
 * it and `useSession`/`useVisitedStateIds`/`usePendingStateIds`/
 * `useToastError`, matching the "pure orchestration functions + thin
 * wiring in components/hooks" pattern used throughout this codebase.
 *
 * `apiClient` is accepted as an optional parameter (defaulting to the real
 * `visitRecordApiClient.saveVisitedState`) purely so this hook stays
 * testable/mockable, consistent with `handleStateBoundaryClick` itself
 * accepting `apiClient` rather than importing the client module directly.
 *
 * Stale-closure handling: `MapView` (the only current caller) re-renders
 * whenever `useSession`/`useVisitedStateIds`/`usePendingStateIds` change
 * (it's subscribed to all three), and the callback returned here is
 * recreated -- via `useCallback`'s dependency array -- every time any of
 * those values change. `StateBoundaryOverlay` (task 12.5) already stores
 * whatever `onStateBoundaryClick` it's given in a ref that it re-assigns
 * on every render (`onStateBoundaryClickRef.current = onStateBoundaryClick`),
 * so its map-level click listener -- registered once and never
 * re-registered -- always invokes the *latest* callback, which in turn
 * always closes over the *latest* `session`/`visitedStateIds`/
 * `pendingStateIds`. Between them, neither side is left holding a stale
 * value.
 */

import React from 'react';
import {
  useSession,
  useVisitedStateIds,
  usePendingStateIds,
  useToastError,
} from './sharedState';
import { handleStateBoundaryClick } from '../components/handleStateBoundaryClick';
import { saveVisitedState } from '../services/visitRecordApiClient';

const defaultApiClient = { saveVisitedState };

/**
 * @param {{ saveVisitedState: (session: any, stateId: string, visited: boolean) => Promise<any> }} [apiClient]
 *   defaults to the real `visitRecordApiClient`; override in tests.
 * @returns {(stateId: string) => void} a stable-identity-per-render-of-current-state
 *   callback suitable for `StateBoundaryOverlay`'s `onStateBoundaryClick` prop.
 */
export function useStateBoundaryClickHandler(apiClient = defaultApiClient) {
  const [session] = useSession();
  const [visitedStateIds, setVisitedStateIds] = useVisitedStateIds();
  const [pendingStateIds, setPendingStateIds] = usePendingStateIds();
  const [, setToastError] = useToastError();

  return React.useCallback(
    (stateId) => {
      const result = handleStateBoundaryClick(
        session,
        visitedStateIds,
        pendingStateIds,
        stateId,
        apiClient
      );

      // 5.4: already pending -- handleStateBoundaryClick signals a
      // complete no-op with null; apply nothing.
      if (result == null) {
        return;
      }

      // Apply the optimistic update immediately.
      setVisitedStateIds(result.visitedStateIds);
      setPendingStateIds(result.pendingStateIds);

      // Once the (session-gated) save call settles, apply its resolved
      // state, and surface a toast error if the save failed/timed out and
      // was reverted (Requirements 5.3, 9.4).
      result.settle().then((settled) => {
        setVisitedStateIds(settled.visitedStateIds);
        setPendingStateIds(settled.pendingStateIds);
        if (settled.toastError != null) {
          setToastError(settled.toastError);
        }
      });
    },
    [
      session,
      visitedStateIds,
      pendingStateIds,
      apiClient,
      setVisitedStateIds,
      setPendingStateIds,
      setToastError,
    ]
  );
}
