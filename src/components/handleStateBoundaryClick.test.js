import fc from 'fast-check';
import { handleStateBoundaryClick } from './handleStateBoundaryClick';

// Excludes "__proto__" (and other reserved/prototype-chain keys): a plain
// object used as a map treats a "__proto__" key specially (it sets the
// prototype rather than an own property), which is a JS object-literal
// pitfall unrelated to handleStateBoundaryClick's actual behavior — real
// stateIds are USPS codes and never take this value. This is used both for
// the clicked `stateId` itself and for the dictionary keys that stand in
// for other, unrelated visited/pending entries, since a "__proto__" key
// there would trigger the exact same prototype-pollution pitfall via the
// `{ ...obj }` spreads in handleStateBoundaryClick.
const stateIdArbitrary = fc
  .string()
  .filter((s) => s !== '__proto__' && s !== 'constructor' && s !== 'prototype');

// Feature: state-visit-tracker, Property 10: Clicking a state as an authenticated user always
// toggles it and issues the matching request
describe('handleStateBoundaryClick - Property 10', () => {
  it('always flips membership and issues the matching saveVisitedState call for an authenticated session, when stateId is not pending', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          username: fc.string(),
          accessToken: fc.string(),
          expiresAt: fc.integer(),
        }),
        stateIdArbitrary,
        fc.dictionary(stateIdArbitrary, fc.constant(true)),
        fc.boolean(),
        async (session, stateId, otherVisitedStateIds, stateIdWasVisited) => {
          // Build a visitedStateIds map where we control whether stateId is
          // present (visited) or absent (not visited), independent of the
          // other randomly-generated entries.
          const visitedStateIds = { ...otherVisitedStateIds };
          delete visitedStateIds[stateId];
          if (stateIdWasVisited) {
            visitedStateIds[stateId] = true;
          }

          // pendingStateIds guaranteed not to contain stateId, per Property
          // 10's scope ("not currently pending").
          const pendingStateIds = {};

          const apiClient = {
            saveVisitedState: jest.fn().mockResolvedValue(undefined),
          };

          const result = handleStateBoundaryClick(
            session,
            visitedStateIds,
            pendingStateIds,
            stateId,
            apiClient
          );

          expect(result).not.toBeNull();

          const wasVisited = Object.prototype.hasOwnProperty.call(visitedStateIds, stateId);
          const nowVisited = Object.prototype.hasOwnProperty.call(
            result.visitedStateIds,
            stateId
          );
          // Membership must be flipped from its prior value.
          expect(nowVisited).toBe(!wasVisited);

          await result.settle();

          expect(apiClient.saveVisitedState).toHaveBeenCalledTimes(1);
          expect(apiClient.saveVisitedState).toHaveBeenCalledWith(session, stateId, !wasVisited);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: state-visit-tracker, Property 11: A failed or timed-out save always reverts the
// optimistic update
describe('handleStateBoundaryClick - Property 11', () => {
  it('always reverts to the pre-click membership and surfaces a save error when saveVisitedState fails or times out', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          username: fc.string(),
          accessToken: fc.string(),
          expiresAt: fc.integer(),
        }),
        stateIdArbitrary,
        fc.dictionary(stateIdArbitrary, fc.constant(true)),
        fc.boolean(),
        fc.constantFrom('AUTH_ERROR', 'TIMEOUT', 'FAILURE'),
        async (session, stateId, otherVisitedStateIds, stateIdWasVisited, rejectionKind) => {
          // Build a visitedStateIds map where we control whether stateId is
          // present (visited) or absent (not visited), independent of the
          // other randomly-generated entries.
          const visitedStateIds = { ...otherVisitedStateIds };
          delete visitedStateIds[stateId];
          if (stateIdWasVisited) {
            visitedStateIds[stateId] = true;
          }

          // Capture the membership value immediately before the click, so
          // we can assert the post-settle value matches it exactly.
          const priorMembership = Object.prototype.hasOwnProperty.call(
            visitedStateIds,
            stateId
          );

          // pendingStateIds guaranteed empty (stateId not currently pending).
          const pendingStateIds = {};

          const apiClient = {
            saveVisitedState: jest.fn().mockRejectedValue({ kind: rejectionKind }),
          };

          const result = handleStateBoundaryClick(
            session,
            visitedStateIds,
            pendingStateIds,
            stateId,
            apiClient
          );

          expect(result).not.toBeNull();

          const settled = await result.settle();

          const settledMembership = Object.prototype.hasOwnProperty.call(
            settled.visitedStateIds,
            stateId
          );
          // The save failed/timed out, so membership must be reverted to
          // exactly its value before the click (not the flipped value).
          expect(settledMembership).toBe(priorMembership);

          // Pending must always be cleared, even on failure.
          expect(
            Object.prototype.hasOwnProperty.call(settled.pendingStateIds, stateId)
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
describe('handleStateBoundaryClick - Property 12', () => {
  it('always no-ops and issues zero additional API calls for repeated clicks on an already-pending state', async () => {
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
        stateIdArbitrary,
        fc.dictionary(stateIdArbitrary, fc.constant(true)),
        fc.dictionary(stateIdArbitrary, fc.constant(true)),
        fc.integer({ min: 1, max: 10 }),
        async (
          session,
          stateId,
          visitedStateIds,
          otherPendingStateIds,
          additionalClickCount
        ) => {
          // Simulate stateId already pending from a prior click, alongside
          // whatever other unrelated pending entries were generated.
          const pendingStateIds = { ...otherPendingStateIds, [stateId]: true };

          const apiClient = {
            saveVisitedState: jest.fn().mockResolvedValue(undefined),
          };

          // Repeated calls before the in-flight request settles reuse the
          // same (unchanged) visitedStateIds/pendingStateIds inputs each
          // time, since nothing has settled yet.
          for (let i = 0; i < additionalClickCount; i += 1) {
            const result = handleStateBoundaryClick(
              session,
              visitedStateIds,
              pendingStateIds,
              stateId,
              apiClient
            );

            // Every repeated click while pending is a complete no-op.
            expect(result).toBeNull();
          }

          // No additional API calls are ever issued for a state that stays
          // pending across repeated clicks.
          expect(apiClient.saveVisitedState).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: state-visit-tracker, Property 13: Clicking a state as an unauthenticated user always
// toggles it locally and never calls the API
describe('handleStateBoundaryClick - Property 13', () => {
  it('always flips membership locally and issues zero saveVisitedState calls for an unauthenticated session, when stateId is not pending', async () => {
    await fc.assert(
      fc.asyncProperty(
        stateIdArbitrary,
        fc.dictionary(stateIdArbitrary, fc.constant(true)),
        fc.boolean(),
        async (stateId, otherVisitedStateIds, stateIdWasVisited) => {
          const session = null;

          // Build a visitedStateIds map where we control whether stateId is
          // present (visited) or absent (not visited), independent of the
          // other randomly-generated entries.
          const visitedStateIds = { ...otherVisitedStateIds };
          delete visitedStateIds[stateId];
          if (stateIdWasVisited) {
            visitedStateIds[stateId] = true;
          }

          // pendingStateIds guaranteed empty (stateId not currently pending).
          const pendingStateIds = {};

          const apiClient = {
            saveVisitedState: jest.fn(),
          };

          const result = handleStateBoundaryClick(
            session,
            visitedStateIds,
            pendingStateIds,
            stateId,
            apiClient
          );

          expect(result).not.toBeNull();

          const wasVisited = Object.prototype.hasOwnProperty.call(visitedStateIds, stateId);
          const nowVisited = Object.prototype.hasOwnProperty.call(
            result.visitedStateIds,
            stateId
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
            settled.visitedStateIds,
            stateId
          );
          expect(settledMembership).toBe(!wasVisited);

          // Pending must be cleared once settled.
          expect(
            Object.prototype.hasOwnProperty.call(settled.pendingStateIds, stateId)
          ).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
