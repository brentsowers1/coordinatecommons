import fc from 'fast-check';

// login() calls the real amazon-cognito-identity-js SDK, so we mock the SDK
// to control CognitoUser.prototype.authenticateUser's callback behavior
// without a live Cognito pool. `mockAuthBehavior` is set by each property
// run before calling login(), and is only read once authenticateUser() is
// actually invoked. Jest permits `mock`-prefixed names inside jest.mock()'s
// factory despite the usual out-of-scope-variable restriction.
let mockAuthBehavior = null;

// signUp()/confirmSignUp() calls are controlled the same way, via their own
// settable behavior variables, read only once the corresponding SDK method
// is actually invoked.
let mockSignUpBehavior = null;
let mockConfirmRegistrationBehavior = null;

jest.mock('amazon-cognito-identity-js', () => ({
  CognitoUserPool: jest.fn().mockImplementation(function CognitoUserPool() {
    return {
      signUp: (username, password, attributeList, validationData, callback) => {
        if (typeof mockSignUpBehavior === 'function') {
          mockSignUpBehavior(username, password, attributeList, callback);
        }
      },
    };
  }),
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
      confirmRegistration: (code, forceAliasCreation, callback) => {
        if (typeof mockConfirmRegistrationBehavior === 'function') {
          mockConfirmRegistrationBehavior(code, callback);
        }
      },
    };
  }),
  CognitoUserAttribute: jest.fn().mockImplementation(function CognitoUserAttribute(opts) {
    return opts;
  }),
}));

import {
  validateCredentials,
  login,
  validateSignUpFields,
  signUp,
  confirmSignUp,
  MAX_USERNAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_LOCATION_LENGTH,
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

  // Bug fix: the Visit_Record_API's Lambda authorizer validates Cognito's ID
  // token, not the access token, so login() must resolve the Session's
  // `accessToken` field from `session.getIdToken()`, not
  // `session.getAccessToken()`.
  test('resolves the Session accessToken field from the Cognito ID token, not the access token', async () => {
    const fakeSession = {
      getIdToken: () => ({
        getJwtToken: () => 'fake-id-jwt',
        getExpiration: () => 1700000000,
      }),
      getAccessToken: () => ({
        getJwtToken: () => 'fake-access-jwt',
        getExpiration: () => 1600000000,
      }),
    };
    mockAuthBehavior = (callbacks) => {
      callbacks.onSuccess(fakeSession);
    };

    const result = await login('someuser', 'somepassword');

    expect(result.accessToken).toBe('fake-id-jwt');
    expect(result.accessToken).not.toBe('fake-access-jwt');
    expect(result.expiresAt).toBe(1700000000 * 1000);
  });
});

// Arbitrary for a string that trims down to a valid-looking email address
// (local@domain.tld) within MAX_EMAIL_LENGTH, optionally padded with
// leading/trailing whitespace.
function validEmailWithinLimit() {
  return fc
    .tuple(
      fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
      fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
      fc.constantFrom('com', 'org', 'net', 'io')
    )
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
    .filter((email) => email.length <= MAX_EMAIL_LENGTH)
    .chain((core) =>
      fc
        .tuple(whitespace(5), whitespace(5))
        .map(([lead, trail]) => `${lead}${core}${trail}`)
    );
}

describe('MAX_LOCATION_LENGTH', () => {
  // MAX_LOCATION_LENGTH bounds the optional `location` field (Requirement
  // 12.3) that SignUpForm enforces via its input's `maxLength` attribute;
  // validateSignUpFields itself doesn't check location length since
  // location has no required/format validation. This just pins the
  // exported constant's value so a future accidental change is caught.
  test('is a positive integer', () => {
    expect(Number.isInteger(MAX_LOCATION_LENGTH)).toBe(true);
    expect(MAX_LOCATION_LENGTH).toBeGreaterThan(0);
  });
});

