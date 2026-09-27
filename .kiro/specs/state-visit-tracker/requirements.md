# Requirements Document

## Introduction

This feature is the front-end for a browser-based React web application called the Coordinate_Commons. The application displays a Google Map with an overlay of the boundaries of the 50 US states and Washington D.C. (51 regions in total). The Map_View and the click-to-mark interaction are available to both authenticated and unauthenticated visitors: any visitor can view the map and click a state boundary to mark it as visited (and click again to unmark it). However, only an authenticated user's visited-state marks are persisted, by calling an existing AWS API Gateway endpoint backed by existing AWS Lambda functions (the Visit_Record_API); building or modifying that backend is out of scope for this spec. An unauthenticated user's marks exist only in the browser session and are not sent to the Visit_Record_API; Coordinate_Commons displays a prompt below the Map_View telling unauthenticated users that they need to log in to save their visited states. Users authenticate through a login page that collects a username and password and validates them against an existing AWS Cognito user pool. Visitors without an account can sign up for one from the Login_Page; self-service password reset remains out of scope unless a future spec adds them. The application uses the `make-shared-state-hook` library for state that must be shared across components (for example, session state and the set of visited states).

**Assumptions** (to be confirmed during design if incorrect):
- The Visit_Record_API associates visited-state records with the signed-in user based on the Cognito ID token sent with each request.
- Clicking an already-visited state is intended to unmark it (toggle behavior), since the alternative (no way to undo an accidental click) would leave users unable to correct mistakes.
- "The 50 US states" refers to the standard 50 states. Washington D.C. is in scope as an additional trackable region alongside the 50 US states; US territories remain out of scope unless the user indicates otherwise.

In addition to US states, Coordinate_Commons lets a user track visited Canadian provinces and visited countries. A "My Places" control in the top navigation lets the user switch which of these three Place_Categories (US states, Canadian provinces, or countries) is currently displayed on the Map_View and tracked as visited; only one Place_Category's boundaries are shown at a time. The Requirement 1-12 behaviors above (login, session handling, map rendering, marking/unmarking, visual indication, authenticated API requests, guest access, hover info, and the visited/unvisited lists) apply identically regardless of which Place_Category is currently selected, per Requirement 13 below.

**Confirmed design decisions**:
- When an unauthenticated user logs in, any Visited_State marks made while unauthenticated are discarded and replaced by the Visited_State records retrieved from the Visit_Record_API for that account.
- When a user switches the selected Place_Category, Coordinate_Commons keeps each previously-loaded Place_Category's Visited_Place records cached in the Shared_State_Store rather than discarding them, so that switching back to a previously-viewed Place_Category during the same session redisplays its already-known visited status immediately, without re-requesting it from the Visit_Record_API. Coordinate_Commons only requests a Place_Category's Visited_Place records from the Visit_Record_API the first time that Place_Category is selected in a given session (or on retry after a failed request).

## Glossary

