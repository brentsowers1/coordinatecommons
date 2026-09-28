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
  - [x] 5.6 Write property test for expired ID token blocking the call and clearing the session
    - **Property 5: An expired ID token blocks the API call and clears the session**
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
    - **Property 15: Every Visit_Record_API request carries the session's ID token as the Authorization header**
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

- [x] 21. Rename and generalize existing modules to Place_Category-aware symbol names
  - [x] 21.1 Generalize `sharedState.js` for Place_Category-scoped state
    - Add `useSelectedPlaceCategory` (default `'us-state'`); replace `useVisitedStateIds`'s flat `{ [stateId]: true }` shape with `useVisitedPlaceIdsByCategory`'s `{ 'us-state': {}, 'canada-state': {}, country: {} }` shape; replace `usePendingStateIds` with `usePendingPlaceIds` using the same per-category shape; rename `useInfoPanelStateId` to `useInfoPanelPlaceId`
    - Update every existing call site of the renamed/reshaped hooks (`TopNav.jsx`, `sessionHandlers.js`, `StateBoundaryOverlay.js`, `handleStateBoundaryClick.js`, `computeInfoPanelContent.js`/`StateInfoPanel.jsx`, `partitionRegionsByVisited.js`/`VisitedStatesLists.jsx` if present, `useVisitedStatesLoader.js`, `LoginPage.jsx`) to read/write only the `'us-state'` slice so existing behavior is unchanged
    - _Requirements: 15.1, 15.6_
  - [x] 21.2 Rename `stateBoundaries.js` to `placeBoundaries.js` and generalize its loader
    - Rename the `Region` shape to `PlaceBoundary` (`stateId` field renamed to `placeId`); rename `useRegionsLoader()` to `usePlaceBoundariesLoader(placeCategory)`, keyed internally by category so a second mount for an already-loaded category reuses its cached result instead of re-fetching; keep the existing `us-state` GeoJSON asset as that category's data
    - _Requirements: 14.5_
  - [x] 21.3 Rename `resolveRegionAtLatLng` to `resolvePlaceBoundaryAtLatLng`
    - Update its parameter name (`regions` to `placeBoundaries`) and every call site; update the existing property test (Property 7) in place to use the new name/parameter without duplicating it
    - _Requirements: 15.7_
  - [x] 21.4 Rename `resolveFillColor`'s parameter to a single category's slice
    - Rename its `stateId`/`visitedStateIds` parameters to `placeId`/`visitedPlaceIds`; update the existing property test (Property 14) in place to reflect the renamed parameters and the new "single category's slice" framing
    - _Requirements: 15.3_
  - [x] 21.5 Rename `partitionRegionsByVisited` to `partitionPlaceBoundariesByVisited`
    - Update its parameter names (`regions`/`visitedStateIds` to `placeBoundaries`/`visitedPlaceIds`) and every call site; update the existing property test (Property 22) in place
    - _Requirements: 15.5_
  - [x] 21.6 Rename `handleStateBoundaryClick` to `handlePlaceBoundaryClick`
    - Add a `placeCategory` parameter threaded through to the `saveVisitedPlace` call (see task 21.9); rename its other parameters (`visitedStateIds`/`pendingStateIds`/`stateId` to `visitedPlaceIdsForCategory`/`pendingPlaceIdsForCategory`/`placeId`); update the existing property tests (Properties 10-13) in place to pass a `placeCategory` and use the new parameter names, rather than duplicating them
    - _Requirements: 15.2, 15.6_
  - [x] 21.7 Rename `StateInfoPanel` to `PlaceInfoPanel` and generalize `computeInfoPanelContent`
    - Rename `computeInfoPanelContent`'s parameters (`infoPanelStateId`/`regionsById`/`visitedStateIds` to `infoPanelPlaceId`/`placeBoundariesById`/`visitedPlaceIds`) and its returned `stateId` field to `placeId`; update `PlaceInfoPanel` to read `useInfoPanelPlaceId` and pass only the Selected_Place_Category's boundaries-by-id map and visited-id slice; update the existing property tests (Properties 18-21) and unit test in place
    - _Requirements: 15.4_
  - [x] 21.8 Rename `VisitedStatesLists` (if present) to `PlaceVisitStatusLists`
    - Update it to read `useSelectedPlaceCategory` and pass only that category's `placeBoundaries`/visited-id slice into `partitionPlaceBoundariesByVisited`
    - _Requirements: 15.5_
  - [x] 21.9 Rename `useVisitedStatesLoader.js` to `useVisitedPlacesLoader.js`, parameterized by `placeCategory`
    - Rename the exported hook to `useVisitedPlacesLoader(placeCategory)`; internally key its loaded/loading/error state and cached results by `placeCategory` so mounting it for an already-loaded category reuses that category's cached slice instead of re-fetching; keep existing `'us-state'` behavior (load-on-mount, guest path, load-success replace, retry) unchanged when called with `placeCategory: 'us-state'`
    - _Requirements: 14.5, 15.7_
  - [x] 21.10 Rename `visitRecordApiClient.js`'s functions to accept a `placeCategory`
    - Rename `listVisitedStates(session)` to `listVisitedPlaces(session, placeCategory)`, appending `?placeType=<placeCategory>` instead of the hardcoded `?placeType=us-state`; rename `saveVisitedState(session, stateId, visited)` to `saveVisitedPlace(session, placeCategory, placeId, visited)`, sending `placeType: placeCategory` instead of the hardcoded `'us-state'` in the request body; update every call site to pass `'us-state'` explicitly so existing behavior is unchanged; update the existing property tests (Properties 15, 16) and unit tests in place to cover all three `placeCategory` values
    - _Requirements: 15.2_

