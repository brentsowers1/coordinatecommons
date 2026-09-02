import fc from 'fast-check';

import { partitionRegionsByVisited } from './partitionRegionsByVisited';

const regionArbitrary = fc.record({
  stateId: fc.string({ minLength: 1, maxLength: 5 }),
  name: fc.string({ minLength: 1, maxLength: 20 }),
});

describe('partitionRegionsByVisited', () => {
  // Feature: state-visit-tracker, Property 22: The visited/not-visited lists partition exactly the currently loaded regions by membership
  test('property: together the two lists contain exactly the input regions, split solely by stateId membership in visitedStateIds', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(regionArbitrary, { selector: (region) => region.stateId }),
        fc.dictionary(fc.string(), fc.constant(true)),
        (regions, visitedStateIds) => {
          const { visited, notVisited } = partitionRegionsByVisited(regions, visitedStateIds);

          // No duplicates, none omitted: the union (by stateId) equals the input.
          const unionStateIds = [...visited, ...notVisited].map((r) => r.stateId).sort();
          const inputStateIds = regions.map((r) => r.stateId).sort();
          expect(unionStateIds).toEqual(inputStateIds);
          expect(visited.length + notVisited.length).toBe(regions.length);

          // Membership in each list is determined solely by stateId membership.
          for (const region of regions) {
            const isVisited = Object.prototype.hasOwnProperty.call(visitedStateIds, region.stateId);
            if (isVisited) {
              expect(visited).toContain(region);
              expect(notVisited).not.toContain(region);
            } else {
              expect(notVisited).toContain(region);
              expect(visited).not.toContain(region);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('sorts the visited list alphabetically by name', () => {
    const regions = [
      { stateId: 'CA', name: 'California' },
      { stateId: 'AL', name: 'Alabama' },
      { stateId: 'NY', name: 'New York' },
    ];
    const visitedStateIds = { CA: true, AL: true, NY: true };

    const { visited } = partitionRegionsByVisited(regions, visitedStateIds);

    expect(visited.map((r) => r.name)).toEqual(['Alabama', 'California', 'New York']);
  });

  test('sorts the not-visited list alphabetically by name', () => {
    const regions = [
      { stateId: 'CA', name: 'California' },
      { stateId: 'AL', name: 'Alabama' },
      { stateId: 'NY', name: 'New York' },
    ];

    const { notVisited } = partitionRegionsByVisited(regions, {});

    expect(notVisited.map((r) => r.name)).toEqual(['Alabama', 'California', 'New York']);
  });

  test('returns two empty arrays for an empty regions input', () => {
    const { visited, notVisited } = partitionRegionsByVisited([], { CA: true });

    expect(visited).toEqual([]);
    expect(notVisited).toEqual([]);
  });
});