- **Coordinate_Commons**: The React single-page web application, named Coordinate Commons, described in this document.
- **Login_Page**: The page presented to a visitor for entering a username and password.
- **Sign_Up_Page**: The page presented to a visitor for creating a new account in the existing AWS Cognito user pool, and for entering the confirmation code sent to their email to complete that account's creation.
- **Authentication_Service**: The integration layer within Coordinate_Commons that authenticates a user against the existing AWS Cognito user pool.
- **Session**: The authenticated user's active login state within Coordinate_Commons, including the Cognito-issued ID token.
- **Map_View**: The primary view of Coordinate_Commons that renders the Google Map together with the State_Boundary overlay.
- **State_Boundary**: A polygon overlaid on Map_View representing the geographic boundary of one of the 50 US states or Washington D.C.
- **State_Info_Panel**: A fixed area positioned below the Map_View (not a tooltip that follows the mouse pointer) that displays the name and visited status of the State_Boundary currently under the user's mouse pointer.
- **Visited_State**: A State_Boundary that the current user has marked as visited in the Shared_State_Store. For an authenticated user this is persisted via the Visit_Record_API; for an unauthenticated user it exists only in the Shared_State_Store and is not persisted.
- **Visit_Record_API**: The existing AWS API Gateway endpoint, backed by existing AWS Lambda functions, used to create, remove, and retrieve visited-state records for the signed-in user.
- **Shared_State_Store**: Application state created and accessed through the `make-shared-state-hook` library, shared across React components.
- **Place_Category**: One of the three kinds of region Coordinate_Commons can display and track: US states (including Washington D.C.), Canadian provinces, or countries. Each Place_Category corresponds to exactly one `placeType` value sent to the Visit_Record_API: `us-state`, `canada-state`, or `country` respectively.
- **My_Places_Control**: The control in the top navigation that lets a user open a dropdown and select the currently selected Place_Category.
- **Selected_Place_Category**: The single Place_Category currently displayed on the Map_View and used for marking, unmarking, and listing Visited_Place records. Defaults to US states.
- **Place_Boundary**: A polygon overlaid on Map_View representing the geographic boundary of one region within a Place_Category (a State_Boundary is the Place_Boundary for the US-states Place_Category; a Canadian province's or a country's boundary is a Place_Boundary for its respective Place_Category).
- **Visited_Place**: A Place_Boundary that the current user has marked as visited in the Shared_State_Store, uniquely identified by the combination of its Place_Category and its place id. A Visited_State is the Visited_Place for the US-states Place_Category.

## Requirements

### Requirement 1: User Login

**User Story:** As a visitor, I want to optionally log in with a username and password, so that I can save the states I mark as visited to my account.

#### Acceptance Criteria

1. WHILE a user is not authenticated, THE Coordinate_Commons SHALL display the Map_View as the default view, with a control available to navigate to the Login_Page.
2. WHEN an unauthenticated user selects the login control, THE Coordinate_Commons SHALL display the Login_Page.
3. THE Login_Page SHALL provide input fields for a username (maximum 128 characters) and a password (maximum 256 characters), and a control to submit them.
4. IF a user submits the login form with an empty username or an empty password, THEN THE Login_Page SHALL prevent submission and display a message indicating that both fields are required.
5. WHEN a user submits a non-empty username and password, THE Authentication_Service SHALL attempt to authenticate the user against the AWS Cognito user pool, with the attempt completing within a maximum of 10 seconds.
6. WHEN the Authentication_Service authenticates a user successfully, THE Coordinate_Commons SHALL store the resulting Session in the Shared_State_Store, SHALL discard any Visited_State records present in the Shared_State_Store from before authentication, and SHALL display the Map_View.
7. WHEN the Map_View is displayed following successful authentication, THE Coordinate_Commons SHALL request that user's Visited_State records from the Visit_Record_API per Requirement 4, and, upon receiving them, THE Map_View SHALL visually indicate every returned Visited_State as visited.
8. IF the Authentication_Service rejects the submitted credentials as invalid, THEN THE Login_Page SHALL display an error message indicating that the username or password is invalid, and SHALL remain on the Login_Page.
9. IF the authentication attempt does not complete within 10 seconds or the AWS Cognito user pool cannot be reached, THEN THE Login_Page SHALL display an error message indicating that the login attempt could not be completed, SHALL re-enable the submit control, and SHALL remain on the Login_Page.
10. WHILE an authentication request is in progress, THE Login_Page SHALL disable the submit control and display a loading indicator.

### Requirement 2: Session Expiration and Logout

**User Story:** As a user, I want my session to end when I log out or when it expires, so that my account stays secure.

#### Acceptance Criteria

1. WHEN a signed-in user selects a logout control, THE Coordinate_Commons SHALL clear the Session and the Visited_State records from the Shared_State_Store, and SHALL display the Map_View.
2. IF the Cognito ID token stored in the Session has expired at the time the Coordinate_Commons attempts to call the Visit_Record_API, THEN THE Coordinate_Commons SHALL clear the Session from the Shared_State_Store and SHALL display the Map_View instead of completing that call.
3. IF a call to the Visit_Record_API returns an authentication error, THEN THE Coordinate_Commons SHALL clear the Session from the Shared_State_Store and SHALL display the Map_View.
4. WHEN THE Coordinate_Commons clears the Session due to logout, token expiration, or an authentication error from the Visit_Record_API, THE Coordinate_Commons SHALL display the login-prompt message described in Requirement 9 below the Map_View, and, for token expiration or an authentication error specifically, SHALL indicate that the user was signed out because their session ended.
5. WHILE a user is authenticated, THE Coordinate_Commons SHALL display a control available to log out.