- [x] 22. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 23. Implement `usePlaceBoundariesLoader` per-category caching for the new Place_Categories
  - [x] 23.1 Add placeholder GeoJSON boundary assets for `canada-state` and `country`
    - Create a minimal placeholder/stub GeoJSON asset for each of the two new categories (e.g. a small handful of valid `Feature`s with `placeId`/`name`/geometry) so `usePlaceBoundariesLoader` and its tests are not blocked; flag in a code comment that a real data source for these two categories is an open follow-up item per design.md, not permanent data
    - _Requirements: 13.2, 13.4_
  - [x] 23.2 Extend `usePlaceBoundariesLoader(placeCategory)` to fetch the correct asset per category
    - Route each of the three `placeCategory` values to its own GeoJSON asset path; verify cache reuse (no re-fetch) when re-mounted for a category already `ready` this session
    - _Requirements: 14.5_
  - [x] 23.3 Write property test for switching categories never issuing a duplicate request for already-loaded boundary data
    - **Property 28: Switching to an already-loaded category never issues a new request for its data**
    - **Validates: Requirements 14.5**

- [x] 24. Implement `MyPlacesControl` and `useSelectedPlaceCategory`
  - [x] 24.1 Implement the `PLACE_CATEGORY_OPTIONS` constant and `MyPlacesControl` component
    - Controlled dropdown showing the Selected_Place_Category's label as closed-state button text; on open, indicates which of the three options matches the current Selected_Place_Category; does not read `useSession`
    - _Requirements: 13.2, 13.3, 13.4, 13.6_
  - [x] 24.2 Implement selection and dismiss behavior in `MyPlacesControl`
    - On selecting an option, call `useSelectedPlaceCategory`'s setter with that option's `placeCategory` regardless of whether it matches the value already in effect, and request navigation to `MapPage` via the same navigation callback prop pattern `TopNav`'s home control uses, regardless of which page was showing; on dismissing the dropdown without selecting (click-outside or Escape), close it without calling the setter or requesting navigation
    - _Requirements: 13.5, 13.7_
  - [x] 24.3 Write property test for selection always setting a defined category, and dismiss never changing it
    - **Property 26: Selecting a My_Places_Control option always sets the Selected_Place_Category to a defined value, and dismissing never changes it**
    - **Validates: Requirements 13.5, 13.7**
  - [x] 24.4 Wire `MyPlacesControl` into `TopNav`, positioned between the home control and the login/logout control
    - _Requirements: 13.1_
  - [x] 24.5 Write unit tests for `MyPlacesControl` UI and placement
    - Cover `TopNav` control ordering (13.1), the dropdown showing exactly three options with the current selection indicated (13.2, 13.4), and that it renders identically for authenticated and unauthenticated sessions (13.6)
    - _Requirements: 13.1, 13.2, 13.4, 13.6_

