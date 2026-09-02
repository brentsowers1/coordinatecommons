/**
 * Partitions a list of regions into visited/not-visited lists for the
 * Visited_States_Lists component (design.md: "VisitedStatesLists",
 * Property 22).
 */

/**
 * Pure function splitting `regions` into two arrays based solely on
 * whether each region's `stateId` is an own key of `visitedStateIds`
 * (same membership-check pattern as `resolveFillColor.js`). Every region
 * from the input appears in exactly one of the two output arrays -- none
 * omitted, none duplicated (Requirement 11.2; Property 22).
 *
 * Each output array is sorted alphabetically by `name` (`localeCompare`).
 * This ordering is a deliberate default for a stable, human-readable
 * list -- the spec doesn't mandate any particular order, so alphabetical
 * by name was chosen over `stateId` order or preserving input order.
 *
 * @param {import('../data/stateBoundaries').Region[]} regions
 * @param {Object.<string, boolean>} visitedStateIds
 * @returns {{ visited: import('../data/stateBoundaries').Region[], notVisited: import('../data/stateBoundaries').Region[] }}
 */
export function partitionRegionsByVisited(regions, visitedStateIds) {
  const visited = [];
  const notVisited = [];

  for (const region of regions) {
    const isVisited =
      visitedStateIds != null &&
      Object.prototype.hasOwnProperty.call(visitedStateIds, region.stateId);

    if (isVisited) {
      visited.push(region);
    } else {
      notVisited.push(region);
    }
  }

  visited.sort((a, b) => a.name.localeCompare(b.name));
  notVisited.sort((a, b) => a.name.localeCompare(b.name));

  return { visited, notVisited };
}