### Requirement 3: Map Rendering with State Boundaries

**User Story:** As a user, I want to see a map of the United States with each state's boundary outlined, so that I can identify and select individual states.

#### Acceptance Criteria

1. WHEN a user's Map_View loads, THE Map_View SHALL render a Google Map whose initial viewport (center and zoom) displays all 50 US states and Washington D.C., including Alaska and Hawaii, without requiring the user to pan or zoom.
2. WHEN Map_View renders the Google Map, THE Map_View SHALL overlay exactly one State_Boundary for each of the 50 US states and Washington D.C. (51 regions total), with no region's boundary missing or duplicated.
3. WHILE the Google Map or the State_Boundary overlays are loading, THE Map_View SHALL display a loading indicator.
4. IF the Google Map or the State_Boundary overlays fail to load, THEN THE Map_View SHALL display an error message and a control to retry loading.
5. WHEN a user clicks within the rendered area of a State_Boundary, THE Map_View SHALL determine which single one of the 50 US states or Washington D.C. corresponds to the clicked State_Boundary.
6. IF a user clicks a location on the Google Map that is not within the rendered area of any State_Boundary, THEN THE Map_View SHALL take no state-identification action.

### Requirement 4: Loading Visited States on Startup

**User Story:** As a signed-in user, I want the map to already show which states I've previously visited, so that I don't lose track of my progress between sessions.

#### Acceptance Criteria

1. WHEN an authenticated user's Map_View loads or is redisplayed immediately after successful authentication, THE Coordinate_Commons SHALL request the current list of Visited_State records from the Visit_Record_API for that user, with a request timeout of 10 seconds.
2. WHILE that request is in progress, THE Map_View SHALL display a loading indicator.
3. WHEN the Visit_Record_API returns the list of Visited_State records, THE Coordinate_Commons SHALL store the returned Visited_State records, including an empty list if the user has no prior visits, in the Shared_State_Store.
4. IF the request for the list of Visited_State records fails, including cases where no response is received within 10 seconds, THEN THE Map_View SHALL display an error message indicating that the visited states could not be loaded, and a control to retry the request.
5. WHEN a signed-in user selects the retry control, THE Coordinate_Commons SHALL re-request the current list of Visited_State records from the Visit_Record_API for that user.
6. WHEN Visited_State records are stored in the Shared_State_Store, THE Map_View SHALL update to visually indicate each corresponding state as visited.
7. WHEN an unauthenticated user's Map_View loads, THE Coordinate_Commons SHALL NOT request Visited_State records from the Visit_Record_API, and SHALL initialize the Shared_State_Store's Visited_State records as empty unless local marks already exist from the current browser session.

### Requirement 5: Marking and Unmarking a Visited State

**User Story:** As a user, I want to click a state to mark it as visited, and click it again to undo that mark, so that I can record my travel history and correct mistakes.

#### Acceptance Criteria

