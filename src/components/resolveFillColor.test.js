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

  // Feature: state-visit-tracker, Property 14: Fill color is exactly one of two fixed, distinct colors, determined solely by membership
  test('property: returns VISITED_FILL_COLOR iff stateId is an own key of visitedStateIds, otherwise NOT_VISITED_FILL_COLOR', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.dictionary(fc.string(), fc.constant(true)),
        fc.boolean(),
        (stateId, baseVisitedStateIds, includeStateId) => {
          const visitedStateIds = includeStateId
            ? { ...baseVisitedStateIds, [stateId]: true }
            : (() => {
                // Ensure stateId is definitely absent even if the base map
                // happened to include it.
                const { [stateId]: _omitted, ...rest } = baseVisitedStateIds;
                return rest;
              })();

          const result = resolveFillColor(stateId, visitedStateIds);
          const isVisited = Object.prototype.hasOwnProperty.call(
            visitedStateIds,
            stateId
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
