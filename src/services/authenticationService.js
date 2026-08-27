/**
 * Result of validating a username/password pair before attempting
 * authentication.
 *
 * Shape:
 *   { valid: true }
 *   { valid: false, reason: 'REQUIRED' }   // one or both fields are empty after trimming
 *   { valid: false, reason: 'TOO_LONG' }   // username > 128 chars or password > 256 chars
 *
 * `reason` is only present when `valid` is false, and is one of the two
 * string constants above so callers can map it to the appropriate
 * user-facing message (Requirements 1.3, 1.4).
 */

import {
  CognitoUser,
  CognitoUserPool,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';
import { config } from '../config';

const MAX_USERNAME_LENGTH = 128;
const MAX_PASSWORD_LENGTH = 256;

// Requirement 1.5/1.9: the whole authentication attempt (Cognito round trip)
// must complete within this window or be treated as unreachable/timed out.
const LOGIN_TIMEOUT_MS = 10000;

let cachedUserPool = null;

/**
 * Lazily constructs (and caches) the CognitoUserPool from config.cognito.
 * Lazy so that importing this module never throws even if config.cognito
 * values are placeholders (e.g. in tests that only exercise
 * validateCredentials).
 */
function getUserPool() {
  if (!cachedUserPool) {
    cachedUserPool = new CognitoUserPool({
      UserPoolId: config.cognito.userPoolId,
      ClientId: config.cognito.clientId,
    });
  }
  return cachedUserPool;
}

/**
 * Pure validation function for login credentials. Does not call Cognito or
 * any other service.
 *
 * Trims both `username` and `password` before checking emptiness. Rejects
 * with reason 'REQUIRED' if either is empty after trimming (Requirement 1.4).
 * Rejects with reason 'TOO_LONG' if the trimmed username exceeds
 * MAX_USERNAME_LENGTH characters or the trimmed password exceeds
 * MAX_PASSWORD_LENGTH characters (Requirement 1.3). Otherwise accepts.
 *
 * @param {string} username
 * @param {string} password
 * @returns {{ valid: true } | { valid: false, reason: 'REQUIRED' | 'TOO_LONG' }}
 */
export function validateCredentials(username, password) {
  const trimmedUsername = typeof username === 'string' ? username.trim() : '';
  const trimmedPassword = typeof password === 'string' ? password.trim() : '';

  if (trimmedUsername.length === 0 || trimmedPassword.length === 0) {
    return { valid: false, reason: 'REQUIRED' };
  }

  if (
    trimmedUsername.length > MAX_USERNAME_LENGTH ||
    trimmedPassword.length > MAX_PASSWORD_LENGTH
  ) {
    return { valid: false, reason: 'TOO_LONG' };
  }

  return { valid: true };
}

/**
 * Attempts to authenticate against the configured Cognito user pool
 * (design.md: "AuthenticationService").
 *
 * Design/validation-error note: design.md and Requirement 1 describe
 * client-side validation (via `validateCredentials`) as blocking submission
 * on the Login_Page *before* `login()` is ever called (Requirement 1.4) —
 * that is the common path, and this is where the "both fields are
 * required"/length messaging is expected to originate. `login()` still
 * validates defensively (it should never be trusted to receive only
 * pre-validated input), but since Requirement 1.8/1.9 only define
 * `INVALID_CREDENTIALS` and `TIMEOUT_OR_UNREACHABLE` as the two login
 * failure kinds Login_Page needs to distinguish, a defensive validation
 * failure here is surfaced as `INVALID_CREDENTIALS` rather than inventing a
 * third rejection kind — this keeps the contract LoginForm/LoginPage (task
 * 18.x) need to handle limited to the two kinds Requirement 1 defines. It
 * also avoids an unnecessary Cognito round trip for input that is already
 * known to be invalid.
 *
 * Resolves with a Session object on success:
 *   { username, accessToken, expiresAt }
 * Rejects with one of:
 *   { kind: 'INVALID_CREDENTIALS' }
 *   { kind: 'TIMEOUT_OR_UNREACHABLE' }
 *
 * Never resolves with a Session unless Cognito itself reports success
 * (design.md Property 3 / Requirements 1.8, 1.9, 8.5).
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ username: string, accessToken: string, expiresAt: number }>}
 */
export async function login(username, password) {
  const validation = validateCredentials(username, password);
  if (!validation.valid) {
    // See comment above: defensive-validation failures are reported as
    // INVALID_CREDENTIALS since Requirement 1 only defines that kind and
    // TIMEOUT_OR_UNREACHABLE for login() to distinguish.
    throw { kind: 'INVALID_CREDENTIALS' };
  }

  const cognitoUser = new CognitoUser({
    Username: username.trim(),
    Pool: getUserPool(),
  });

  const authenticationDetails = new AuthenticationDetails({
    Username: username.trim(),
    Password: password.trim(),
  });

  const authenticationPromise = new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (session) => {
        // The Visit_Record_API's Lambda authorizer validates Cognito's ID
        // token, not the access token, so the ID token is what gets stored
        // in the Session's `accessToken` field (see Session shape below).
        const idToken = session.getIdToken();
        resolve({
          username: username.trim(),
          accessToken: idToken.getJwtToken(),
          // Cognito's `exp` claim is in epoch seconds; convert to epoch ms
          // to match the Session shape's `expiresAt` (design.md).
          expiresAt: idToken.getExpiration() * 1000,
        });
      },
      onFailure: (err) => {
        // Requirement 8.5: never surface raw Cognito errors. Credential
        // rejections map to INVALID_CREDENTIALS; anything else (network
        // failure, service outage, unexpected error shape) is treated as
        // unreachable rather than leaking Cognito-specific error details.
        const code = err && err.code;
        if (code === 'NotAuthorizedException' || code === 'UserNotFoundException') {
          reject({ kind: 'INVALID_CREDENTIALS' });
        } else {
          reject({ kind: 'TIMEOUT_OR_UNREACHABLE' });
        }
      },
    });
  });

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject({ kind: 'TIMEOUT_OR_UNREACHABLE' });
    }, LOGIN_TIMEOUT_MS);
  });

  try {
    return await Promise.race([authenticationPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export { MAX_USERNAME_LENGTH, MAX_PASSWORD_LENGTH };
