/**
 * Fill-color derivation for State_Boundary polygons (design.md:
 * "StateBoundaryOverlay", Property 14).
 *
 * Two fixed, distinct colors: one for a Visited_State, one for a
 * State_Boundary that is not a Visited_State. Membership in
 * `visitedStateIds` is the sole determinant of which color is returned
 * (Requirements 6.1, 6.3).
 */

// A visually distinct green used for a State_Boundary that is a
// Visited_State.
export const VISITED_FILL_COLOR = '#2e7d32';

// A neutral gray used for a State_Boundary that is not a Visited_State,
// including when its visited status is not yet available (Requirement 6.3).
export const NOT_VISITED_FILL_COLOR = '#9e9e9e';

/**
 * Pure function returning the fill color for a given `stateId` based solely
 * on whether it is an own key of `visitedStateIds`.
 *
 * @param {string} stateId
 * @param {Object.<string, boolean>} visitedStateIds
 * @returns {string} VISITED_FILL_COLOR if `stateId` is an own key of
 *   `visitedStateIds`, otherwise NOT_VISITED_FILL_COLOR.
 */
export function resolveFillColor(stateId, visitedStateIds) {
  const isVisited =
    visitedStateIds != null &&
    Object.prototype.hasOwnProperty.call(visitedStateIds, stateId);

  return isVisited ? VISITED_FILL_COLOR : NOT_VISITED_FILL_COLOR;
}
