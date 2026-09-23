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
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';
import { config } from '../config';

const MAX_USERNAME_LENGTH = 128;
const MAX_PASSWORD_LENGTH = 256;

// Requirement 12.3/12.4: practical upper bounds for the two Sign_Up_Page
// fields that don't already have a limit defined by Requirement 1. 254 is
// the practical maximum total length of an RFC 5321 email address; 128
// mirrors MAX_USERNAME_LENGTH as a reasonable bound for the free-text
// `custom:location` attribute (there is no Cognito-imposed limit known to
// this app, so this is this app's own choice, not a pool constraint).
const MAX_EMAIL_LENGTH = 254;
const MAX_LOCATION_LENGTH = 128;

// Requirement 1.5/1.9: the whole authentication attempt (Cognito round trip)
// must complete within this window or be treated as unreachable/timed out.
const LOGIN_TIMEOUT_MS = 10000;

// Requirement 12.4/12.7: sign-up and confirmation each get the same
// 10-second timeout budget as login (Requirement 1.5/1.9), for the same
// reason -- an unreachable/slow Cognito pool must not hang the UI
// indefinitely.
const SIGN_UP_TIMEOUT_MS = 10000;
const CONFIRM_SIGN_UP_TIMEOUT_MS = 10000;

// A pragmatic, non-RFC-5322 "does this look like an email" check: requires
// a non-whitespace local part, an '@', and a non-whitespace domain part
// containing at least one '.'. This intentionally under-validates rather
// than over-validates -- Cognito itself is the final authority on whether
// an email is acceptable; this is purely to catch obviously-wrong input
// before spending a round trip (Requirement 12.4).
const SIMPLE_EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

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

/**
 * Pure validation function for the Sign_Up_Page fields (Requirement 12.3,
 * 12.4). Does not call Cognito or any other service, and does not validate
 * `location` -- it is optional and this app applies no required/format
 * validation to it beyond what `signUp()` itself does defensively (see
 * below).
 *
 * Trims `username`, `email`, `password`, and `confirmPassword` before
 * checking emptiness. Checks are applied in this order, returning on the
 * first that fails:
 *   1. 'REQUIRED' - any of the four trims to empty.
 *   2. 'TOO_LONG' - username/email/password exceeds its max length
 *      (MAX_USERNAME_LENGTH / MAX_EMAIL_LENGTH / MAX_PASSWORD_LENGTH).
 *      `confirmPassword` is checked against MAX_PASSWORD_LENGTH too, since
 *      it is expected to equal `password` when correct.
 *   3. 'INVALID_EMAIL' - `email` doesn't look like an email address.
 *   4. 'PASSWORD_MISMATCH' - `password` !== `confirmPassword` (compared
 *      after trimming, consistent with how both are otherwise handled).
 * Otherwise accepts.
 *
 * @param {string} username
 * @param {string} email
 * @param {string} password
 * @param {string} confirmPassword
 * @returns {{ valid: true } | { valid: false, reason: 'REQUIRED' | 'TOO_LONG' | 'INVALID_EMAIL' | 'PASSWORD_MISMATCH' }}
 */
export function validateSignUpFields(username, email, password, confirmPassword) {
  const trimmedUsername = typeof username === 'string' ? username.trim() : '';
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  const trimmedPassword = typeof password === 'string' ? password.trim() : '';
  const trimmedConfirmPassword =
    typeof confirmPassword === 'string' ? confirmPassword.trim() : '';

  if (
    trimmedUsername.length === 0 ||
    trimmedEmail.length === 0 ||
    trimmedPassword.length === 0 ||
    trimmedConfirmPassword.length === 0
  ) {
    return { valid: false, reason: 'REQUIRED' };
  }

  if (
    trimmedUsername.length > MAX_USERNAME_LENGTH ||
    trimmedEmail.length > MAX_EMAIL_LENGTH ||
    trimmedPassword.length > MAX_PASSWORD_LENGTH ||
    trimmedConfirmPassword.length > MAX_PASSWORD_LENGTH
  ) {
    return { valid: false, reason: 'TOO_LONG' };
  }

  if (!SIMPLE_EMAIL_PATTERN.test(trimmedEmail)) {
    return { valid: false, reason: 'INVALID_EMAIL' };
  }

  if (trimmedPassword !== trimmedConfirmPassword) {
    return { valid: false, reason: 'PASSWORD_MISMATCH' };
  }

  return { valid: true };
}

