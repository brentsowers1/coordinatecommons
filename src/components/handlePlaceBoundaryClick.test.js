import fc from 'fast-check';
import { handlePlaceBoundaryClick } from './handlePlaceBoundaryClick';

// Excludes "__proto__" (and other reserved/prototype-chain keys): a plain
// object used as a map treats a "__proto__" key specially (it sets the
// prototype rather than an own property), which is a JS object-literal
// pitfall unrelated to handlePlaceBoundaryClick's actual behavior — real
// placeIds are USPS codes and never take this value. This is used both for
// the clicked `placeId` itself and for the dictionary keys that stand in
// for other, unrelated visited/pending entries, since a "__proto__" key
// there would trigger the exact same prototype-pollution pitfall via the
// `{ ...obj }` spreads in handlePlaceBoundaryClick.
const placeIdArbitrary = fc
  .string()
  .filter((s) => s !== '__proto__' && s !== 'constructor' && s !== 'prototype');

// The three Place_Category values supported by the Visit_Record_API
// (Requirement 15.2; design.md's "Visit_Record_API Contract"). Varying this
// across the property tests below exercises that `placeCategory` is
// threaded through to `saveVisitedState` unchanged (15.2) and that this
// function never reads/writes any slice but the one it is given (15.6).
const placeCategoryArbitrary = fc.constantFrom('us-state', 'canada-state', 'country');

