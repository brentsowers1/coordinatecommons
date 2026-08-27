# Implementation Plan: State Visit Tracker (Coordinate Commons)

## Overview

This plan implements the Coordinate Commons front end in JavaScript/JSX (per design.md), using `make-shared-state-hook` for shared state, `amazon-cognito-identity-js` for authentication, a hand-written fetch client for the Visit_Record_API, and the Google Maps JavaScript API for the map. Tests use Jest, React Testing Library, and `fast-check` for property-based tests (minimum 100 runs each). Work proceeds bottom-up: configuration and shared state first, then the pure logic layers (validation, session handlers, region hit-testing, fill color, toggle handler, info-panel content), then the API client and data-loading flows, then the Google Maps rendering components, and finally the login UI and top-level wiring.

## Tasks

- [x] 1. Set up project structure and dependencies
  - [x] 1.1 Initialize project scaffold and install dependencies
    - Create the source directory layout (e.g. `src/components/`, `src/state/`, `src/services/`, `src/data/`, `src/config.js`)
    - Install `react`, `react-dom`, `make-shared-state-hook`, `amazon-cognito-identity-js`
    - Install and configure `jest`, `@testing-library/react`, and `fast-check` as dev dependencies, with a `test` script
    - _Requirements: 8.1, 8.6, 8.7_

- [x] 2. Implement the configuration module
  - [x] 2.1 Create `config.js`
    - Export the config object with `visitRecordApiBaseUrl`, `googleMaps.apiKey`, `cognito.userPoolId`, `cognito.clientId`, `cognito.region`
    - _Requirements: 8.2, 8.3, 8.4_

- [x] 3. Implement the shared state module
  - [x] 3.1 Create `sharedState.js`
    - Define `useSession`, `useVisitedStateIds`, `useInfoPanelStateId`, `usePendingStateIds`, and `useToastError` via `makeSharedStateHook`
    - _Requirements: 8.6, 8.7_

- [x] 4. Implement credential validation and login against Cognito
  - [x] 4.1 Implement `validateCredentials(username, password)` in `authenticationService.js`
    - Enforce non-empty (after trim) and max-length rules (username ≤ 128, password ≤ 256)
    - _Requirements: 1.3, 1.4_
  - [x] 4.2 Write property test for credential validation
    - **Property 1: Credential validation accepts only well-formed, non-empty input**
    - **Validates: Requirements 1.3, 1.4**
  - [x] 4.3 Implement `login(username, password)` in `authenticationService.js`
    - Wrap `amazon-cognito-identity-js` against the pool built from `config.cognito`, enforce a 10-second timeout, resolve with a Session on success, reject with `{ kind: 'INVALID_CREDENTIALS' | 'TIMEOUT_OR_UNREACHABLE' }` otherwise
    - _Requirements: 1.5, 1.8, 1.9, 8.4, 8.5_
  - [x] 4.4 Write property test for failed/unreachable login never creating a session
    - **Property 3: A failed or unreachable authentication attempt never creates a Session**
    - **Validates: Requirements 1.8, 1.9, 8.5**

- [x] 5. Implement session lifecycle handlers
  - [x] 5.1 Implement the login-success handler in `sessionHandlers.js`
    - On successful authentication, set `useSession` and reset `useVisitedStateIds` to `{}`
    - _Requirements: 1.6_
  - [x] 5.2 Write property test for login-success discarding prior visited-state data
    - **Property 2: Successful login discards prior visited-state data**
    - **Validates: Requirements 1.6**
  - [x] 5.3 Implement the logout handler in `sessionHandlers.js`
    - Clear `useSession` and `useVisitedStateIds`
    - _Requirements: 2.1_
  - [x] 5.4 Write property test for logout clearing session and visited-state data
    - **Property 4: Logout always clears session and visited-state data**
    - **Validates: Requirements 2.1**
  - [x] 5.5 Implement token-expiry and auth-error session-clearing in `sessionHandlers.js`
    - Check `session.expiresAt` before any Visit_Record_API call and skip the call if expired; clear the session on an `AUTH_ERROR` response from either operation; set a short-lived `signOutReason` (`'LOGOUT' | 'SESSION_ENDED'`) alongside every session clear
    - _Requirements: 2.2, 2.3, 2.4, 7.3_
  - [x] 5.6 Write property test for expired access token blocking the call and clearing the session
    - **Property 5: An expired access token blocks the API call and clears the session**
    - **Validates: Requirements 2.2**
  - [x] 5.7 Write property test for an authentication-error response clearing the session
    - **Property 6: An authentication-error response always clears the session**
    - **Validates: Requirements 2.3, 7.3**
  - [x] 5.8 Write unit test for the sign-out-reason wording distinction
    - Verify `signOutReason` is `'SESSION_ENDED'` for expiry/auth-error and absent/`'LOGOUT'` for manual logout
    - _Requirements: 2.4_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement the Visit_Record_API client
  - [x] 7.1 Implement `listVisitedStates(session)` and `saveVisitedState(session, stateId, visited)` in `visitRecordApiClient.js`
    - Build request URLs from `config.visitRecordApiBaseUrl`, appending `?placeType=us-state` for the GET (list) request only; attach `Authorization: <token>`; use `AbortController` for a 10-second timeout; classify `401`/`403` as `AUTH_ERROR`, other failures/timeouts as `TIMEOUT`/`FAILURE`; short-circuit with no `fetch` call when `session` is `null`; parse `placesVisited[].Id` into a `stateId` array for list, and send `{ placeId, placeType: 'us-state', visited }` for save
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 7.2 Write property test for the Authorization header on every request
    - **Property 15: Every Visit_Record_API request carries the session's access token as the Authorization header**
    - **Validates: Requirements 7.1**
  - [x] 7.3 Write property test for no request being sent when there is no session
    - **Property 16: No session means no request is ever sent**
    - **Validates: Requirements 7.2**
  - [x] 7.4 Write unit tests for timeout, failure, and auth-error classification
    - Cover both `listVisitedStates` and `saveVisitedState` with a mocked `fetch`
    - _Requirements: 4.4, 5.3_