1. WHEN an authenticated user clicks a State_Boundary that is not a Visited_State, THE Coordinate_Commons SHALL immediately update the Shared_State_Store to mark that state as a Visited_State and SHALL send a request to the Visit_Record_API to create a visited-state record for that state.
2. WHEN an authenticated user clicks a State_Boundary that is a Visited_State, THE Coordinate_Commons SHALL immediately update the Shared_State_Store to unmark that state as a Visited_State and SHALL send a request to the Visit_Record_API to remove the visited-state record for that state.
3. IF a request to create or remove a visited-state record does not complete successfully within 10 seconds or receives an explicit failure response, THEN THE Coordinate_Commons SHALL revert the affected state's status in the Shared_State_Store to its value immediately before the click and SHALL display an error message to the user indicating that the update did not save.
4. WHILE a create or remove request for a given State_Boundary is pending, THE Coordinate_Commons SHALL ignore further click events on that State_Boundary until the request completes or fails.
5. WHEN an unauthenticated user clicks a State_Boundary that is not a Visited_State, THE Coordinate_Commons SHALL update the Shared_State_Store to mark that state as a Visited_State without sending any request to the Visit_Record_API.
6. WHEN an unauthenticated user clicks a State_Boundary that is a Visited_State, THE Coordinate_Commons SHALL update the Shared_State_Store to unmark that state without sending any request to the Visit_Record_API.

### Requirement 6: Visual Indication of Visited Status

**User Story:** As a user, I want visited and unvisited states to look visually distinct, so that I can tell at a glance which states I've been to.

#### Acceptance Criteria

1. THE Map_View SHALL render every Visited_State using a single fill color, and SHALL render every State_Boundary that is not a Visited_State using a different, single fill color, such that the two fill colors are never identical.
2. WHEN the visited status of a State_Boundary changes in the Shared_State_Store, THE Map_View SHALL update that State_Boundary's rendered fill color to match the new status within 1 second of the change, without requiring a page reload.
3. IF the visited status of a State_Boundary is not yet available from the Shared_State_Store, THEN THE Map_View SHALL render that State_Boundary using the fill color defined for a State_Boundary that is not a Visited_State.

### Requirement 7: Authenticated API Requests

**User Story:** As a system operator, I want every request to the visited-state backend to be authenticated, so that visited-state data stays scoped to the correct user.

#### Acceptance Criteria

1. THE Coordinate_Commons SHALL include the signed-in user's Cognito ID token from the Session in the Authorization header of every request it sends to the Visit_Record_API.
2. WHILE the Shared_State_Store contains no Session, THE Coordinate_Commons SHALL NOT send any request to the Visit_Record_API.
3. IF the Visit_Record_API rejects a request due to a missing, invalid, or expired ID token, THEN THE Coordinate_Commons SHALL make a best-effort attempt to clear the Session from the Shared_State_Store and display the Map_View, without treating an occasional failure to complete either action as a defect.

### Requirement 8: Technical Constraints

**User Story:** As a developer maintaining this application, I want the front end built with the specified map provider, authentication provider, and state-sharing library, so that it integrates with the existing infrastructure and follows the project's established conventions.

#### Acceptance Criteria

1. THE Coordinate_Commons SHALL be implemented as a React web application.
2. THE Map_View SHALL render its map using the Google Maps JavaScript API.
3. THE Map_View SHALL render the State_Boundary overlay on the map using the Google Maps JavaScript API.
4. THE Authentication_Service SHALL authenticate users against AWS Cognito.
5. IF AWS Cognito rejects a user's authentication attempt or is unreachable, THEN THE Authentication_Service SHALL deny access and present an error indication to the user without creating a Session.
6. THE Coordinate_Commons SHALL create, update, and persist the Session in the Shared_State_Store using the `make-shared-state-hook` library.
7. THE Coordinate_Commons SHALL create, update, and persist the set of Visited_State records in the Shared_State_Store using the `make-shared-state-hook` library.

### Requirement 9: Guest Access and Login Prompt

**User Story:** As an unauthenticated visitor, I want to view the map and mark states as visited without logging in, and be reminded that I need to log in to save my visits, so that I can try out the application before deciding to create an account or log in.

#### Acceptance Criteria

1. WHILE a user is not authenticated, THE Coordinate_Commons SHALL allow that user to view the Map_View and click State_Boundary elements to mark or unmark them as visited, per Requirement 5.
2. WHILE a user is not authenticated, THE Coordinate_Commons SHALL display, in an area below the Map_View, a persistent message indicating that the user must log in to save their visited states.
3. WHILE a user is authenticated, THE Coordinate_Commons SHALL NOT display the login-prompt message described in criterion 2.
4. WHEN an unauthenticated user marks or unmarks a State_Boundary as visited, THE Map_View SHALL update the rendered fill color of that State_Boundary per Requirement 6, without persisting the change to the Visit_Record_API.

