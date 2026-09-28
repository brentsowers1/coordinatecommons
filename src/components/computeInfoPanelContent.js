// Pure content derivation for the Place_Info_Panel (design.md: "PlaceInfoPanel",
// Properties 18, 19, 20).
//
// This function knows nothing about hover vs. click, device capability, or
// how `infoPanelPlaceId` was set — it is purely a function of the current
// target and the two shared-state maps (`placeBoundariesById`,
// `visitedPlaceIds`). Device-capability branching (Requirement 10.8) lives
// entirely in the `PlaceInfoPanel` component (task 15.5), keeping
// `computeInfoPanelContent` agnostic per design.md's note on Property 21.

/**
 * @typedef {import('../data/placeBoundaries').PlaceBoundary} Region
 *
 * @typedef {{ placeId: null }} InfoPanelPlaceholderContent
 * @typedef {{ placeId: string, name: string, visited: boolean }} InfoPanelTargetedContent
 */

/**
 * Determines what the Place_Info_Panel should display right now.
 *
 * - When `infoPanelPlaceId` is `null`, always returns the neutral
 *   placeholder `{ placeId: null }` (Requirements 10.3, 10.5; Property 19).
 * - When `infoPanelPlaceId` identifies a known region in
 *   `placeBoundariesById`, returns that region's `name` and a `visited`
 *   flag equal to its membership in `visitedPlaceIds` (Requirements 10.2,
 *   10.4; Property 18). Because this is a pure function re-evaluated on
 *   every render, a `visitedPlaceIds` change alone changes the returned
 *   `visited` flag for the same `infoPanelPlaceId`, with `placeId`/`name`
 *   unchanged (Requirement 10.6; Property 20).
 * - Defensively, when `infoPanelPlaceId` is non-null but not found in
 *   `placeBoundariesById` (shouldn't normally happen — `infoPanelPlaceId`
 *   is only ever set to a `placeId` resolved from the loaded regions — but
 *   could arise from a stale id if `placeBoundariesById` is ever
 *   repopulated), falls back to the placeholder `{ placeId: null }` rather
 *   than displaying a name-less/incomplete panel.
 *
 * @param {string | null} infoPanelPlaceId - the currently targeted region's
 *   `placeId`, or `null` if nothing is targeted.
 * @param {Object.<string, Region>} placeBoundariesById - lookup of
 *   `placeId` to `Region`, keyed the same way as the loaded region list.
 * @param {Object.<string, boolean>} visitedPlaceIds - current visited-place
 *   membership map.
 * @returns {InfoPanelPlaceholderContent | InfoPanelTargetedContent}
 */
export function computeInfoPanelContent(infoPanelPlaceId, placeBoundariesById, visitedPlaceIds) {
  if (infoPanelPlaceId == null) {
    return { placeId: null };
  }

  const region =
    placeBoundariesById != null
      ? Object.prototype.hasOwnProperty.call(placeBoundariesById, infoPanelPlaceId)
        ? placeBoundariesById[infoPanelPlaceId]
        : undefined
      : undefined;

  if (region == null) {
    // Defensive fallback: an unresolvable target is treated as no target.
    return { placeId: null };
  }

  const visited =
    visitedPlaceIds != null &&
    Object.prototype.hasOwnProperty.call(visitedPlaceIds, infoPanelPlaceId);

  return {
    placeId: infoPanelPlaceId,
    name: region.name,
    visited,
  };
}
