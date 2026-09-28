/**
 * Partitions a list of place boundaries into visited/not-visited lists for
 * the Place_Visit_Status_Lists component (design.md: "PlaceVisitStatusLists",
 * implemented as `PlaceVisitStatusLists`; Property 22).
 */

/**
 * Pure function splitting `placeBoundaries` into two arrays based solely on
 * whether each entry's `placeId` is an own key of `visitedPlaceIds`
 * (same membership-check pattern as `resolveFillColor.js`). Every entry
 * from the input appears in exactly one of the two output arrays -- none
 * omitted, none duplicated (Requirement 11.2; Property 22).
 *
 * Each output array is sorted alphabetically by `name` (`localeCompare`).
 * This ordering is a deliberate default for a stable, human-readable
 * list -- the spec doesn't mandate any particular order, so alphabetical
 * by name was chosen over `placeId` order or preserving input order.
 *
 * @param {import('../data/placeBoundaries').PlaceBoundary[]} placeBoundaries
 * @param {Object.<string, boolean>} visitedPlaceIds
 * @returns {{ visited: import('../data/placeBoundaries').PlaceBoundary[], notVisited: import('../data/placeBoundaries').PlaceBoundary[] }}
 */
export function partitionPlaceBoundariesByVisited(placeBoundaries, visitedPlaceIds) {
  const visited = [];
  const notVisited = [];

  for (const placeBoundary of placeBoundaries) {
    const isVisited =
      visitedPlaceIds != null &&
      Object.prototype.hasOwnProperty.call(visitedPlaceIds, placeBoundary.placeId);

    if (isVisited) {
      visited.push(placeBoundary);
    } else {
      notVisited.push(placeBoundary);
    }
  }

  visited.sort((a, b) => a.name.localeCompare(b.name));
  notVisited.sort((a, b) => a.name.localeCompare(b.name));

  return { visited, notVisited };
}
