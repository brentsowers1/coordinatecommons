import fc from 'fast-check';

// login() calls the real amazon-cognito-identity-js SDK, so we mock the SDK
// to control CognitoUser.prototype.authenticateUser's callback behavior
// without a live Cognito pool. `mockAuthBehavior` is set by each property
// run before calling login(), and is only read once authenticateUser() is
// actually invoked. Jest permits `mock`-prefixed names inside jest.mock()'s
// factory despite the usual out-of-scope-variable restriction.
let mockAuthBehavior = null;

jest.mock('amazon-cognito-identity-js', () => ({
  CognitoUserPool: jest.fn().mockImplementation(function CognitoUserPool() {}),
  AuthenticationDetails: jest.fn().mockImplementation(function AuthenticationDetails(opts) {
    return opts;
  }),
  CognitoUser: jest.fn().mockImplementation(function CognitoUser() {
    return {
      authenticateUser: (details, callbacks) => {
        if (typeof mockAuthBehavior === 'function') {
          mockAuthBehavior(callbacks);
        }
      },
    };
  }),
}));

import {
  validateCredentials,
  login,
  MAX_USERNAME_LENGTH,
  MAX_PASSWORD_LENGTH,
} from './authenticationService';

// An arbitrary string made only of whitespace characters, of a given max length.
function whitespace(maxLength) {
  return fc
    .array(fc.constantFrom(' ', '\t', '\n'), { maxLength })
    .map((chars) => chars.join(''));
}

// Arbitrary for a string that trims down to a non-empty value within a given
// max length, optionally padded with leading/trailing whitespace.
function nonEmptyWithinLimit(maxLength) {
  return fc
    .string({ minLength: 1, maxLength })
    .filter((s) => s.trim().length > 0 && s.trim().length <= maxLength)
    .chain((core) =>
      fc
        .tuple(whitespace(5), whitespace(5))
        .map(([lead, trail]) => `${lead}${core}${trail}`)
    );
}

// Arbitrary for a string that trims down to empty (only whitespace, or truly empty).
const trimsToEmpty = whitespace(10);

// Arbitrary for a string that trims to a non-empty value exceeding maxLength.
function nonEmptyExceedingLimit(maxLength) {
  return fc
    .string({ minLength: maxLength + 1, maxLength: maxLength + 50 })
    .filter((s) => s.trim().length > maxLength);
}

describe('validateCredentials', () => {
  // Feature: state-visit-tracker, Property 1: Credential validation accepts only well-formed, non-empty input
  test('property: accepts exactly when both fields are non-empty after trimming and within length limits', () => {
    fc.assert(
      fc.property(
        nonEmptyWithinLimit(MAX_USERNAME_LENGTH),
        nonEmptyWithinLimit(MAX_PASSWORD_LENGTH),
        (username, password) => {
          const result = validateCredentials(username, password);
          expect(result).toEqual({ valid: true });
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: state-visit-tracker, Property 1: Credential validation accepts only well-formed, non-empty input
  test('property: rejects with REQUIRED whenever either field trims to empty', () => {
    fc.assert(
      fc.property(
        fc.oneof(trimsToEmpty, nonEmptyWithinLimit(MAX_USERNAME_LENGTH), nonEmptyExceedingLimit(MAX_USERNAME_LENGTH)),
        fc.oneof(trimsToEmpty, nonEmptyWithinLimit(MAX_PASSWORD_LENGTH), nonEmptyExceedingLimit(MAX_PASSWORD_LENGTH)),
        (username, password) => {
          fc.pre(username.trim().length === 0 || password.trim().length === 0);
          const result = validateCredentials(username, password);
          expect(result).toEqual({ valid: false, reason: 'REQUIRED' });
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: state-visit-tracker, Property 1: Credential validation accepts only well-formed, non-empty input
  test('property: rejects with TOO_LONG when both fields are non-empty after trimming but one exceeds its length limit', () => {
    fc.assert(
      fc.property(
        fc.oneof(nonEmptyWithinLimit(MAX_USERNAME_LENGTH), nonEmptyExceedingLimit(MAX_USERNAME_LENGTH)),
        fc.oneof(nonEmptyWithinLimit(MAX_PASSWORD_LENGTH), nonEmptyExceedingLimit(MAX_PASSWORD_LENGTH)),
        (username, password) => {
          const trimmedUsername = username.trim();
          const trimmedPassword = password.trim();
          fc.pre(trimmedUsername.length > 0 && trimmedPassword.length > 0);
          fc.pre(
            trimmedUsername.length > MAX_USERNAME_LENGTH ||
              trimmedPassword.length > MAX_PASSWORD_LENGTH
          );
          const result = validateCredentials(username, password);
          expect(result).toEqual({ valid: false, reason: 'TOO_LONG' });
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: state-visit-tracker, Property 1: Credential validation accepts only well-formed, non-empty input
  test('property: validation is deterministic/pure for any input pair', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), fc.string({ maxLength: 300 }), (username, password) => {
        const first = validateCredentials(username, password);
        const second = validateCredentials(username, password);
        expect(second).toEqual(first);
      }),
      { numRuns: 100 }
    );
  });
});

describe('login', () => {
  beforeEach(() => {
    mockAuthBehavior = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Feature: state-visit-tracker, Property 3: A failed or unreachable authentication attempt never creates a Session
  test('property: invalid credentials, a Cognito failure, or an unreachable/timed-out attempt never resolves with a Session', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyWithinLimit(MAX_USERNAME_LENGTH),
        nonEmptyWithinLimit(MAX_PASSWORD_LENGTH),
        fc.oneof(
          // Known Cognito codes that should map to INVALID_CREDENTIALS...
          fc.record({ kind: fc.constant('failure'), code: fc.constantFrom('NotAuthorizedException', 'UserNotFoundException') }),
          // ...and arbitrary/unknown codes that should map to TIMEOUT_OR_UNREACHABLE.
          fc.record({ kind: fc.constant('failure'), code: fc.string() }),
          // The SDK never invokes any callback at all (network unreachable),
          // which must be caught by the internal 10s timeout.
          fc.constant({ kind: 'timeout' })
        ),
        async (username, password, outcome) => {
          let resultPromise;

          if (outcome.kind === 'timeout') {
            jest.useFakeTimers();
            mockAuthBehavior = () => {
              /* never calls onSuccess or onFailure */
            };
            resultPromise = login(username, password);
            const assertion = expect(resultPromise).rejects.toEqual({
              kind: 'TIMEOUT_OR_UNREACHABLE',
            });
            jest.advanceTimersByTime(10000);
            await assertion;
            jest.useRealTimers();
          } else {
            mockAuthBehavior = (callbacks) => {
              callbacks.onFailure({ code: outcome.code });
            };
            resultPromise = login(username, password);
            await expect(resultPromise).rejects.toEqual(
              expect.objectContaining({
                kind: expect.stringMatching(/^(INVALID_CREDENTIALS|TIMEOUT_OR_UNREACHABLE)$/),
              })
            );
          }

          // Regardless of which failure path was hit, no Session-shaped value
          // (one carrying an accessToken) is ever produced by a rejection.
          await expect(resultPromise).rejects.not.toEqual(
            expect.objectContaining({ accessToken: expect.anything() })
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