- [x] 8. Implement the visited-states loading flow
  - [x] 8.1 Implement the load-on-mount effect for an authenticated Map_View in `useVisitedStatesLoader.js`
    - Call `listVisitedStates` with a 10-second timeout when a Session exists; expose `status: 'loading' | 'ready' | 'error'` and `retry()`
    - _Requirements: 4.1, 4.2, 4.5_
  - [x] 8.2 Implement the load-success handler in `useVisitedStatesLoader.js`
    - Replace `useVisitedStateIds` with exactly the returned list of `stateId`s (including empty)
    - _Requirements: 4.3, 4.6_
  - [x] 8.3 Write property test for load-success replacing the store with exactly what the API returned
    - **Property 8: Loading visited states replaces the store with exactly what the API returned**
    - **Validates: Requirements 4.3**
  - [x] 8.4 Implement the guest initialization path in `useVisitedStatesLoader.js`
    - Skip the Visit_Record_API call entirely for an unauthenticated session and preserve any existing local `visitedStateIds`
    - _Requirements: 4.7_
  - [x] 8.5 Write property test for guest initialization never calling the API and preserving local marks
    - **Property 9: Guest initialization never calls the API and preserves local marks**
    - **Validates: Requirements 4.7**
  - [x] 8.6 Write unit tests for the 10-second load timeout and its retry control
    - _Requirements: 4.4, 4.5_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement region boundary data and hit-testing
  - [x] 10.1 Create the static boundary GeoJSON asset and the `Region` shape in `stateBoundaries.js`
    - One Feature per region (51 total), each with a stable `stateId` (USPS code, `DC` for the district)
    - _Requirements: 3.2_
  - [x] 10.2 Write unit test verifying exactly 51 regions with no missing or duplicated boundary
    - _Requirements: 3.2_
  - [x] 10.3 Implement `useRegionsLoader()` in `stateBoundaries.js`
    - Fetch and parse the GeoJSON asset on mount; expose `status: 'loading' | 'ready' | 'error'`, `regions`, and `retry()`
    - _Requirements: 3.3, 3.4_
  - [x] 10.4 Implement `resolveRegionAtLatLng(latLng, regions)` in `stateBoundaries.js`
    - Pure ray-casting point-in-polygon lookup returning the containing `stateId` or `null`
    - _Requirements: 3.5, 3.6_
  - [x] 10.5 Write property test for region hit-testing
    - **Property 7: Region hit-testing resolves clicks to exactly the containing region, or none**
    - **Validates: Requirements 3.5, 3.6**

- [x] 11. Implement fill-color derivation
  - [x] 11.1 Implement `resolveFillColor(stateId, visitedStateIds)` in `resolveFillColor.js`
    - Two fixed, distinct colors, keyed solely on membership
    - _Requirements: 6.1, 6.3_
  - [x] 11.2 Write property test for fill color
    - **Property 14: Fill color is exactly one of two fixed, distinct colors, determined solely by membership**
    - **Validates: Requirements 6.1, 6.3**

