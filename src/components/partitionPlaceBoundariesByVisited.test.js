import fc from 'fast-check';

import { partitionPlaceBoundariesByVisited } from './partitionPlaceBoundariesByVisited';

const placeBoundaryArbitrary = fc.record({
  placeId: fc.string({ minLength: 1, maxLength: 5 }),
  name: fc.string({ minLength: 1, maxLength: 20 }),
});

describe('partitionPlaceBoundariesByVisited', () => {
  // Feature: state-visit-tracker, Property 22: The visited/not-visited lists partition exactly the currently loaded regions by membership
  test('property: together the two lists contain exactly the input placeBoundaries, split solely by placeId membership in visitedPlaceIds', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(placeBoundaryArbitrary, { selector: (placeBoundary) => placeBoundary.placeId }),
        fc.dictionary(fc.string(), fc.constant(true)),
        (placeBoundaries, visitedPlaceIds) => {
          const { visited, notVisited } = partitionPlaceBoundariesByVisited(placeBoundaries, visitedPlaceIds);

          // No duplicates, none omitted: the union (by placeId) equals the input.
          const unionPlaceIds = [...visited, ...notVisited].map((p) => p.placeId).sort();
          const inputPlaceIds = placeBoundaries.map((p) => p.placeId).sort();
          expect(unionPlaceIds).toEqual(inputPlaceIds);
          expect(visited.length + notVisited.length).toBe(placeBoundaries.length);

          // Membership in each list is determined solely by placeId membership.
          for (const placeBoundary of placeBoundaries) {
            const isVisited = Object.prototype.hasOwnProperty.call(visitedPlaceIds, placeBoundary.placeId);
            if (isVisited) {
              expect(visited).toContain(placeBoundary);
              expect(notVisited).not.toContain(placeBoundary);
            } else {
              expect(notVisited).toContain(placeBoundary);
              expect(visited).not.toContain(placeBoundary);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('sorts the visited list alphabetically by name', () => {
    const placeBoundaries = [
      { placeId: 'CA', name: 'California' },
      { placeId: 'AL', name: 'Alabama' },
      { placeId: 'NY', name: 'New York' },
    ];
    const visitedPlaceIds = { CA: true, AL: true, NY: true };

    const { visited } = partitionPlaceBoundariesByVisited(placeBoundaries, visitedPlaceIds);

    expect(visited.map((p) => p.name)).toEqual(['Alabama', 'California', 'New York']);
  });

  test('sorts the not-visited list alphabetically by name', () => {
    const placeBoundaries = [
      { placeId: 'CA', name: 'California' },
      { placeId: 'AL', name: 'Alabama' },
      { placeId: 'NY', name: 'New York' },
    ];

    const { notVisited } = partitionPlaceBoundariesByVisited(placeBoundaries, {});

    expect(notVisited.map((p) => p.name)).toEqual(['Alabama', 'California', 'New York']);
  });

  test('returns two empty arrays for an empty placeBoundaries input', () => {
    const { visited, notVisited } = partitionPlaceBoundariesByVisited([], { CA: true });

    expect(visited).toEqual([]);
    expect(notVisited).toEqual([]);
  });
});