describe('validateSignUpFields', () => {
  // Feature: state-visit-tracker, Property 24: Sign-up field validation accepts only well-formed, non-empty input
  test('property: accepts exactly when username/email/password/confirmPassword are all non-empty after trimming, within length limits, email looks valid, and passwords match', () => {
    fc.assert(
      fc.property(
        nonEmptyWithinLimit(MAX_USERNAME_LENGTH),
        validEmailWithinLimit(),
        nonEmptyWithinLimit(MAX_PASSWORD_LENGTH),
        (username, email, password) => {
          const result = validateSignUpFields(username, email, password, password);
          expect(result).toEqual({ valid: true });
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: state-visit-tracker, Property 24: Sign-up field validation accepts only well-formed, non-empty input
  test('property: rejects with REQUIRED whenever any of the four fields trims to empty', () => {
    fc.assert(
      fc.property(
        fc.oneof(trimsToEmpty, nonEmptyWithinLimit(MAX_USERNAME_LENGTH)),
        fc.oneof(trimsToEmpty, validEmailWithinLimit()),
        fc.oneof(trimsToEmpty, nonEmptyWithinLimit(MAX_PASSWORD_LENGTH)),
        (username, email, password) => {
          fc.pre(
            username.trim().length === 0 ||
              email.trim().length === 0 ||
              password.trim().length === 0
          );
          const result = validateSignUpFields(username, email, password, password);
          expect(result).toEqual({ valid: false, reason: 'REQUIRED' });
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: state-visit-tracker, Property 24: Sign-up field validation accepts only well-formed, non-empty input
  test('property: rejects with TOO_LONG when all fields are non-empty after trimming but one exceeds its length limit', () => {
    fc.assert(
      fc.property(
        fc.oneof(nonEmptyWithinLimit(MAX_USERNAME_LENGTH), nonEmptyExceedingLimit(MAX_USERNAME_LENGTH)),
        fc.oneof(validEmailWithinLimit(), nonEmptyExceedingLimit(MAX_EMAIL_LENGTH)),
        fc.oneof(nonEmptyWithinLimit(MAX_PASSWORD_LENGTH), nonEmptyExceedingLimit(MAX_PASSWORD_LENGTH)),
        (username, email, password) => {
          const trimmedUsername = username.trim();
          const trimmedEmail = email.trim();
          const trimmedPassword = password.trim();
          fc.pre(
            trimmedUsername.length > 0 && trimmedEmail.length > 0 && trimmedPassword.length > 0
          );
          fc.pre(
            trimmedUsername.length > MAX_USERNAME_LENGTH ||
              trimmedEmail.length > MAX_EMAIL_LENGTH ||
              trimmedPassword.length > MAX_PASSWORD_LENGTH
          );
          const result = validateSignUpFields(username, email, password, password);
          expect(result).toEqual({ valid: false, reason: 'TOO_LONG' });
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: state-visit-tracker, Property 24: Sign-up field validation accepts only well-formed, non-empty input
  test('property: rejects with INVALID_EMAIL when all fields are present/within limits but email does not look like an email', () => {
    fc.assert(
      fc.property(
        nonEmptyWithinLimit(MAX_USERNAME_LENGTH),
        nonEmptyWithinLimit(MAX_EMAIL_LENGTH).filter((s) => !/^\S+@\S+\.\S+$/.test(s.trim())),
        nonEmptyWithinLimit(MAX_PASSWORD_LENGTH),
        (username, email, password) => {
          const result = validateSignUpFields(username, email, password, password);
          expect(result).toEqual({ valid: false, reason: 'INVALID_EMAIL' });
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: state-visit-tracker, Property 24: Sign-up field validation accepts only well-formed, non-empty input
  test('property: rejects with PASSWORD_MISMATCH when password and confirmPassword differ after trimming, everything else valid', () => {
    fc.assert(
      fc.property(
        nonEmptyWithinLimit(MAX_USERNAME_LENGTH),
        validEmailWithinLimit(),
        nonEmptyWithinLimit(MAX_PASSWORD_LENGTH),
        nonEmptyWithinLimit(MAX_PASSWORD_LENGTH),
        (username, email, password, confirmPassword) => {
          fc.pre(password.trim() !== confirmPassword.trim());
          const result = validateSignUpFields(username, email, password, confirmPassword);
          expect(result).toEqual({ valid: false, reason: 'PASSWORD_MISMATCH' });
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('signUp', () => {
  beforeEach(() => {
    mockSignUpBehavior = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('resolves with the trimmed username on success', async () => {
    mockSignUpBehavior = (username, password, attributeList, callback) => {
      callback(null, { userSub: 'abc-123' });
    };

    const result = await signUp('alice', 'alice@example.com', 'correct-password', '');

    expect(result).toEqual({ username: 'alice' });
  });

  test('includes the email attribute but not custom:location when location is not provided', async () => {
    let capturedAttributes;
    mockSignUpBehavior = (username, password, attributeList, callback) => {
      capturedAttributes = attributeList;
      callback(null, {});
    };

    await signUp('alice', 'alice@example.com', 'correct-password', '');

    expect(capturedAttributes).toEqual([{ Name: 'email', Value: 'alice@example.com' }]);
  });

  test('includes both the email and custom:location attributes when location is provided', async () => {
    let capturedAttributes;
    mockSignUpBehavior = (username, password, attributeList, callback) => {
      capturedAttributes = attributeList;
      callback(null, {});
    };

    await signUp('alice', 'alice@example.com', 'correct-password', 'Austin, TX');

    expect(capturedAttributes).toEqual([
      { Name: 'email', Value: 'alice@example.com' },
      { Name: 'custom:location', Value: 'Austin, TX' },
    ]);
  });

  test('rejects with USERNAME_EXISTS when Cognito reports UsernameExistsException', async () => {
    mockSignUpBehavior = (username, password, attributeList, callback) => {
      callback({ code: 'UsernameExistsException' });
    };

    await expect(signUp('alice', 'alice@example.com', 'correct-password', '')).rejects.toEqual({
      kind: 'USERNAME_EXISTS',
    });
  });

  test('rejects with INVALID_PASSWORD when Cognito reports InvalidPasswordException', async () => {
    mockSignUpBehavior = (username, password, attributeList, callback) => {
      callback({ code: 'InvalidPasswordException' });
    };

    await expect(signUp('alice', 'alice@example.com', 'weak', 'weak')).rejects.toEqual({
      kind: 'INVALID_PASSWORD',
    });
  });

  test('rejects with TIMEOUT_OR_UNREACHABLE when Cognito reports an unrecognized error code', async () => {
    mockSignUpBehavior = (username, password, attributeList, callback) => {
      callback({ code: 'InternalErrorException' });
    };

    await expect(signUp('alice', 'alice@example.com', 'correct-password', '')).rejects.toEqual({
      kind: 'TIMEOUT_OR_UNREACHABLE',
    });
  });

  test('rejects with TIMEOUT_OR_UNREACHABLE when no callback is invoked within the timeout', async () => {
    jest.useFakeTimers();
    mockSignUpBehavior = () => {
      /* never calls the callback */
    };

    const resultPromise = signUp('alice', 'alice@example.com', 'correct-password', '');
    const assertion = expect(resultPromise).rejects.toEqual({ kind: 'TIMEOUT_OR_UNREACHABLE' });
    jest.advanceTimersByTime(10000);
    await assertion;
  });
});

describe('confirmSignUp', () => {
  beforeEach(() => {
    mockConfirmRegistrationBehavior = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('resolves with true on success', async () => {
    mockConfirmRegistrationBehavior = (code, callback) => {
      callback(null, 'SUCCESS');
    };

    const result = await confirmSignUp('alice', '123456');

    expect(result).toBe(true);
  });

  test('rejects with INVALID_CODE when Cognito reports CodeMismatchException', async () => {
    mockConfirmRegistrationBehavior = (code, callback) => {
      callback({ code: 'CodeMismatchException' });
    };

    await expect(confirmSignUp('alice', '000000')).rejects.toEqual({ kind: 'INVALID_CODE' });
  });

  test('rejects with INVALID_CODE when Cognito reports ExpiredCodeException', async () => {
    mockConfirmRegistrationBehavior = (code, callback) => {
      callback({ code: 'ExpiredCodeException' });
    };

    await expect(confirmSignUp('alice', '000000')).rejects.toEqual({ kind: 'INVALID_CODE' });
  });

  test('rejects with TIMEOUT_OR_UNREACHABLE when Cognito reports an unrecognized error code', async () => {
    mockConfirmRegistrationBehavior = (code, callback) => {
      callback({ code: 'InternalErrorException' });
    };

    await expect(confirmSignUp('alice', '000000')).rejects.toEqual({
      kind: 'TIMEOUT_OR_UNREACHABLE',
    });
  });

  test('rejects with TIMEOUT_OR_UNREACHABLE when no callback is invoked within the timeout', async () => {
    jest.useFakeTimers();
    mockConfirmRegistrationBehavior = () => {
      /* never calls the callback */
    };

    const resultPromise = confirmSignUp('alice', '000000');
    const assertion = expect(resultPromise).rejects.toEqual({ kind: 'TIMEOUT_OR_UNREACHABLE' });
    jest.advanceTimersByTime(10000);
    await assertion;
  });
});