- [x] 12. Implement Google Map rendering
  - [x] 12.1 Implement `useGoogleMapsLoader()` in `useGoogleMapsLoader.js`
    - Load the Google Maps JavaScript API script tag using `config.googleMaps.apiKey`; expose `status: 'loading' | 'ready' | 'error'` and `retry()`
    - _Requirements: 8.2_
  - [x] 12.2 Implement `MapView`/`GoogleMapCanvas`
    - Combine the map-script and boundary-fetch loading states into a single loading indicator that clears only once both are ready; show a combined error/retry control identifying which source(s) failed; create one `google.maps.Map` fitted to a fixed viewport including Alaska and Hawaii once both loaders report ready
    - _Requirements: 3.1, 3.3, 3.4_
  - [x] 12.3 Write unit tests for loading/error/retry UI
    - Mock `fetch` and the Maps script loader at the component level; cover map-only failure, boundary-only failure, and both failing
    - _Requirements: 3.3, 3.4_
  - [x] 12.4 Write unit test for the fixed initial viewport
    - Verify the initial center/zoom displays all 50 states and Washington D.C., including Alaska and Hawaii, without panning or zooming
    - _Requirements: 3.1_
  - [x] 12.5 Implement `StateBoundaryOverlay`
    - Render exactly 51 `google.maps.Polygon`s colored via `resolveFillColor`; register a single map-level `click` and `mousemove`/`mouseout` listener; resolve hits via `resolveRegionAtLatLng`; update `useInfoPanelStateId` on hover changes
    - _Requirements: 3.5, 3.6, 6.2, 8.3_
  - [x] 12.6 Write smoke tests confirming the Maps script loads and both a map and the region overlay are constructed
    - _Requirements: 8.2, 8.3, 8.4_
  - [x] 12.7 Write unit test for color-update timing after a visited-status change
    - Verify the rendered fill color updates within 1 second of a `visitedStateIds` change, without a page reload
    - _Requirements: 6.2_

- [x] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement the mark/unmark toggle handler
  - [x] 14.1 Implement `handleStateBoundaryClick(session, visitedStateIds, pendingStateIds, stateId, apiClient)` in `handleStateBoundaryClick.js`
    - No-op if `stateId` is pending; otherwise flip membership and mark pending; if authenticated, issue a single `saveVisitedState` call matching the new membership, reverting and surfacing a toast error on failure/timeout, always clearing pending when the call settles; if unauthenticated, skip the API call entirely
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_
  - [x] 14.2 Write property test for the authenticated toggle
    - **Property 10: Clicking a state as an authenticated user always toggles it and issues the matching request**
    - **Validates: Requirements 5.1, 5.2**
  - [x] 14.3 Write property test for reverting on a failed or timed-out save
    - **Property 11: A failed or timed-out save always reverts the optimistic update**
    - **Validates: Requirements 5.3**
  - [x] 14.4 Write property test for repeated clicks on a pending state
    - **Property 12: Repeated clicks on a pending state have no additional effect**
    - **Validates: Requirements 5.4**
  - [x] 14.5 Write property test for the unauthenticated toggle
    - **Property 13: Clicking a state as an unauthenticated user always toggles it locally and never calls the API**
    - **Validates: Requirements 5.5, 5.6**
  - [x] 14.6 Wire `handleStateBoundaryClick` into `StateBoundaryOverlay`'s click listener
    - Surface the toast error from `useToastError` on revert
    - _Requirements: 5.3, 9.4_

- [x] 15. Implement the State_Info_Panel
  - [x] 15.1 Implement `computeInfoPanelContent(infoPanelStateId, regionsById, visitedStateIds)` in `computeInfoPanelContent.js`
    - Returns `{ stateId: null }` when nothing is targeted, otherwise `{ stateId, name, visited }`
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6_
  - [x] 15.2 Write property test for the targeted region's name and visited status
    - **Property 18: The info panel always displays the currently targeted region's name and visited status**
    - **Validates: Requirements 10.2, 10.4**
  - [x] 15.3 Write property test for the neutral placeholder
    - **Property 19: The info panel shows the neutral placeholder whenever nothing is targeted**
    - **Validates: Requirements 10.3, 10.5**
  - [x] 15.4 Write property test for reflecting visited-status changes without re-targeting
    - **Property 20: The info panel reflects visited-status changes for the currently targeted region without re-targeting**
    - **Validates: Requirements 10.6**
  - [x] 15.5 Implement `StateInfoPanel`
    - Render in a fixed position below the map (not a tooltip); detect hover capability once via `matchMedia('(hover: hover) and (pointer: fine)')` and set `useInfoPanelStateId` from click instead of hover on touch-only devices; available regardless of authentication state
    - _Requirements: 10.1, 10.7, 10.8_
  - [x] 15.6 Write property test for hover-incapable devices
    - **Property 21: On hover-incapable devices, the info panel always reflects the most recent click**
    - **Validates: Requirements 10.8**
  - [x] 15.7 Write unit test for the fixed (non-tooltip) positioning of the State_Info_Panel
    - _Requirements: 10.1_