- [x] 25. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 26. Implement per-category visited-place loading with cache reuse and stale-request discard
  - [x] 26.1 Implement the per-category loaded/loading/error state and cache reuse in `useVisitedPlacesLoader(placeCategory)`
    - Skip re-issuing `listVisitedPlaces` for a category already `ready` or currently `loading`; skip the API call entirely for an unauthenticated session per category, preserving any existing local slice; replace exactly that category's slice on success, leaving every other category's slice untouched
    - _Requirements: 14.2, 14.4, 14.5, 14.6_
  - [x] 26.2 Implement the Stale Request Discard mechanism in `useVisitedPlacesLoader(placeCategory)` (and `usePlaceBoundariesLoader`)
    - On settling, compare the request's closure-captured `placeCategory` against the current `useSelectedPlaceCategory()` value; if they differ, discard the result without writing to `useVisitedPlaceIdsByCategory` or changing that category's cached status
    - _Requirements: 14.7_
  - [x] 26.3 Write property test for a category's slice always replaced with exactly what the API returned, leaving other categories untouched
    - **Property 8: Loading visited places for a category replaces that category's slice with exactly what the API returned**
    - **Validates: Requirements 4.3, 14.6**
  - [x] 26.4 Write property test for the Selected_Place_Category never mutating another category's stored records on switch
    - **Property 29: Switching the Selected_Place_Category never mutates any other category's stored Visited_Place records**
    - **Validates: Requirements 14.6**
  - [x] 26.5 Write property test for stale in-flight results always being discarded without mutating the store
    - **Property 30: A stale in-flight request's result is always discarded without mutating the store**
    - **Validates: Requirements 14.7**
  - [x] 26.6 Write unit tests for the per-category loading/error/retry UI
    - Cover the loading indicator remaining visible until both the map script and the Selected_Place_Category's boundary fetch are ready, and the error/retry control identifying which source(s) failed, scoped to the Selected_Place_Category
    - _Requirements: 14.2, 14.3, 14.4_

- [x] 27. Implement cross-category Visited_Place identity isolation and placeType propagation
  - [x] 27.1 Write property test for Visited_Place identity being scoped by (placeCategory, placeId)
    - **Property 31: Visited_Place identity is scoped by (placeCategory, placeId); marking one category's place never marks another category's place of the same id**
    - **Validates: Requirements 15.1, 15.6**
  - [x] 27.2 Write property test for every request carrying the Selected_Place_Category's placeType
    - **Property 32: Every Visit_Record_API request sent while a category is selected carries that category's placeType**
    - **Validates: Requirements 15.2**

- [x] 28. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 29. Wire `MapView`/`PlaceBoundaryOverlay` to render only the Selected_Place_Category's data
  - [x] 29.1 Update `MapView` to select boundaries/visited-place slice by `useSelectedPlaceCategory()`
    - Pass only the Selected_Place_Category's `placeBoundaries` (from `usePlaceBoundariesLoader(selectedPlaceCategory)`) and visited-id slice (from `useVisitedPlaceIdsByCategory()[selectedPlaceCategory]`) into `PlaceBoundaryOverlay`; tear down the previous category's polygons/listeners on a category switch
    - _Requirements: 14.1, 15.3_
  - [x] 29.2 Update `MapView`'s combined loading and error/retry UI to be scoped per Selected_Place_Category
    - Loading indicator remains visible until the map script and that category's boundary fetch are both ready; error/retry control identifies which source(s) failed and retries only the failed source(s), for the currently Selected_Place_Category
    - _Requirements: 14.2, 14.3, 14.4_
  - [x] 29.3 Reset `useInfoPanelPlaceId` to `null` when `useSelectedPlaceCategory` changes
    - _Requirements: 15.4_
  - [x] 29.4 Write property test for exactly one category's boundaries ever being current after a switch
    - **Property 27: Switching the Selected_Place_Category always results in exactly one category's boundaries being current**
    - **Validates: Requirements 14.1**

