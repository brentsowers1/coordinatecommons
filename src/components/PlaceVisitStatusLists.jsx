// Place_Visit_Status_Lists component (design.md: "VisitedStatesLists";
// Requirement 11).
//
// Scope note (task 21.8), mirroring PlaceInfoPanel.jsx's distinction
// between Requirements vocabulary and design.md's generalized vocabulary:
// Requirement 11's own text still calls this the Visited_States_Lists,
// written for the US-states case specifically, but design.md generalizes
// it to Place_Visit_Status_Lists so the same component can serve any
// Place_Category, not just 'us-state'.
//
// Renders two side-by-side columns below the map: a Visited_State list on
// the left, and a list of State_Boundary entries that are not Visited_State
// on the right (Requirement 11.1). Both lists are derived from the pure
// `partitionPlaceBoundariesByVisited(placeBoundaries, visitedPlaceIds)`
// (Property 22), which guarantees every entry in `placeBoundaries` appears
// in exactly one of the two lists.
//
// Like `PlaceInfoPanel`, this component reads `useVisitedPlaceIdsByCategory`
// itself rather than being handed it as a prop, and does not read
// `useSession` at all -- it is available regardless of authentication
// state, since guests can mark states locally too (Requirement 9,
// Requirement 11.4). Because it is a plain re-render on a shared-state
// change, "updates as you click" (Requirement 11.3) comes for free: no new
// event wiring is needed here, and list items intentionally have no click
// handling of their own -- toggling a visited state still only happens via
// the map.
//
// Task 21.8: rather than hardcoding the 'us-state' slice, this component
// now reads `useSelectedPlaceCategory` and uses its current value to index
// into `useVisitedPlaceIdsByCategory()`'s per-category map. Since
// `useSelectedPlaceCategory` still defaults to 'us-state' and nothing yet
// lets a user change it (that's task 24), existing single-category
// behavior is unchanged for now.
//
// Pico.css layout: the outer wrapper has exactly two direct `<div>`
// children (one per column), which is exactly the shape Pico's documented
// `.grid` class expects (picocss.com/docs/grid: direct children of a
// `.grid` container automatically become responsive columns) -- a
// cleaner, documented fit for this specific two-column layout than the
// previous manual `style={{ display: 'flex', justifyContent:
// 'space-between' }}`, so that inline style is replaced with
// `className="grid"`.

import React from 'react';
import { useSelectedPlaceCategory, useVisitedPlaceIdsByCategory } from '../state/sharedState';
import { partitionPlaceBoundariesByVisited } from './partitionPlaceBoundariesByVisited';

/**
 * Renders one column: a heading, and either a `<ul>` of region names or an
 * empty-list placeholder when there are no entries.
 *
 * @param {Object} props
 * @param {string} props.heading
 * @param {import('../data/placeBoundaries').PlaceBoundary[]} props.regionsList
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
        // Spacing fix: measured via getComputedStyle() against the real
        // running page, Pico's default rule `:where(ol, ul) li {
        // margin-bottom: calc(var(--pico-typography-spacing-vertical) *
        // 0.25) }` (picocss.com/docs/css-variables) was adding a measured
        // 5px of margin below every `<li>` at this project's base 20px
        // root font size (`--pico-typography-spacing-vertical` defaults to
        // `1rem`), on top of each `<li>`'s own ~30px line-height-driven
        // text height -- across a 50+-item list that adds up to a visibly
        // taller-than-needed gap between state names. Overriding
        // `--pico-typography-spacing-vertical` down to `0.25rem`, scoped
        // to just this `<ul>` (so nothing outside it, e.g. headings or
        // paragraphs elsewhere on the page, is affected), drops that
        // per-item margin to a measured ~1px while leaving line-height
        // (the actual text glyph spacing, unrelated to this variable)
        // untouched.
        <ul data-testid={listTestId} style={{ '--pico-typography-spacing-vertical': '0.25rem' }}>
          {regionsList.map((region) => (
            <li key={region.placeId} data-testid={itemTestId(region.placeId)}>
              {region.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The Place_Visit_Status_Lists (Requirement 11; called Visited_States_Lists
 * in that requirement's US-states-specific text).
 *
 * Rendered by `MapView` as a sibling of `GoogleMapCanvas`/
 * `StateBoundaryOverlay`/`PlaceInfoPanel`, below the map. `MapView` passes
 * down the `regions` array it already holds from its own
 * `usePlaceBoundariesLoader()` call, so this component never fetches the boundary
 * GeoJSON itself.
 *
 * @param {Object} props
 * @param {import('../data/placeBoundaries').PlaceBoundary[]} [props.regions] - the
 *   currently loaded region list (defaults to `[]`).
 */
export function PlaceVisitStatusLists({ regions = [] }) {
  const [selectedPlaceCategory] = useSelectedPlaceCategory();
  const [visitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
  const visitedPlaceIds = visitedPlaceIdsByCategory[selectedPlaceCategory];

  const { visited, notVisited } = React.useMemo(
    () => partitionPlaceBoundariesByVisited(regions, visitedPlaceIds),
    [regions, visitedPlaceIds]
  );

  return (
    <div data-testid="visited-states-lists" className="grid">
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
