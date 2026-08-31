// State_Info_Panel component (design.md: "StateInfoPanel"; Requirements
// 10.1, 10.7, 10.8).
//
// Scope note (task 15.5): this task implements the panel itself only.
//   - Rendering: a fixed-position `<div>` below the map -- NOT a tooltip
//     and NOT positioned relative to the cursor (Requirement 10.1). The
//     panel's *content* is derived entirely by the already-implemented,
//     pure `computeInfoPanelContent` (task 15.1), which this component
//     calls with `infoPanelStateId` (from `useInfoPanelStateId`),
//     `regionsById` (built here from the `regions` prop), and
//     `visitedStateIds` (from `useVisitedStateIds`).
//   - This component does NOT attach any listeners to the map itself.
//     Setting `useInfoPanelStateId` from mousemove/mouseout (hover-capable
//     devices) or from click (touch-only devices) is `StateBoundaryOverlay`'s
//     responsibility (tasks 12.5 and 14.6) -- this component only *reads*
//     `useInfoPanelStateId`, it never writes to it.
//   - Device-capability detection: design.md notes that whether
//     `infoPanelStateId` is driven by hover or by click is "the only place
//     device capability is branched," and that detection happens once via
//     `matchMedia('(hover: hover) and (pointer: fine)')`. Since the actual
//     branching (which map event to listen for) lives in
//     `StateBoundaryOverlay`, not here, this file exposes that detection as
//     a small reusable hook, `useIsHoverCapable()`, for
//     `StateBoundaryOverlay` to import and use later. This is the
//     connection point between the two components/tasks: both must agree
//     on the same detection so the device is classified consistently.
//   - Available regardless of authentication state (Requirement 10.7):
//     this component does not read `useSession` at all, so nothing here
//     gates rendering on auth state.

import React from 'react';
import { useInfoPanelStateId, useVisitedStateIds, usePendingStateIds } from '../state/sharedState';
import { computeInfoPanelContent } from './computeInfoPanelContent';

/**
 * Detects, once per component instance, whether the current input device
 * supports hover with a fine (mouse-like) pointer.
 *
 * Per design.md ("StateInfoPanel"), this is the single detection point
 * consulted to decide whether `useInfoPanelStateId` should be driven by
 * hover (mousemove/mouseout on the map) or by click, consistent with
 * Requirement 10.8. `StateInfoPanel` itself only *reads* the result to
 * decide nothing here (it never writes `useInfoPanelStateId`); the actual
 * event wiring that branches on this value lives in
 * `StateBoundaryOverlay` (tasks 12.5/14.6), which should import and call
 * this same hook rather than re-implementing the `matchMedia` check, so
 * both components agree on the same classification for a given device.
 *
 * Falls back to `true` (treat as hover-capable) when `matchMedia` isn't
 * available (e.g. some non-browser test environments), since that is the
 * more common/default input mode and preserves existing hover behavior
 * rather than silently switching everything to click-driven.
 *
 * @returns {boolean} `true` if the device supports hover with a fine
 *   pointer (e.g. a mouse); `false` for touch-only devices.
 */
export function useIsHoverCapable() {
  const [isHoverCapable] = React.useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  });

  return isHoverCapable;
}

/**
 * Builds a `stateId -> Region` lookup from the loaded region list, the
 * shape `computeInfoPanelContent` expects for its `regionsById` parameter.
 *
 * @param {import('../data/stateBoundaries').Region[]} regions
 * @returns {Object.<string, import('../data/stateBoundaries').Region>}
 */
function buildRegionsById(regions) {
  const regionsById = {};
  for (const region of regions) {
    regionsById[region.stateId] = region;
  }
  return regionsById;
}

/**
 * The State_Info_Panel (Requirement 10).
 *
 * Rendered in a fixed area below the map -- a plain, statically/relatively
 * positioned block, not a tooltip and not attached to the cursor
 * (Requirement 10.1). Always renders (no auth gating), so it is usable by
 * both authenticated and unauthenticated visitors (Requirement 10.7).
 *
 * `StateInfoPanel` doesn't own the loaded region list itself -- it is
 * fetched by `useRegionsLoader()` and owned by `MapView` -- so the caller
 * (e.g. `MapView`) passes the current `regions` array down as a prop.
 *
 * @param {Object} props
 * @param {import('../data/stateBoundaries').Region[]} [props.regions] - the
 *   currently loaded region list (defaults to `[]` before/if regions
 *   haven't loaded yet, in which case any `infoPanelStateId` simply
 *   resolves to the neutral placeholder via `computeInfoPanelContent`).
 */
export function StateInfoPanel({ regions = [] }) {
  const [infoPanelStateId] = useInfoPanelStateId();
  const [visitedStateIds] = useVisitedStateIds();
  const [pendingStateIds] = usePendingStateIds();

  const regionsById = React.useMemo(() => buildRegionsById(regions), [regions]);

  const content = computeInfoPanelContent(infoPanelStateId, regionsById, visitedStateIds);

  // "Saving..." indicator: surfaces the in-flight-save lifecycle that
  // `usePendingStateIds`/`useStateBoundaryClickHandler` already track
  // internally, but which nothing previously rendered -- so a user (or a
  // test) had no way to distinguish "optimistically toggled, save still
  // in flight" from "save confirmed" (design.md's "Toggle Sequence";
  // Requirements 5.1/5.2). Only true when the CURRENTLY TARGETED state is
  // itself pending; a save for some other, non-targeted state must not
  // light this up.
  //
  // Implementation choice: a separate element with its own
  // `data-testid="state-info-panel-saving"`, rather than appending text
  // (e.g. " (saving...)") onto the existing content paragraph. This keeps
  // `state-info-panel-content`'s text exactly
  // `` `${name} — ${visited ? 'Visited' : 'Not visited'}` `` unchanged for
  // every existing assertion (unit and e2e) that matches on that exact
  // string, and lets both Jest and Playwright assert presence/absence of
  // the indicator directly by test-id instead of doing fragile substring
  // matching against a combined content string.
  const isSaving = content.stateId != null && Object.prototype.hasOwnProperty.call(pendingStateIds, content.stateId);

  return (
    <div
      data-testid="state-info-panel"
      // Explicitly static positioning: this panel lives in the normal
      // document flow, below the map element that renders it as a
      // sibling/child of MapView -- it must never be `position: absolute`
      // or `position: fixed` tracking the cursor, which would make it a
      // tooltip (Requirement 10.1).
      style={{ position: 'static' }}
    >
      {content.stateId == null ? (
        <p data-testid="state-info-panel-placeholder">
          Hover over or click a state to see its name and visited status.
        </p>
      ) : (
        <p data-testid="state-info-panel-content">
          {content.name} &mdash; {content.visited ? 'Visited' : 'Not visited'}
        </p>
      )}
      {isSaving ? <p data-testid="state-info-panel-saving">Saving&hellip;</p> : null}
    </div>
  );
}