- [x] 30. Update `PlaceInfoPanel` and `PlaceVisitStatusLists` to read only the Selected_Place_Category's slice
  - [x] 30.1 Verify/adjust `PlaceInfoPanel` reads `useSelectedPlaceCategory` and scopes both `placeBoundariesById` and `visitedPlaceIds` to it
    - _Requirements: 15.4_
  - [x] 30.2 Verify/adjust `PlaceVisitStatusLists` reads `useSelectedPlaceCategory` and scopes both `placeBoundaries` and `visitedPlaceIds` to it
    - _Requirements: 15.5_
  - [ ]* 30.3 Write unit tests for `PlaceInfoPanel` and `PlaceVisitStatusLists` reflecting only the Selected_Place_Category's data after a category switch
    - _Requirements: 15.4, 15.5_

- [x] 31. Update the login-success handler to clear every category's slice
  - [x] 31.1 Update the login-success handler in `sessionHandlers.js` to reset every category's slice of `useVisitedPlaceIdsByCategory` to `{}`
    - _Requirements: 1.6_
  - [x] 31.2 Write property test for login discarding prior visited-place data for every category
    - **Property 2: Successful login discards prior visited-place data for every category**
    - **Validates: Requirements 1.6**

- [x] 32. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x]* 33. Write integration test for rapid category switching with out-of-order mocked resolution
  - Switch the Selected_Place_Category twice in quick succession (e.g. `us-state` → `canada-state` → `country`) before the first switch's mocked `listVisitedPlaces`/boundary-fetch resolves, resolve the mocks out of order, and assert the discarded category's data never appears in `useVisitedPlaceIdsByCategory` or on the rendered map, while the finally-selected category's own load still completes and renders normally
  - _Requirements: 14.7_

- [x] 34. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Every property test corresponds 1:1 to one of the 32 correctness properties in design.md and must be implemented with `fast-check`, minimum 100 runs, tagged with a comment referencing its property (e.g. `// Feature: state-visit-tracker, Property 7: Place boundary hit-testing resolves clicks to exactly the containing boundary, or none`).
- `sessionHandlers.js`, `useVisitedStatesLoader.js`/`useVisitedPlacesLoader.js`, and `stateBoundaries.js`/`placeBoundaries.js` are each touched by more than one task; those tasks are sequenced so no two run concurrently against the same file.
- `StateBoundaryOverlay.js` is written first in task 12.5 (rendering + hit-testing wiring) and revisited in task 14.6 (toggle-handler wiring) once `handleStateBoundaryClick` exists.
- Tasks 21.1-21.10 rename/generalize files and hooks that earlier, already-completed tasks (1-20) created for the US-states-only version; they are written as explicit rename/refactor tasks rather than silent rewrites of the historical plan, and each instructs updating (not duplicating) that symbol's existing property/unit tests in place.
- The `canada-state`/`country` boundary GeoJSON data source is an open item (task 23.1 uses a placeholder/stub asset); replacing it with a real data source is a follow-up not covered by this plan.

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
    { "id": 9, "tasks": ["19.3"] },
    { "id": 10, "tasks": ["21.1"] },
    { "id": 11, "tasks": ["21.2", "21.4", "21.9", "21.10"] },
    { "id": 12, "tasks": ["21.3", "21.5", "21.6"] },
    { "id": 13, "tasks": ["21.7", "21.8"] },
    { "id": 14, "tasks": ["23.1", "24.1"] },
    { "id": 15, "tasks": ["23.2", "24.2"] },
    { "id": 16, "tasks": ["23.3", "24.3", "24.4"] },
    { "id": 17, "tasks": ["24.5"] },
    { "id": 18, "tasks": ["26.1"] },
    { "id": 19, "tasks": ["26.2"] },
    { "id": 20, "tasks": ["26.3", "26.4", "26.5", "26.6", "27.1", "27.2"] },
    { "id": 21, "tasks": ["29.1"] },
    { "id": 22, "tasks": ["29.2", "29.3"] },
    { "id": 23, "tasks": ["29.4", "30.1", "30.2"] },
    { "id": 24, "tasks": ["30.3", "31.1"] },
    { "id": 25, "tasks": ["31.2"] },
    { "id": 26, "tasks": ["33"] }
  ]
}
```