### Requirement 10: State Hover Information

**User Story:** As a user, I want to see the name of the state under my mouse and whether I've marked it as visited, so that I can identify states on the map without relying on visual color alone.

#### Acceptance Criteria

1. THE State_Info_Panel SHALL be rendered in a fixed area below the Map_View, and SHALL NOT be rendered as a tooltip or element that moves with or follows the mouse pointer.
2. WHEN a user moves the mouse pointer over a State_Boundary, THE State_Info_Panel SHALL display that state's name and its current visited status (visited or not visited).
3. WHEN a user moves the mouse pointer off a State_Boundary without moving it onto another State_Boundary, THE State_Info_Panel SHALL stop displaying that state's name and visited status.
4. WHEN a user moves the mouse pointer from one State_Boundary directly onto a different State_Boundary, THE State_Info_Panel SHALL update to display the name and visited status of the newly hovered state.
5. WHILE no State_Boundary is under the user's mouse pointer, THE State_Info_Panel SHALL display a neutral placeholder (no state name or visited status).
6. WHEN the visited status of the currently hovered State_Boundary changes in the Shared_State_Store, THE State_Info_Panel SHALL update the displayed visited status to match, without requiring the user to move the mouse.
7. THE State_Info_Panel SHALL be usable by both authenticated and unauthenticated users, per Requirement 9.
8. IF the user's input device does not support hover (e.g., touch-only), THEN THE State_Info_Panel SHALL display the name and visited status of the most recently clicked State_Boundary instead of relying on hover.
9. IF the user's input device does not support hover and the user has not yet clicked any State_Boundary, THEN THE State_Info_Panel SHALL display the neutral placeholder described in criterion 5.
10. WHEN a user moves the mouse pointer over a State_Boundary, THE Map_View SHALL render that State_Boundary's border at a visibly thicker weight than an unhovered State_Boundary's border, and SHALL restore the border to its normal weight once the pointer moves off it.

### Requirement 11: Visited and Unvisited States List

**User Story:** As a user, I want to see a list of which states I have and have not marked as visited, so that I can review my overall progress at a glance without hovering over every state individually.

#### Acceptance Criteria

1. THE Coordinate_Commons SHALL display, in an area below the Map_View, two lists of state names: a Visited_State list positioned on the left, and a list of State_Boundary entries that are not Visited_State positioned on the right.
2. THE two lists SHALL together include exactly the currently loaded State_Boundary entries, with each State_Boundary appearing in exactly one of the two lists according to its current visited status.
3. WHEN the visited status of a State_Boundary changes in the Shared_State_Store, THE Coordinate_Commons SHALL move that State_Boundary's name to the appropriate list within 1 second of the change, without requiring a page reload.
4. THE two lists SHALL be available to both authenticated and unauthenticated users, per Requirement 9.

### Requirement 12: Self-Service Sign-Up

**User Story:** As a visitor without an account, I want to create one myself from the Login_Page, so that I can start saving my visited states without contacting anyone else to set up access.

#### Acceptance Criteria

