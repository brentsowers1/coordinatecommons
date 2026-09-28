/**
 * Fill-color derivation for Place_Boundary polygons (design.md:
 * "StateBoundaryOverlay", Property 14).
 *
 * Two fixed, distinct colors: one for a Visited_Place, one for a
 * Place_Boundary that is not a Visited_Place. Membership in
 * `visitedPlaceIds` -- the current category's slice of
 * `visitedPlaceIdsByCategory`, not the whole by-category structure -- is the
 * sole determinant of which color is returned (Requirements 6.1, 6.3, 15.3).
 */

// A visually distinct green used for a Place_Boundary that is a
// Visited_Place.
export const VISITED_FILL_COLOR = '#2e7d32';

// A neutral gray used for a Place_Boundary that is not a Visited_Place,
// including when its visited status is not yet available (Requirement 6.3).
export const NOT_VISITED_FILL_COLOR = '#9e9e9e';

/**
 * Pure function returning the fill color for a given `placeId` based solely
 * on whether it is an own key of `visitedPlaceIds`, the single already-
 * selected category's slice of visited place IDs (not the whole
 * by-category structure).
 *
 * @param {string} placeId
 * @param {Object.<string, boolean>} visitedPlaceIds
 * @returns {string} VISITED_FILL_COLOR if `placeId` is an own key of
 *   `visitedPlaceIds`, otherwise NOT_VISITED_FILL_COLOR.
 */
export function resolveFillColor(placeId, visitedPlaceIds) {
  const isVisited =
    visitedPlaceIds != null &&
    Object.prototype.hasOwnProperty.call(visitedPlaceIds, placeId);

  return isVisited ? VISITED_FILL_COLOR : NOT_VISITED_FILL_COLOR;
}
