// Session lifecycle handlers (design.md: "Session Lifecycle (Requirements
// 1, 2, 7)").
//
// Like `handleStateBoundaryClick` (src/components/handleStateBoundaryClick.js),
// these are *pure orchestration functions*: they never call
// `make-shared-state-hook`'s `useSession`/`useVisitedStateIds` hooks
// directly and never touch the DOM or the network themselves. Each handler
// takes plain data in and returns the plain data the caller should apply to
// shared state, which keeps them directly property-testable (design.md's
// stated testability goal) without mocking React or the hooks module.
//
// This file is added to incrementally by tasks 5.1 (login-success), 5.3
// (logout), and 5.5 (token-expiry / auth-error clearing) — see tasks.md's
// note that those tasks are sequenced so no two run concurrently against
// this file.

/**
 * @typedef {Object.<string, true>} VisitedStateIds
 *
 * @typedef {Object} Session
 * @property {string} username
 * @property {string} accessToken
 * @property {number} expiresAt
 */

/**
 * Login-success handler (Requirement 1.6; design.md Property 2: "Successful
 * login discards prior visited-state data").
 *
 * `loginResult` is the Session object resolved by
 * `authenticationService.login()` (`{ username, accessToken, expiresAt }`).
 * Regardless of any `visitedStateIds` present before authentication
 * (including none/empty), the result always resets `visitedStateIds` to
 * `{}` — the prior value is unconditionally discarded, so this function
 * doesn't need it as an input. The caller (e.g. LoginPage, task 18.2) is
 * responsible for actually calling `useSession`'s setter and
 * `useVisitedStateIds`'s setter with this function's return values.
 *
 * @param {Session} loginResult - the resolved Session from `login()`.
 * @returns {{ session: Session, visitedStateIds: VisitedStateIds }}
 */
export function handleLoginSuccess(loginResult) {
  return {
    session: loginResult,
    visitedStateIds: {},
  };
}

/**
 * @typedef {'LOGOUT' | 'SESSION_ENDED'} SignOutReason
 */

/**
 * Shared "clear the session" handler (Requirements 2.1, 2.2, 2.3, 2.4).
 *
 * Every place the app clears the Session — manual logout, an expired
 * access token caught before a Visit_Record_API call, or an `AUTH_ERROR`
 * response from the Visit_Record_API — always yields the same
 * `session === null` / `visitedStateIds === {}` shape, but the *reason*
 * differs (Requirement 2.4 / the LoginPromptBanner's need to distinguish
 * manual logout from an expiration/auth-error sign-out). `signOutReason` is
 * intentionally short-lived application state, not persisted: callers are
 * expected to store it alongside the session clear and it's up to the
 * consumer (LoginPromptBanner, task 17.3) to decide how long it stays
 * relevant.
 *
 * @param {SignOutReason} reason
 * @returns {{ session: null, visitedStateIds: VisitedStateIds, signOutReason: SignOutReason }}
 */
export function handleSessionCleared(reason) {
  return {
    session: null,
    visitedStateIds: {},
    signOutReason: reason,
  };
}

/**
 * Logout handler (Requirement 2.1; design.md Property 4: "Logout always
 * clears session and visited-state data").
 *
 * Regardless of the prior `Session` (including null) or the prior
 * `visitedStateIds` map, logging out always yields `session === null` and
 * `visitedStateIds === {}` — like `handleLoginSuccess`, the outcome doesn't
 * depend on any prior state, so this function takes no arguments. The
 * caller (e.g. a logout control's click handler) is responsible for
 * actually calling `useSession`'s setter and `useVisitedStateIds`'s setter
 * with this function's return values.
 *
 * Delegates to `handleSessionCleared('LOGOUT')` so that manual logout and
 * the expiry/auth-error paths share one implementation of "what a session
 * clear looks like." The additional `signOutReason` field this now returns
 * is additive — existing callers that only read `result.session` /
 * `result.visitedStateIds` are unaffected.
 *
 * @returns {{ session: null, visitedStateIds: VisitedStateIds, signOutReason: 'LOGOUT' }}
 */
