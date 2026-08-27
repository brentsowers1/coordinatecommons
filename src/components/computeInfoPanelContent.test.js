import fc from 'fast-check';

import { computeInfoPanelContent } from './computeInfoPanelContent';

// Excludes "__proto__" (and other reserved/prototype-chain keys): a plain
// object used as a map treats a "__proto__" key specially (it sets the
// prototype rather than an own property), which is a JS object-literal
// pitfall unrelated to computeInfoPanelContent's actual behavior — real
// stateIds are USPS codes and never take this value.
const safeStringId = fc
  .string({ minLength: 1 })
  .filter((s) => s !== '__proto__' && s !== 'constructor' && s !== 'prototype');

// Feature: state-visit-tracker, Property 18: The info panel always displays the currently
// targeted region's name and visited status
describe('computeInfoPanelContent - Property 18', () => {
  it('always returns the targeted region\'s name and a visited flag matching its membership in visitedStateIds, including when the target changes directly from one region to a different one', () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(
            fc.record({ stateId: safeStringId, name: fc.string() }),
            { selector: (region) => region.stateId, minLength: 1 }
          )
          .chain((regions) => {
            const stateIds = regions.map((region) => region.stateId);
            return fc.tuple(
              fc.constant(regions),
              fc.constantFrom(...stateIds),
              fc.constantFrom(...stateIds),
              fc.dictionary(safeStringId, fc.constant(true)),
              fc.boolean(),
              fc.boolean()
            );
          }),
        ([regions, firstStateId, secondStateId, baseVisitedStateIds, includeFirst, includeSecond]) => {
          const regionsById = {};
          for (const region of regions) {
            regionsById[region.stateId] = region;
          }

          // Build a visitedStateIds map that independently controls the
          // membership of firstStateId and secondStateId (which may or may
          // not be the same stateId), on top of arbitrary unrelated entries.
          const visitedStateIds = { ...baseVisitedStateIds };
          delete visitedStateIds[firstStateId];
          delete visitedStateIds[secondStateId];
          if (includeFirst) {
            visitedStateIds[firstStateId] = true;
          }
          if (secondStateId === firstStateId) {
            // Same target: membership is whatever includeFirst decided.
          } else if (includeSecond) {
            visitedStateIds[secondStateId] = true;
          }

          // Exercise the function independently for each target — this
          // covers "changes directly from one region to a different one"
          // since computeInfoPanelContent is pure and must not leak state
          // between calls.
          for (const infoPanelStateId of [firstStateId, secondStateId]) {
            const result = computeInfoPanelContent(
              infoPanelStateId,
              regionsById,
              visitedStateIds
            );

            const expectedVisited = Object.prototype.hasOwnProperty.call(
              visitedStateIds,
              infoPanelStateId
            );

            expect(result.stateId).toBe(infoPanelStateId);
            expect(result.name).toBe(regionsById[infoPanelStateId].name);
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
  it('always returns the neutral placeholder (no name, no visited status) when infoPanelStateId is null, regardless of regionsById or visitedStateIds', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          safeStringId,
          fc.record({ stateId: safeStringId, name: fc.string() })
        ),
        fc.dictionary(safeStringId, fc.constant(true)),
        (regionsById, visitedStateIds) => {
          const result = computeInfoPanelContent(null, regionsById, visitedStateIds);

          expect(result).toEqual({ stateId: null });
          expect(Object.keys(result)).toEqual(['stateId']);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: state-visit-tracker, Property 20: The info panel reflects visited-status changes
// for the currently targeted region without re-targeting
describe('computeInfoPanelContent - Property 20', () => {
  it('returns a different visited flag matching each visitedStateIds map when only the targeted region\'s membership differs, with stateId/name unchanged', () => {
    fc.assert(
      fc.property(
        fc.record({ stateId: safeStringId, name: fc.string() }),
        fc.array(
          fc.record({ stateId: safeStringId, name: fc.string() })
        ),
        fc.dictionary(safeStringId, fc.constant(true)),
        (targetRegion, otherRegions, baseVisitedStateIds) => {
          const regionsById = {};
          for (const region of otherRegions) {
            regionsById[region.stateId] = region;
          }
          // Ensure the target region is present (and takes precedence over
          // any same-stateId collision from otherRegions).
          regionsById[targetRegion.stateId] = targetRegion;

          // Clean baseline: the base map must not already include the
          // target's stateId, so the two constructed maps differ only in
          // that region's membership.
          const baseWithoutTarget = { ...baseVisitedStateIds };
          delete baseWithoutTarget[targetRegion.stateId];

          const visitedStateIdsA = { ...baseWithoutTarget };
          const visitedStateIdsB = {
            ...baseWithoutTarget,
            [targetRegion.stateId]: true,
          };

          const resultA = computeInfoPanelContent(
            targetRegion.stateId,
            regionsById,
            visitedStateIdsA
          );
          const resultB = computeInfoPanelContent(
            targetRegion.stateId,
            regionsById,
            visitedStateIdsB
          );

          expect(resultA.stateId).toBe(targetRegion.stateId);
          expect(resultB.stateId).toBe(targetRegion.stateId);
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