// Feature: state-visit-tracker, Property 10: Clicking a place as an authenticated user always
// toggles it and issues the matching request
describe('handlePlaceBoundaryClick - Property 10', () => {
  it('always flips membership and issues the matching saveVisitedState call for an authenticated session, when placeId is not pending', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          username: fc.string(),
          accessToken: fc.string(),
          expiresAt: fc.integer(),
        }),
        placeCategoryArbitrary,
        placeIdArbitrary,
        fc.dictionary(placeIdArbitrary, fc.constant(true)),
        fc.boolean(),
        async (session, placeCategory, placeId, otherVisitedPlaceIdsForCategory, placeIdWasVisited) => {
          // Build a visitedPlaceIdsForCategory map where we control whether
          // placeId is present (visited) or absent (not visited),
          // independent of the other randomly-generated entries.
          const visitedPlaceIdsForCategory = { ...otherVisitedPlaceIdsForCategory };
          delete visitedPlaceIdsForCategory[placeId];
          if (placeIdWasVisited) {
            visitedPlaceIdsForCategory[placeId] = true;
          }

          // pendingPlaceIdsForCategory guaranteed not to contain placeId,
          // per Property 10's scope ("not currently pending").
          const pendingPlaceIdsForCategory = {};

          const apiClient = {
            saveVisitedState: jest.fn().mockResolvedValue(undefined),
          };

          const result = handlePlaceBoundaryClick(
            session,
            placeCategory,
            visitedPlaceIdsForCategory,
            pendingPlaceIdsForCategory,
            placeId,
            apiClient
          );

          expect(result).not.toBeNull();

          const wasVisited = Object.prototype.hasOwnProperty.call(
            visitedPlaceIdsForCategory,
            placeId
          );
          const nowVisited = Object.prototype.hasOwnProperty.call(
            result.visitedPlaceIdsForCategory,
            placeId
          );
          // Membership must be flipped from its prior value.
          expect(nowVisited).toBe(!wasVisited);

          await result.settle();

          expect(apiClient.saveVisitedState).toHaveBeenCalledTimes(1);
          expect(apiClient.saveVisitedState).toHaveBeenCalledWith(
            session,
            placeCategory,
            placeId,
            !wasVisited
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: state-visit-tracker, Property 11: A failed or timed-out save always reverts the
// optimistic update
describe('handlePlaceBoundaryClick - Property 11', () => {
  it('always reverts to the pre-click membership and surfaces a save error when saveVisitedState fails or times out', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          username: fc.string(),
          accessToken: fc.string(),
          expiresAt: fc.integer(),
        }),
        placeCategoryArbitrary,
        placeIdArbitrary,
        fc.dictionary(placeIdArbitrary, fc.constant(true)),
        fc.boolean(),
        fc.constantFrom('AUTH_ERROR', 'TIMEOUT', 'FAILURE'),
        async (
          session,
          placeCategory,
          placeId,
          otherVisitedPlaceIdsForCategory,
          placeIdWasVisited,
          rejectionKind
        ) => {
          // Build a visitedPlaceIdsForCategory map where we control whether
          // placeId is present (visited) or absent (not visited),
          // independent of the other randomly-generated entries.
          const visitedPlaceIdsForCategory = { ...otherVisitedPlaceIdsForCategory };
          delete visitedPlaceIdsForCategory[placeId];
          if (placeIdWasVisited) {
            visitedPlaceIdsForCategory[placeId] = true;
          }

          // Capture the membership value immediately before the click, so
          // we can assert the post-settle value matches it exactly.
          const priorMembership = Object.prototype.hasOwnProperty.call(
            visitedPlaceIdsForCategory,
            placeId
          );

          // pendingPlaceIdsForCategory guaranteed empty (placeId not
          // currently pending).
          const pendingPlaceIdsForCategory = {};

          const apiClient = {
            saveVisitedState: jest.fn().mockRejectedValue({ kind: rejectionKind }),
          };

          const result = handlePlaceBoundaryClick(
            session,
            placeCategory,
            visitedPlaceIdsForCategory,
            pendingPlaceIdsForCategory,
            placeId,
            apiClient
          );

          expect(result).not.toBeNull();

          const settled = await result.settle();

          const settledMembership = Object.prototype.hasOwnProperty.call(
            settled.visitedPlaceIdsForCategory,
            placeId
          );
          // The save failed/timed out, so membership must be reverted to
          // exactly its value before the click (not the flipped value).
          expect(settledMembership).toBe(priorMembership);

          // Pending must always be cleared, even on failure.
          expect(
            Object.prototype.hasOwnProperty.call(settled.pendingPlaceIdsForCategory, placeId)
          ).toBe(false);

          // A save-error must be surfaced.
          expect(settled.toastError).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: state-visit-tracker, Property 12: Repeated clicks on a pending state have no
// additional effect
describe('handlePlaceBoundaryClick - Property 12', () => {
  it('always no-ops and issues zero additional API calls for repeated clicks on an already-pending place', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.option(
          fc.record({
            username: fc.string(),
            accessToken: fc.string(),
            expiresAt: fc.integer(),
          }),
          { nil: null }
        ),
        placeCategoryArbitrary,
        placeIdArbitrary,
        fc.dictionary(placeIdArbitrary, fc.constant(true)),
        fc.dictionary(placeIdArbitrary, fc.constant(true)),
        fc.integer({ min: 1, max: 10 }),
        async (
          session,
          placeCategory,
          placeId,
          visitedPlaceIdsForCategory,
          otherPendingPlaceIdsForCategory,
          additionalClickCount
        ) => {
          // Simulate placeId already pending from a prior click, alongside
          // whatever other unrelated pending entries were generated.
          const pendingPlaceIdsForCategory = { ...otherPendingPlaceIdsForCategory, [placeId]: true };

          const apiClient = {
            saveVisitedState: jest.fn().mockResolvedValue(undefined),
          };

          // Repeated calls before the in-flight request settles reuse the
          // same (unchanged) visitedPlaceIdsForCategory/
          // pendingPlaceIdsForCategory inputs each time, since nothing has
          // settled yet.
          for (let i = 0; i < additionalClickCount; i += 1) {
            const result = handlePlaceBoundaryClick(
              session,
              placeCategory,
              visitedPlaceIdsForCategory,
              pendingPlaceIdsForCategory,
              placeId,
              apiClient
            );

            // Every repeated click while pending is a complete no-op.
            expect(result).toBeNull();
          }

          // No additional API calls are ever issued for a place that stays
          // pending across repeated clicks.
          expect(apiClient.saveVisitedState).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: state-visit-tracker, Property 13: Clicking a place as an unauthenticated user always
// toggles it locally and never calls the API
describe('handlePlaceBoundaryClick - Property 13', () => {
  it('always flips membership locally and issues zero saveVisitedState calls for an unauthenticated session, when placeId is not pending', async () => {
    await fc.assert(
      fc.asyncProperty(
        placeCategoryArbitrary,
        placeIdArbitrary,
        fc.dictionary(placeIdArbitrary, fc.constant(true)),
        fc.boolean(),
        async (placeCategory, placeId, otherVisitedPlaceIdsForCategory, placeIdWasVisited) => {
          const session = null;

          // Build a visitedPlaceIdsForCategory map where we control whether
          // placeId is present (visited) or absent (not visited),
          // independent of the other randomly-generated entries.
          const visitedPlaceIdsForCategory = { ...otherVisitedPlaceIdsForCategory };
          delete visitedPlaceIdsForCategory[placeId];
          if (placeIdWasVisited) {
            visitedPlaceIdsForCategory[placeId] = true;
          }

          // pendingPlaceIdsForCategory guaranteed empty (placeId not
          // currently pending).
          const pendingPlaceIdsForCategory = {};

          const apiClient = {
            saveVisitedState: jest.fn(),
          };

          const result = handlePlaceBoundaryClick(
            session,
            placeCategory,
            visitedPlaceIdsForCategory,
            pendingPlaceIdsForCategory,
            placeId,
            apiClient
          );

          expect(result).not.toBeNull();

          const wasVisited = Object.prototype.hasOwnProperty.call(
            visitedPlaceIdsForCategory,
            placeId
          );
          const nowVisited = Object.prototype.hasOwnProperty.call(
            result.visitedPlaceIdsForCategory,
            placeId
          );
          // Membership must be flipped from its prior value.
          expect(nowVisited).toBe(!wasVisited);

          const settled = await result.settle();

          // The API client must never be called for an unauthenticated
          // session, even after settling.
          expect(apiClient.saveVisitedState).not.toHaveBeenCalled();

          // With no API call, there is nothing to revert: the settled
          // membership must keep the flipped value.
          const settledMembership = Object.prototype.hasOwnProperty.call(
            settled.visitedPlaceIdsForCategory,
            placeId
          );
          expect(settledMembership).toBe(!wasVisited);

          // Pending must be cleared once settled.
          expect(
            Object.prototype.hasOwnProperty.call(settled.pendingPlaceIdsForCategory, placeId)
          ).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: state-visit-tracker, Property 31: Visited_Place identity is scoped by
// (placeCategory, placeId); marking one category's place never marks another category's
// place of the same id
describe('handlePlaceBoundaryClick - Property 31', () => {
  it('never reads or mutates a second category\'s slice, before or after settle(), even when the same placeId string is a key in both categories\' slices', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          username: fc.string(),
          accessToken: fc.string(),
          expiresAt: fc.integer(),
        }),
        // Two distinct Place_Category values -- categoryB is only ever
        // used to build a slice that is deliberately kept out of the
        // handlePlaceBoundaryClick call for categoryA.
        fc
          .tuple(placeCategoryArbitrary, placeCategoryArbitrary)
          .filter(([a, b]) => a !== b),
        placeIdArbitrary,
        fc.dictionary(placeIdArbitrary, fc.constant(true)),
        fc.dictionary(placeIdArbitrary, fc.constant(true)),
        // Whether the SAME placeId string happens to already be "visited"
        // in category A and, independently, in category B -- these are
        // allowed to differ arbitrarily, since that's exactly the
        // same-placeId-different-category collision scenario Property 31
        // is about.
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        async (
          session,
          [categoryA, categoryB],
          placeId,
          otherVisitedPlaceIdsForCategoryA,
          otherVisitedPlaceIdsForCategoryB,
          placeIdWasVisitedInA,
          placeIdWasVisitedInB,
          saveSucceeds
        ) => {
          // Category A's slice: placeId's presence controlled independently
          // of category B's.
          const visitedPlaceIdsForCategoryA = { ...otherVisitedPlaceIdsForCategoryA };
          delete visitedPlaceIdsForCategoryA[placeId];
          if (placeIdWasVisitedInA) {
            visitedPlaceIdsForCategoryA[placeId] = true;
          }
          const pendingPlaceIdsForCategoryA = {};

          // Category B's slice: the SAME placeId string, independently
          // present or absent, plus its own unrelated entries. This is
          // never passed into handlePlaceBoundaryClick below -- it is only
          // held onto so we can assert it stays byte-for-byte the same.
          const visitedPlaceIdsForCategoryB = { ...otherVisitedPlaceIdsForCategoryB };
          delete visitedPlaceIdsForCategoryB[placeId];
          if (placeIdWasVisitedInB) {
            visitedPlaceIdsForCategoryB[placeId] = true;
          }
          const pendingPlaceIdsForCategoryB = { [`${placeId}-sentinel`]: true };

          // Deep snapshots taken before any call, to compare against
          // after both the synchronous call and the settle() call.
          const originalVisitedPlaceIdsForCategoryB = { ...visitedPlaceIdsForCategoryB };
          const originalPendingPlaceIdsForCategoryB = { ...pendingPlaceIdsForCategoryB };

          const apiClient = {
            saveVisitedState: saveSucceeds
              ? jest.fn().mockResolvedValue(undefined)
              : jest.fn().mockRejectedValue({ kind: 'FAILURE' }),
          };

          // Only categoryA's own slices are ever passed in -- categoryB's
          // slices are never given to the function at all, so any leakage
          // would have to come from some other, unintended channel (e.g. a
          // shared/global reference), not from an argument.
          const result = handlePlaceBoundaryClick(
            session,
            categoryA,
            visitedPlaceIdsForCategoryA,
            pendingPlaceIdsForCategoryA,
            placeId,
            apiClient
          );

          expect(result).not.toBeNull();

          // Sanity check (already the focus of Properties 10/13): category
          // A's own membership flips as expected.
          const nowVisitedInA = Object.prototype.hasOwnProperty.call(
            result.visitedPlaceIdsForCategory,
            placeId
          );
          expect(nowVisitedInA).toBe(!placeIdWasVisitedInA);

          // The actual claim under test: category B's slices -- for the
          // SAME placeId string -- are completely untouched by the
          // synchronous call.
          expect(visitedPlaceIdsForCategoryB).toEqual(originalVisitedPlaceIdsForCategoryB);
          expect(pendingPlaceIdsForCategoryB).toEqual(originalPendingPlaceIdsForCategoryB);

          await result.settle();

          // And still untouched after the async settle() path (which
          // performs its own additional mutations, but only ever to
          // categoryA's own visited/pending state on success or failure).
          expect(visitedPlaceIdsForCategoryB).toEqual(originalVisitedPlaceIdsForCategoryB);
          expect(pendingPlaceIdsForCategoryB).toEqual(originalPendingPlaceIdsForCategoryB);

          // The saveVisitedState call, when made, must be tagged with
          // categoryA (never categoryB), confirming no cross-category
          // confusion happened inside settle() either.
          if (session) {
            expect(apiClient.saveVisitedState).toHaveBeenCalledWith(
              session,
              categoryA,
              placeId,
              !placeIdWasVisitedInA
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