export function handleLogout() {
  return handleSessionCleared('LOGOUT');
}

/**
 * Expiry/auth-error session-clearing handler (Requirements 2.2, 2.3, 2.4,
 * 7.3; design.md Property 6: "An authentication-error response always
 * clears the session").
 *
 * Used both for a proactively-detected expired access token (Property 5,
 * via `checkSessionBeforeApiCall` below) and for a Visit_Record_API
 * response classified as `{ kind: 'AUTH_ERROR' }`, regardless of which
 * operation (list/save) produced it — both cases are "the session ended
 * out from under the user," as opposed to a deliberate logout, so both use
 * `signOutReason: 'SESSION_ENDED'`.
 *
 * @returns {{ session: null, visitedStateIds: VisitedStateIds, signOutReason: 'SESSION_ENDED' }}
 */
export function handleSessionExpiredOrAuthError() {
  return handleSessionCleared('SESSION_ENDED');
}

/**
 * Handler for a Visit_Record_API call rejecting with
 * `{ kind: 'AUTH_ERROR' }` (Requirements 2.3, 7.3; Property 6).
 *
 * Applicable regardless of which operation (`listVisitedStates` or
 * `saveVisitedState`) produced the rejection — the caller is responsible
 * for catching that rejection and invoking this handler, then applying its
 * result to shared state.
 *
 * @returns {{ session: null, visitedStateIds: VisitedStateIds, signOutReason: 'SESSION_ENDED' }}
 */
export function handleApiAuthError() {
  return handleSessionExpiredOrAuthError();
}

/**
 * Determines whether a Session's access token has already expired
 * (Requirement 2.2; Property 5).
 *
 * Comparison: a Session is considered expired when `session.expiresAt` is
 * strictly before the current time (`session.expiresAt < Date.now()`) —
 * i.e. a token that expires at exactly the current millisecond is treated
 * as still valid (not-yet-expired) rather than expired, since `expiresAt`
 * marks the instant it becomes invalid, not the last valid instant.
 *
 * A `null` session (no Session at all) is treated as "not expired" —
 * there's no access token to have expired, and callers that care whether a
 * Visit_Record_API call should be attempted at all already have a separate
 * check for "no session" (Requirement 7.2 / Property 16, handled by the
 * Visit_Record_API client itself). This function only answers "is the
 * token in *this* Session past its expiry," not "is there a Session."
 *
 * @param {Session|null} session
 * @returns {boolean}
 */
export function isSessionExpired(session) {
  if (!session) {
    return false;
  }
  return session.expiresAt < Date.now();
}

/**
 * Pre-flight check to run before issuing any Visit_Record_API call
 * (Requirement 2.2; Property 5: "An expired access token blocks the API
 * call and clears the session").
 *
 * Callers (e.g. a future `useVisitedStatesLoader.js` /
 * `handleStateBoundaryClick.js` integration — not part of this task) check
 * `session.expiresAt` via this function *before* invoking
 * `listVisitedStates`/`saveVisitedState`, so that an expired token never
 * results in a network request at all — as opposed to `AUTH_ERROR`
 * handling (`handleApiAuthError`), which reacts to a response already
 * received from the API.
 *
 * @param {Session|null} session
 * @returns {{ shouldCallApi: true } | { shouldCallApi: false, sessionCleared: { session: null, visitedStateIds: VisitedStateIds, signOutReason: 'SESSION_ENDED' } }}
 */
export function checkSessionBeforeApiCall(session) {
  if (isSessionExpired(session)) {
    return {
      shouldCallApi: false,
      sessionCleared: handleSessionExpiredOrAuthError(),
    };
  }
  return { shouldCallApi: true };
}
