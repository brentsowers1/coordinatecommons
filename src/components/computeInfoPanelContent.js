// Pure content derivation for the State_Info_Panel (design.md: "StateInfoPanel",
// Properties 18, 19, 20).
//
// This function knows nothing about hover vs. click, device capability, or
// how `infoPanelStateId` was set — it is purely a function of the current
// target and the two shared-state maps (`regionsById`, `visitedStateIds`).
// Device-capability branching (Requirement 10.8) lives entirely in the
// `StateInfoPanel` component (task 15.5), keeping `computeInfoPanelContent`
// agnostic per design.md's note on Property 21.

/**
 * @typedef {import('../data/stateBoundaries').Region} Region
 *
 * @typedef {{ stateId: null }} InfoPanelPlaceholderContent
 * @typedef {{ stateId: string, name: string, visited: boolean }} InfoPanelTargetedContent
 */

/**
 * Determines what the State_Info_Panel should display right now.
 *
 * - When `infoPanelStateId` is `null`, always returns the neutral
 *   placeholder `{ stateId: null }` (Requirements 10.3, 10.5; Property 19).
 * - When `infoPanelStateId` identifies a known region in `regionsById`,
 *   returns that region's `name` and a `visited` flag equal to its
 *   membership in `visitedStateIds` (Requirements 10.2, 10.4; Property 18).
 *   Because this is a pure function re-evaluated on every render, a
 *   `visitedStateIds` change alone changes the returned `visited` flag for
 *   the same `infoPanelStateId`, with `stateId`/`name` unchanged
 *   (Requirement 10.6; Property 20).
 * - Defensively, when `infoPanelStateId` is non-null but not found in
 *   `regionsById` (shouldn't normally happen — `infoPanelStateId` is only
 *   ever set to a `stateId` resolved from the loaded regions — but could
 *   arise from a stale id if `regionsById` is ever repopulated), falls back
 *   to the placeholder `{ stateId: null }` rather than displaying a
 *   name-less/incomplete panel.
 *
 * @param {string | null} infoPanelStateId - the currently targeted region's
 *   `stateId`, or `null` if nothing is targeted.
 * @param {Object.<string, Region>} regionsById - lookup of `stateId` to
 *   `Region`, keyed the same way as the loaded region list.
 * @param {Object.<string, boolean>} visitedStateIds - current visited-state
 *   membership map.
 * @returns {InfoPanelPlaceholderContent | InfoPanelTargetedContent}
 */
export function computeInfoPanelContent(infoPanelStateId, regionsById, visitedStateIds) {
  if (infoPanelStateId == null) {
    return { stateId: null };
  }

  const region =
    regionsById != null
      ? Object.prototype.hasOwnProperty.call(regionsById, infoPanelStateId)
        ? regionsById[infoPanelStateId]
        : undefined
      : undefined;

  if (region == null) {
    // Defensive fallback: an unresolvable target is treated as no target.
    return { stateId: null };
  }

  const visited =
    visitedStateIds != null &&
    Object.prototype.hasOwnProperty.call(visitedStateIds, infoPanelStateId);

  return {
    stateId: infoPanelStateId,
    name: region.name,
    visited,
  };
}
