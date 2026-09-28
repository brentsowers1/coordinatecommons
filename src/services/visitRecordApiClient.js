// Visit_Record_API client.
//
// Small fetch-based client for the existing Visit_Record_API (see
// design.md's "Visit_Record_API Contract"). Every exported function:
//   1. Returns immediately without a network call if `session` is `null`
//      (Requirement 7.2 / Property 16).
//   2. Attaches `Authorization: <session.accessToken>` to the
//      request (Requirement 7.1 / Property 15).
//   3. Classifies any 401/403 response as `{ kind: 'AUTH_ERROR' }`
//      (Requirement 2.3/7.3 / Property 6).
//   4. Aborts and rejects with `{ kind: 'TIMEOUT' }` if no response
//      arrives within 10 seconds.
//   5. Classifies any other non-2xx response, network error, or malformed
//      JSON body as `{ kind: 'FAILURE' }`.
//
// The GET (list) request additionally requires a `placeType=<placeCategory>`
// query parameter on the real backend; the POST (save/toggle) request does
// not need it since it already sends `placeType` in its JSON body.
//
// Task 21.10: both functions now accept a `placeCategory` parameter
// (`'us-state' | 'canada-state' | 'country'`, per design.md/Requirement
// 15.2) instead of hardcoding `'us-state'`, so every existing call site
// must pass `'us-state'` explicitly to keep current behavior unchanged.

import { config } from '../config.js';

const REQUEST_TIMEOUT_MS = 10000;

function buildVisitUrl() {
  return `${config.visitRecordApiBaseUrl}/visit`;
}

// The real backend requires `placeType=<placeCategory>` as a query
// parameter on the GET (list) request specifically; the POST (save/toggle)
// request already conveys `placeType` in its JSON body, so it keeps using
// the bare URL from `buildVisitUrl()`.
function buildVisitListUrl(placeCategory) {
  return `${buildVisitUrl()}?placeType=${placeCategory}`;
}

/**
 * Performs a fetch against the Visit_Record_API with the shared
 * timeout/auth-header/error-classification behavior.
 *
 * @param {object} session - non-null Session, already checked by callers.
 * @param {object} init - fetch init options (method, body, etc.), without
 *   `headers.Authorization` or `signal` (those are added here).
 * @param {string} url - the full request URL.
 * @returns {Promise<any>} the parsed JSON response body.
 * @throws {{ kind: 'AUTH_ERROR' | 'TIMEOUT' | 'FAILURE' }}
 */
async function performRequest(session, init, url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init && init.headers),
        Authorization: session.accessToken,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw { kind: 'TIMEOUT' };
    }
    throw { kind: 'FAILURE' };
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401 || response.status === 403) {
    throw { kind: 'AUTH_ERROR' };
  }

  if (!response.ok) {
    throw { kind: 'FAILURE' };
  }

  try {
    return await response.json();
  } catch {
    throw { kind: 'FAILURE' };
  }
}

/**
 * Fetches the signed-in user's visited-place records for the given
 * Place_Category via `GET /visit?placeType=<placeCategory>`.
 *
 * Resolves with an array of placeId strings (e.g. `['AZ', 'CA']`), mapped
 * from the API's `placesVisited[].Id` field. Resolves with an empty array
 * (and issues no network call) when `session` is `null`.
 *
 * @param {object|null} session
 * @param {'us-state'|'canada-state'|'country'} placeCategory
 * @returns {Promise<string[]>}
 * @throws {{ kind: 'AUTH_ERROR' | 'TIMEOUT' | 'FAILURE' }}
 */
export async function listVisitedPlaces(session, placeCategory) {
  if (!session) {
    return [];
  }

  const body = await performRequest(session, { method: 'GET' }, buildVisitListUrl(placeCategory));
  const placesVisited = (body && body.placesVisited) || [];
  return placesVisited.map((entry) => entry.Id);
}

/**
 * Creates or updates the visited status of a single place, within the
 * given Place_Category, for the signed-in user. Unmarking a place reuses
 * this same operation with `visited: false` rather than a separate delete
 * call.
 *
 * Resolves immediately (and issues no network call) when `session` is
 * `null`.
 *
 * @param {object|null} session
 * @param {'us-state'|'canada-state'|'country'} placeCategory
 * @param {string} placeId
 * @param {boolean} visited
 * @returns {Promise<{ username: string, placeId: string, visited: boolean }|void>}
 * @throws {{ kind: 'AUTH_ERROR' | 'TIMEOUT' | 'FAILURE' }}
 */
export async function saveVisitedPlace(session, placeCategory, placeId, visited) {
  if (!session) {
    return;
  }

  return performRequest(
    session,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placeId,
        placeType: placeCategory,
        visited,
      }),
    },
    buildVisitUrl()
  );
}
