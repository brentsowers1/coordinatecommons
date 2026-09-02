// Visited_States_Lists component (design.md: "VisitedStatesLists";
// Requirement 11).
//
// Renders two side-by-side columns below the map: a Visited_State list on
// the left, and a list of State_Boundary entries that are not Visited_State
// on the right (Requirement 11.1). Both lists are derived from the pure
// `partitionRegionsByVisited(regions, visitedStateIds)` (Property 22),
// which guarantees every region in `regions` appears in exactly one of the
// two lists.
//
// Like `StateInfoPanel`, this component reads `useVisitedStateIds` itself
// rather than being handed it as a prop, and does not read `useSession` at
// all -- it is available regardless of authentication state, since guests
// can mark states locally too (Requirement 9, Requirement 11.4). Because
// it is a plain re-render on a shared-state change, "updates as you click"
// (Requirement 11.3) comes for free: no new event wiring is needed here,
// and list items intentionally have no click handling of their own --
// toggling a visited state still only happens via the map.

import React from 'react';
import { useVisitedStateIds } from '../state/sharedState';
import { partitionRegionsByVisited } from './partitionRegionsByVisited';

/**
 * Renders one column: a heading, and either a `<ul>` of region names or an
 * empty-list placeholder when there are no entries.
 *
 * @param {Object} props
 * @param {string} props.heading
 * @param {import('../data/stateBoundaries').Region[]} props.regionsList
 * @param {string} props.listTestId
 * @param {(stateId: string) => string} props.itemTestId
 */
function VisitedStatesColumn({ heading, regionsList, listTestId, itemTestId }) {
  return (
    <div>
      <h3>{heading}</h3>
      {regionsList.length === 0 ? (
        <p>None yet</p>
      ) : (
        <ul data-testid={listTestId}>
          {regionsList.map((region) => (
            <li key={region.stateId} data-testid={itemTestId(region.stateId)}>
              {region.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The Visited_States_Lists (Requirement 11).
 *
 * Rendered by `MapView` as a sibling of `GoogleMapCanvas`/
 * `StateBoundaryOverlay`/`StateInfoPanel`, below the map. `MapView` passes
 * down the `regions` array it already holds from its own
 * `useRegionsLoader()` call, so this component never fetches the boundary
 * GeoJSON itself.
 *
 * @param {Object} props
 * @param {import('../data/stateBoundaries').Region[]} [props.regions] - the
 *   currently loaded region list (defaults to `[]`).
 */
export function VisitedStatesLists({ regions = [] }) {
  const [visitedStateIds] = useVisitedStateIds();

  const { visited, notVisited } = React.useMemo(
    () => partitionRegionsByVisited(regions, visitedStateIds),
    [regions, visitedStateIds]
  );

  return (
    <div data-testid="visited-states-lists" style={{ display: 'flex', justifyContent: 'space-between' }}>
      <VisitedStatesColumn
        heading="Visited"
        regionsList={visited}
        listTestId="visited-states-list"
        itemTestId={(stateId) => `visited-state-item-${stateId}`}
      />
      <VisitedStatesColumn
        heading="Not Visited"
        regionsList={notVisited}
        listTestId="not-visited-states-list"
        itemTestId={(stateId) => `not-visited-state-item-${stateId}`}
      />
    </div>
  );
}
