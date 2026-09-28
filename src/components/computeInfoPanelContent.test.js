import fc from 'fast-check';

import { computeInfoPanelContent } from './computeInfoPanelContent';

// Excludes "__proto__" (and other reserved/prototype-chain keys): a plain
// object used as a map treats a "__proto__" key specially (it sets the
// prototype rather than an own property), which is a JS object-literal
// pitfall unrelated to computeInfoPanelContent's actual behavior — real
// placeIds are USPS codes and never take this value.
const safeStringId = fc
  .string({ minLength: 1 })
  .filter((s) => s !== '__proto__' && s !== 'constructor' && s !== 'prototype');

// Feature: state-visit-tracker, Property 18: The info panel always displays the currently
// targeted region's name and visited status
describe('computeInfoPanelContent - Property 18', () => {
  it('always returns the targeted region\'s name and a visited flag matching its membership in visitedPlaceIds, including when the target changes directly from one region to a different one', () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(
            fc.record({ placeId: safeStringId, name: fc.string() }),
            { selector: (region) => region.placeId, minLength: 1 }
          )
          .chain((regions) => {
            const placeIds = regions.map((region) => region.placeId);
            return fc.tuple(
              fc.constant(regions),
              fc.constantFrom(...placeIds),
              fc.constantFrom(...placeIds),
              fc.dictionary(safeStringId, fc.constant(true)),
              fc.boolean(),
              fc.boolean()
            );
          }),
        ([regions, firstPlaceId, secondPlaceId, baseVisitedPlaceIds, includeFirst, includeSecond]) => {
          const placeBoundariesById = {};
          for (const region of regions) {
            placeBoundariesById[region.placeId] = region;
          }

          // Build a visitedPlaceIds map that independently controls the
          // membership of firstPlaceId and secondPlaceId (which may or may
          // not be the same placeId), on top of arbitrary unrelated entries.
          const visitedPlaceIds = { ...baseVisitedPlaceIds };
          delete visitedPlaceIds[firstPlaceId];
          delete visitedPlaceIds[secondPlaceId];
          if (includeFirst) {
            visitedPlaceIds[firstPlaceId] = true;
          }
          if (secondPlaceId === firstPlaceId) {
            // Same target: membership is whatever includeFirst decided.
          } else if (includeSecond) {
            visitedPlaceIds[secondPlaceId] = true;
          }

          // Exercise the function independently for each target — this
          // covers "changes directly from one region to a different one"
          // since computeInfoPanelContent is pure and must not leak state
          // between calls.
          for (const infoPanelPlaceId of [firstPlaceId, secondPlaceId]) {
            const result = computeInfoPanelContent(
              infoPanelPlaceId,
              placeBoundariesById,
              visitedPlaceIds
            );

            const expectedVisited = Object.prototype.hasOwnProperty.call(
              visitedPlaceIds,
              infoPanelPlaceId
            );

            expect(result.placeId).toBe(infoPanelPlaceId);
            expect(result.name).toBe(placeBoundariesById[infoPanelPlaceId].name);
            expect(result.visited).toBe(expectedVisited);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: state-visit-tracker, Property 19: The info panel shows the neutral placeholder
// whenever nothing is targeted
describe('computeInfoPanelContent - Property 19', () => {
  it('always returns the neutral placeholder (no name, no visited status) when infoPanelPlaceId is null, regardless of placeBoundariesById or visitedPlaceIds', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          safeStringId,
          fc.record({ placeId: safeStringId, name: fc.string() })
        ),
        fc.dictionary(safeStringId, fc.constant(true)),
        (placeBoundariesById, visitedPlaceIds) => {
          const result = computeInfoPanelContent(null, placeBoundariesById, visitedPlaceIds);

          expect(result).toEqual({ placeId: null });
          expect(Object.keys(result)).toEqual(['placeId']);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: state-visit-tracker, Property 20: The info panel reflects visited-status changes
// for the currently targeted region without re-targeting
describe('computeInfoPanelContent - Property 20', () => {
  it('returns a different visited flag matching each visitedPlaceIds map when only the targeted region\'s membership differs, with placeId/name unchanged', () => {
    fc.assert(
      fc.property(
        fc.record({ placeId: safeStringId, name: fc.string() }),
        fc.array(
          fc.record({ placeId: safeStringId, name: fc.string() })
        ),
        fc.dictionary(safeStringId, fc.constant(true)),
        (targetRegion, otherRegions, baseVisitedPlaceIds) => {
          const placeBoundariesById = {};
          for (const region of otherRegions) {
            placeBoundariesById[region.placeId] = region;
          }
          // Ensure the target region is present (and takes precedence over
          // any same-placeId collision from otherRegions).
          placeBoundariesById[targetRegion.placeId] = targetRegion;

          // Clean baseline: the base map must not already include the
          // target's placeId, so the two constructed maps differ only in
          // that region's membership.
          const baseWithoutTarget = { ...baseVisitedPlaceIds };
          delete baseWithoutTarget[targetRegion.placeId];

          const visitedPlaceIdsA = { ...baseWithoutTarget };
          const visitedPlaceIdsB = {
            ...baseWithoutTarget,
            [targetRegion.placeId]: true,
          };

          const resultA = computeInfoPanelContent(
            targetRegion.placeId,
            placeBoundariesById,
            visitedPlaceIdsA
          );
          const resultB = computeInfoPanelContent(
            targetRegion.placeId,
            placeBoundariesById,
            visitedPlaceIdsB
          );

          expect(resultA.placeId).toBe(targetRegion.placeId);
          expect(resultB.placeId).toBe(targetRegion.placeId);
          expect(resultA.name).toBe(targetRegion.name);
          expect(resultB.name).toBe(targetRegion.name);
          expect(resultA.visited).toBe(false);
          expect(resultB.visited).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
