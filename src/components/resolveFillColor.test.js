import fc from 'fast-check';

import {
  VISITED_FILL_COLOR,
  NOT_VISITED_FILL_COLOR,
  resolveFillColor,
} from './resolveFillColor';

describe('resolveFillColor', () => {
  test('VISITED_FILL_COLOR and NOT_VISITED_FILL_COLOR are distinct', () => {
    expect(VISITED_FILL_COLOR).not.toBe(NOT_VISITED_FILL_COLOR);
  });

  // Feature: state-visit-tracker, Property 14: Fill color is exactly one of two fixed, distinct colors, determined solely by membership in the current category's slice
  test('property: returns VISITED_FILL_COLOR iff placeId is an own key of visitedPlaceIds (a single category\'s slice), otherwise NOT_VISITED_FILL_COLOR', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.dictionary(fc.string(), fc.constant(true)),
        fc.boolean(),
        (placeId, baseVisitedPlaceIds, includePlaceId) => {
          const visitedPlaceIds = includePlaceId
            ? { ...baseVisitedPlaceIds, [placeId]: true }
            : (() => {
                // Ensure placeId is definitely absent even if the base map
                // happened to include it.
                const { [placeId]: _omitted, ...rest } = baseVisitedPlaceIds;
                return rest;
              })();

          const result = resolveFillColor(placeId, visitedPlaceIds);
          const isVisited = Object.prototype.hasOwnProperty.call(
            visitedPlaceIds,
            placeId
          );

          expect(result).toBe(
            isVisited ? VISITED_FILL_COLOR : NOT_VISITED_FILL_COLOR
          );
          expect(VISITED_FILL_COLOR).not.toBe(NOT_VISITED_FILL_COLOR);
        }
      ),
      { numRuns: 100 }
    );
  });
});