- [x] 16. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Implement the login prompt banner
  - [x] 17.1 Implement `shouldShowLoginPrompt(session)` in `shouldShowLoginPrompt.js`
    - _Requirements: 9.2, 9.3_
  - [x] 17.2 Write property test for the login prompt's visibility
    - **Property 17: The login prompt is visible exactly when there is no session**
    - **Validates: Requirements 9.2, 9.3**
  - [x] 17.3 Implement `LoginPromptBanner`
    - Render below `MapView` whenever `shouldShowLoginPrompt` is true; distinguish wording using `signOutReason` (manual logout vs. session ended)
    - _Requirements: 9.2, 9.3, 2.4_
  - [x] 17.4 Write integration test for guest local marks persisting across a re-render
    - Verify marks made while unauthenticated remain in memory across a re-render and trigger zero Visit_Record_API calls
    - _Requirements: 9.1, 9.4_

- [x] 18. Implement the Login_Page and Login_Form
  - [x] 18.1 Implement `LoginForm`
    - Username/password fields, client-side validation via `validateCredentials` blocking submission without calling Cognito, submit control disabled with a loading indicator while `login()` is pending
    - _Requirements: 1.3, 1.4, 1.10_
  - [x] 18.2 Implement `LoginPage`
    - Wire `authenticationService.login`, the login-success handler, invalid-credentials and timeout error messages, and navigation back to Map_View on success
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 1.9_
  - [x] 18.3 Write unit tests for Login_Page behavior
    - Cover loading/disabled-state UI, the invalid-credentials message, and the timeout/unreachable message
    - _Requirements: 1.1, 1.2, 1.8, 1.9, 1.10_

- [x] 19. Wire up top-level application components
  - [x] 19.1 Implement `AuthGate` and `MapPage`
    - `AuthGate` reads `useSession` and chooses between `MapPage` (default) and `LoginPage`; `MapPage` composes `MapView` and `LoginPromptBanner`
    - _Requirements: 1.1, 1.2, 9.1, 9.2, 9.3_
  - [x] 19.2 Implement `App`
    - Instantiate the shared-state hooks module and render `AuthGate`
    - _Requirements: 8.1, 8.6, 8.7_
  - [x] 19.3 Write integration test for login followed by the Requirement 4 load
    - Verify successful login populates the map with the Visit_Record_API's returned visited states
    - _Requirements: 1.6, 1.7_

- [x] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Every property test corresponds 1:1 to one of the 21 correctness properties in design.md and must be implemented with `fast-check`, minimum 100 runs, tagged with a comment referencing its property (e.g. `// Feature: state-visit-tracker, Property 7: Region hit-testing resolves clicks to exactly the containing region, or none`).
- `sessionHandlers.js`, `useVisitedStatesLoader.js`, and `stateBoundaries.js` are each touched by more than one task; those tasks are sequenced so no two run concurrently against the same file.
- `StateBoundaryOverlay.js` is written first in task 12.5 (rendering + hit-testing wiring) and revisited in task 14.6 (toggle-handler wiring) once `handleStateBoundaryClick` exists.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "10.1"] },
    { "id": 2, "tasks": ["4.2", "4.3", "7.1", "10.2", "10.3", "11.1", "12.1", "14.1", "15.1", "17.1", "18.1"] },
    { "id": 3, "tasks": ["4.4", "5.1", "7.2", "7.3", "7.4", "8.1", "10.4", "11.2", "12.2", "14.2", "14.3", "14.4", "14.5", "15.2", "15.3", "15.4", "15.5", "17.2"] },
    { "id": 4, "tasks": ["5.2", "5.3", "8.2", "8.6", "10.5", "12.3", "12.4", "12.5", "15.6", "15.7", "18.2"] },
    { "id": 5, "tasks": ["5.4", "5.5", "8.3", "8.4", "12.6", "12.7", "14.6", "18.3"] },
    { "id": 6, "tasks": ["5.6", "5.7", "5.8", "8.5", "17.3"] },
    { "id": 7, "tasks": ["17.4", "19.1"] },
    { "id": 8, "tasks": ["19.2"] },
    { "id": 9, "tasks": ["19.3"] }
  ]
}
```
