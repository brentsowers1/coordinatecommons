import fc from 'fast-check';
import { handleLoginSuccess } from './sessionHandlers';

// Arbitrary for an arbitrary "prior visitedStateIds map" (including the
// empty map). `handleLoginSuccess` doesn't actually take this as an input
// (see sessionHandlers.js: the prior value is unconditionally discarded, so
// the function doesn't need it as a parameter at all), so the property
// below demonstrates the outcome is the same regardless of this value by
// simply not passing it in. This reduces the property to: for any
// successful login result, the returned visitedStateIds is always `{}`.
const priorVisitedStateIdsArb = fc.dictionary(fc.string(), fc.constant(true));

// Arbitrary for a resolved Session (the shape login() resolves with).
const loginResultArb = fc.record({
  username: fc.string(),
  accessToken: fc.string(),
  expiresAt: fc.integer(),
});

describe('handleLoginSuccess', () => {
  // Feature: state-visit-tracker, Property 2: Successful login discards prior visited-place data for every category
  test('property: always yields every category slice of visitedPlaceIdsByCategory empty and a non-null Session populated from the login result, regardless of any prior visitedStateIds', () => {
    fc.assert(
      fc.property(priorVisitedStateIdsArb, loginResultArb, (priorVisitedStateIds, loginResult) => {
        // priorVisitedStateIds is generated to demonstrate the property
        // holds "for any prior visitedStateIds map", but is intentionally
        // not passed to handleLoginSuccess since the handler discards it
        // unconditionally rather than accepting it as input.
        const result = handleLoginSuccess(loginResult);

        expect(result.visitedPlaceIdsByCategory).toEqual({
          'us-state': {},
          'canada-state': {},
          country: {},
        });
        expect(result.session).not.toBeNull();
        expect(result.session).toEqual(loginResult);
      }),
      { numRuns: 100 }
    );
  });
});

import { handleLogout } from './sessionHandlers';

// Arbitrary for an arbitrary "prior Session", including null (signed out).
const priorSessionArb = fc.option(
  fc.record({
    username: fc.string(),
    accessToken: fc.string(),
    expiresAt: fc.integer(),
  }),
  { nil: null }
);

describe('handleLogout', () => {
  // Feature: state-visit-tracker, Property 4: Logout always clears session and visited-state data
  test('property: always yields session === null and visitedStateIds === {}, regardless of any prior Session or prior visitedStateIds', () => {
    fc.assert(
      fc.property(priorSessionArb, priorVisitedStateIdsArb, (_priorSession, _priorVisitedStateIds) => {
        // priorSession and priorVisitedStateIds are generated to
        // demonstrate the property holds "for any prior Session (including
        // null) and any prior visitedStateIds map", but are intentionally
        // not passed to handleLogout since it takes no arguments at all —
        // like handleLoginSuccess, the outcome doesn't depend on any prior
        // state, so the handler doesn't need these values as input.
        const result = handleLogout();

        expect(result.session).toBeNull();
        expect(result.visitedStateIds).toEqual({});
      }),
      { numRuns: 100 }
    );
  });
});

import { isSessionExpired, checkSessionBeforeApiCall } from './sessionHandlers';

// Arbitrary for a Session whose `expiresAt` is strictly before "now".
// The offset is drawn from a wide range (up to ~11.5 days in the past) so
// that, even accounting for any delay between generating the value and the
// function-under-test re-checking against a fresh `Date.now()`, the
// session remains expired at call time (avoiding flakiness).
const expiredSessionArb = fc.record({
  username: fc.string(),
  accessToken: fc.string(),
  expiresAt: fc.integer({ min: 0, max: 1_000_000_000 }).map((offset) => Date.now() - offset - 1),
});

describe('expired session handling', () => {
  // Feature: state-visit-tracker, Property 5: An expired access token blocks the API call and clears the session
  test('property: for any Session whose expiresAt is before now, isSessionExpired is true and checkSessionBeforeApiCall blocks the call and clears the session', () => {
    fc.assert(
      fc.property(expiredSessionArb, (session) => {
        expect(isSessionExpired(session)).toBe(true);

        const result = checkSessionBeforeApiCall(session);

        expect(result.shouldCallApi).toBe(false);
        expect(result.sessionCleared.session).toBeNull();
        expect(result.sessionCleared.visitedStateIds).toEqual({});
      }),
      { numRuns: 100 }
    );
  });
});

import { handleApiAuthError, handleSessionExpiredOrAuthError } from './sessionHandlers';

// Arbitrary for an arbitrary "source operation" label. `handleApiAuthError`
// takes no arguments and its result never varies (see sessionHandlers.js:
// it always delegates to handleSessionExpiredOrAuthError()), so this
// arbitrary is generated purely to demonstrate the property holds no
// matter which Visit_Record_API operation (list/save) is imagined to have
// produced the AUTH_ERROR — similar in spirit to how the
// handleLoginSuccess/handleLogout property tests above generate a "prior
// state" that turns out not to matter.
const sourceOperationArb = fc.constantFrom('list', 'save');

describe('handleApiAuthError', () => {
  // Feature: state-visit-tracker, Property 6: An authentication-error response always clears the session
  test('property: always clears the session and visitedStateIds, regardless of which operation (list/save) produced the AUTH_ERROR', () => {
    fc.assert(
      fc.property(sourceOperationArb, (_sourceOperation) => {
        // sourceOperation is generated to demonstrate the property holds
        // "regardless of which operation (list/save) produced it", but is
        // intentionally not passed to handleApiAuthError since it takes no
        // arguments at all — the outcome never depends on which operation
        // triggered the auth error.
        const result = handleApiAuthError();

        expect(result.session).toBeNull();
        expect(result.visitedStateIds).toEqual({});
        // Bonus assertion (groundwork for task 5.8, not strictly required
        // by Property 6's own wording about clearing the session):
        expect(result.signOutReason).toBe('SESSION_ENDED');
      }),
      { numRuns: 100 }
    );
  });
});

describe('signOutReason wording distinction (task 5.8)', () => {
  // Requirements: 2.4 — LoginPromptBanner (task 17.3) needs to distinguish
  // a manual logout from an involuntary session-ended sign-out. The
  // property tests above already assert these values incidentally; this
  // test pins down the wording distinction itself as a small, fixed set of
  // concrete cases side by side.
  test('handleLogout() always yields signOutReason "LOGOUT" (manual sign-out)', () => {
    expect(handleLogout().signOutReason).toBe('LOGOUT');
  });

  test('handleSessionExpiredOrAuthError() and handleApiAuthError() always yield signOutReason "SESSION_ENDED" (involuntary sign-out)', () => {
    expect(handleSessionExpiredOrAuthError().signOutReason).toBe('SESSION_ENDED');
    expect(handleApiAuthError().signOutReason).toBe('SESSION_ENDED');
  });

  test('checkSessionBeforeApiCall() for an expired session yields sessionCleared.signOutReason "SESSION_ENDED"', () => {
    const expiredSession = { username: 'a', accessToken: 't', expiresAt: Date.now() - 10000 };
    const result = checkSessionBeforeApiCall(expiredSession);
    expect(result.sessionCleared.signOutReason).toBe('SESSION_ENDED');
  });

  test('LOGOUT and SESSION_ENDED are distinct values', () => {
    expect(handleLogout().signOutReason).not.toBe(handleSessionExpiredOrAuthError().signOutReason);
  });
});