1. WHILE a user is viewing the Login_Page, THE Coordinate_Commons SHALL display a control available to navigate to the Sign_Up_Page.
2. WHEN a user selects the sign-up control, THE Coordinate_Commons SHALL display the Sign_Up_Page.
3. THE Sign_Up_Page SHALL provide input fields for a username (maximum 128 characters, required), an email address (maximum 254 characters, required), a location (maximum 128 characters, optional), a password (maximum 256 characters, required), and a password confirmation (maximum 256 characters, required), and a control to submit them.
4. IF a user submits the sign-up form with an empty username, empty email address, empty password, or empty password confirmation, THEN THE Sign_Up_Page SHALL prevent submission and display a message indicating that those fields are required.
5. IF a user submits the sign-up form with a username, email address, password, or password confirmation exceeding its maximum length, THEN THE Sign_Up_Page SHALL prevent submission and display a message indicating that a field is too long.
6. IF a user submits the sign-up form with an email address that is not a well-formed email address, THEN THE Sign_Up_Page SHALL prevent submission and display a message indicating that the email address is invalid.
7. IF a user submits the sign-up form with a password and password confirmation that do not match, THEN THE Sign_Up_Page SHALL prevent submission and display a message indicating that the password and confirmation do not match.
8. WHEN a user submits a sign-up form that passes the validation in criteria 4 through 7, THE Coordinate_Commons SHALL initiate an attempt to create a new account in the AWS Cognito user pool using the submitted username, email address, and password, and, if a location was provided, the submitted location.
9. WHEN the AWS Cognito user pool accepts the account-creation request, THE Sign_Up_Page SHALL display a control for entering the confirmation code sent to the submitted email address, and a control to submit it.
10. WHEN a user submits a non-empty confirmation code, THE Coordinate_Commons SHALL attempt to confirm the new account in the AWS Cognito user pool using that code, with the attempt completing within a maximum of 10 seconds.
11. IF a user submits an empty confirmation code, THEN THE Sign_Up_Page SHALL prevent submission and display a message indicating that a confirmation code is required.
12. WHEN the AWS Cognito user pool confirms the new account successfully, THE Coordinate_Commons SHALL display a brief success indication and SHALL display the Login_Page, without storing a Session in the Shared_State_Store.
13. IF the AWS Cognito user pool rejects the account-creation request because the submitted username is already in use, THEN THE Sign_Up_Page SHALL display an error message indicating that the username is already taken, and SHALL remain on the Sign_Up_Page's sign-up field step.
14. IF the AWS Cognito user pool rejects the account-creation request because the submitted password does not meet the user pool's password requirements, THEN THE Sign_Up_Page SHALL display an error message indicating that the password does not meet the requirements, and SHALL remain on the Sign_Up_Page's sign-up field step.
15. IF the AWS Cognito user pool rejects the submitted confirmation code as invalid or expired, THEN THE Sign_Up_Page SHALL display an error message indicating that the confirmation code is invalid or has expired, and SHALL remain on the Sign_Up_Page's confirmation-code step.
16. IF an account-creation attempt or a confirmation attempt does not complete within 10 seconds or the AWS Cognito user pool cannot be reached, THEN THE Sign_Up_Page SHALL display an error message indicating that the request could not be completed, SHALL re-enable the relevant submit control, and SHALL remain on the same step of the Sign_Up_Page.
17. WHILE an account-creation or confirmation request is in progress, THE Sign_Up_Page SHALL disable the relevant submit control and display a loading indicator.

### Requirement 13: My Places Control

**User Story:** As a user, I want to switch between tracking US states, Canadian provinces, and countries from the top navigation, so that I can record my travel history across more than one kind of place.

#### Acceptance Criteria

1. THE Coordinate_Commons SHALL display the My_Places_Control in the top navigation, positioned between the "Coordinate Commons" home control and the login/logout control.
2. WHEN a user selects the My_Places_Control, THE Coordinate_Commons SHALL display a dropdown offering exactly three options: "US States", "Canadian Provinces", and "Countries".
3. THE Selected_Place_Category SHALL default to US states when Coordinate_Commons first loads.
4. THE My_Places_Control SHALL display the option corresponding to the current Selected_Place_Category as its visible label while the dropdown is closed, and SHALL indicate which of the three options corresponds to the Selected_Place_Category while the dropdown is open.
5. WHEN a user selects an option from the My_Places_Control dropdown, THE Coordinate_Commons SHALL set the Selected_Place_Category to the Place_Category corresponding to that option and SHALL display the Map_View, regardless of which page was displayed immediately before the selection and regardless of whether the selected option matches the Selected_Place_Category already in effect.
6. THE My_Places_Control SHALL be available to both authenticated and unauthenticated users, per Requirement 9.
7. WHEN a user dismisses the open My_Places_Control dropdown without selecting an option, THE Coordinate_Commons SHALL close the dropdown, SHALL leave the Selected_Place_Category unchanged, and SHALL leave the currently displayed page unchanged.