/**
 * Attempts to create a new account in the configured Cognito user pool
 * (Requirement 12.5).
 *
 * Builds the Cognito attribute list with `email` always included, and
 * `custom:location` included only when `location` is a non-empty string
 * after trimming (Requirement 12.3 - location is optional).
 *
 * Resolves with `{ username }` on success (the trimmed username that was
 * registered) -- the app has no further use for the `CognitoUser`/
 * `userSub`/`codeDeliveryDetails` values Cognito's callback provides.
 *
 * Rejects with one of (never leaking raw Cognito errors, matching the
 * `login()`/Requirement 8.5 convention):
 *   { kind: 'USERNAME_EXISTS' }        - Cognito UsernameExistsException
 *   { kind: 'INVALID_PASSWORD' }       - Cognito InvalidPasswordException
 *   { kind: 'TIMEOUT_OR_UNREACHABLE' } - anything else, or no response
 *                                         within SIGN_UP_TIMEOUT_MS
 *
 * @param {string} username
 * @param {string} email
 * @param {string} password
 * @param {string} [location]
 * @returns {Promise<{ username: string }>}
 */
export async function signUp(username, email, password, location) {
  // Defensive validation (see login()'s analogous comment): SignUpForm
  // already blocks submission via validateSignUpFields before this is ever
  // called (mirroring how LoginForm blocks on validateCredentials), so this
  // only guards against direct/misuse calls. Requirement 12 defines
  // USERNAME_EXISTS/INVALID_PASSWORD/TIMEOUT_OR_UNREACHABLE as signUp()'s
  // rejection kinds; INVALID_PASSWORD is the closest fit for "the submitted
  // fields are not acceptable," keeping this function's contract limited to
  // those three kinds.
  const validation = validateSignUpFields(username, email, password, password);
  if (!validation.valid) {
    throw { kind: 'INVALID_PASSWORD' };
  }

  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim();
  const trimmedPassword = password.trim();
  const trimmedLocation = typeof location === 'string' ? location.trim() : '';

  const attributeList = [
    new CognitoUserAttribute({ Name: 'email', Value: trimmedEmail }),
  ];
  if (trimmedLocation.length > 0) {
    attributeList.push(
      new CognitoUserAttribute({ Name: 'custom:location', Value: trimmedLocation })
    );
  }

  const signUpPromise = new Promise((resolve, reject) => {
    getUserPool().signUp(
      trimmedUsername,
      trimmedPassword,
      attributeList,
      null,
      (err) => {
        if (err) {
          // Requirement 8.5-style convention: never surface raw Cognito
          // errors. Known, actionable codes get their own kind; anything
          // else (network failure, service outage, unexpected shape) is
          // treated as unreachable.
          const code = err && err.code;
          if (code === 'UsernameExistsException') {
            reject({ kind: 'USERNAME_EXISTS' });
          } else if (code === 'InvalidPasswordException') {
            reject({ kind: 'INVALID_PASSWORD' });
          } else {
            reject({ kind: 'TIMEOUT_OR_UNREACHABLE' });
          }
          return;
        }
        resolve({ username: trimmedUsername });
      }
    );
  });

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject({ kind: 'TIMEOUT_OR_UNREACHABLE' });
    }, SIGN_UP_TIMEOUT_MS);
  });

  try {
    return await Promise.race([signUpPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Confirms a newly created Cognito account using the confirmation code sent
 * to the user's email (Requirement 12.6).
 *
 * Resolves with `true` on success. Rejects with one of:
 *   { kind: 'INVALID_CODE' }           - Cognito CodeMismatchException /
 *                                         ExpiredCodeException
 *   { kind: 'TIMEOUT_OR_UNREACHABLE' } - anything else, or no response
 *                                         within CONFIRM_SIGN_UP_TIMEOUT_MS
 *
 * @param {string} username
 * @param {string} confirmationCode
 * @returns {Promise<true>}
 */
export async function confirmSignUp(username, confirmationCode) {
  const trimmedUsername = typeof username === 'string' ? username.trim() : '';
  const trimmedCode = typeof confirmationCode === 'string' ? confirmationCode.trim() : '';

  const cognitoUser = new CognitoUser({
    Username: trimmedUsername,
    Pool: getUserPool(),
  });

  const confirmPromise = new Promise((resolve, reject) => {
    cognitoUser.confirmRegistration(trimmedCode, true, (err) => {
      if (err) {
        const code = err && err.code;
        if (code === 'CodeMismatchException' || code === 'ExpiredCodeException') {
          reject({ kind: 'INVALID_CODE' });
        } else {
          reject({ kind: 'TIMEOUT_OR_UNREACHABLE' });
        }
        return;
      }
      resolve(true);
    });
  });

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject({ kind: 'TIMEOUT_OR_UNREACHABLE' });
    }, CONFIRM_SIGN_UP_TIMEOUT_MS);
  });

  try {
    return await Promise.race([confirmPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export {
  MAX_USERNAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_LOCATION_LENGTH,
};