### Requirement 14: Switching the Selected Place Category

**User Story:** As a user, I want the map to show only one kind of place at a time when I switch categories, so that the map stays readable and I can focus on one kind of travel history at a time.

#### Acceptance Criteria

1. WHEN the Selected_Place_Category changes, THE Map_View SHALL replace the currently rendered Place_Boundary overlays with the Place_Boundary overlays for the newly Selected_Place_Category, such that Place_Boundary overlays for at most one Place_Category are rendered at any time.
2. WHILE the Place_Boundary data or Visited_Place records for the newly Selected_Place_Category are loading for the first time in the current session, THE Map_View SHALL display a loading indicator, per Requirements 3 and 4 applied to that Place_Category.
3. IF the Place_Boundary data for the newly Selected_Place_Category fails to load, THEN THE Map_View SHALL display an error message and a control to retry loading, per Requirement 3.4 applied to that Place_Category, WHILE that Place_Category remains the Selected_Place_Category.
4. IF the request for Visited_Place records for the newly Selected_Place_Category fails, THEN THE Map_View SHALL display an error message and a control to retry the request, per Requirement 4.4 applied to that Place_Category, WHILE that Place_Category remains the Selected_Place_Category.
5. WHEN a user switches the Selected_Place_Category to a Place_Category whose Place_Boundary data and, for an authenticated user, Visited_Place records were already successfully loaded earlier in the current session, THE Coordinate_Commons SHALL redisplay that Place_Category's previously loaded Visited_Place records without sending a new request to the Visit_Record_API.
6. WHEN a user switches the Selected_Place_Category, THE Coordinate_Commons SHALL retain the Visited_Place records of every other Place_Category in the Shared_State_Store unchanged.
7. IF the Selected_Place_Category changes again before a Place_Boundary data or Visited_Place records request for a previously Selected_Place_Category has completed, THEN THE Coordinate_Commons SHALL discard the result of that in-progress request without rendering it or storing it in the Shared_State_Store.

### Requirement 15: Place Category Scoped Tracking

**User Story:** As a user, I want my visited marks, the visited/unvisited lists, and the hover info panel to reflect whichever category of place I'm currently viewing, so that marking a province or country doesn't get confused with marking a state that happens to share the same code.

#### Acceptance Criteria

1. THE Coordinate_Commons SHALL identify a Visited_Place uniquely by the combination of its Place_Category and the identifier of its Place_Boundary, such that marking a Place_Boundary as visited in one Place_Category SHALL NOT cause a Place_Boundary with the same identifier in a different Place_Category to be treated as visited.
2. WHEN Coordinate_Commons sends a request to the Visit_Record_API to list, create, or remove a visited-place record, THE Coordinate_Commons SHALL send the `placeType` value corresponding to the Selected_Place_Category at the time the request is made (`us-state`, `canada-state`, or `country`).
3. THE Map_View SHALL render the fill colors described in Requirement 6 using only the Place_Boundary entries and Visited_Place status of the Selected_Place_Category.
4. THE State_Info_Panel SHALL display the name and visited status described in Requirement 10 using only the Place_Boundary entries and Visited_Place status of the Selected_Place_Category.
5. THE visited/unvisited lists described in Requirement 11 SHALL display only the Place_Boundary entries and Visited_Place status of the Selected_Place_Category.
6. WHEN a user marks or unmarks a Place_Boundary as visited per the behavior described in Requirement 5, including its authenticated and unauthenticated cases, THE Coordinate_Commons SHALL apply that mark or unmark only to the Visited_Place record of the Selected_Place_Category for that Place_Boundary, and SHALL leave the Visited_Place records of every other Place_Category unchanged.
7. THE map-rendering and loading behavior described in Requirements 3 and 4 SHALL apply to the Place_Boundary entries and Visited_Place records of the Selected_Place_Category.
8. THE guest-access and login-prompt behavior described in Requirement 9 SHALL apply regardless of the Selected_Place_Category.
