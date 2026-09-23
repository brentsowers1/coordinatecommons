# Requirements Document

## Introduction

This feature is the front-end for a browser-based React web application called the Coordinate_Commons. The application displays a Google Map with an overlay of the boundaries of the 50 US states and Washington D.C. (51 regions in total). The Map_View and the click-to-mark interaction are available to both authenticated and unauthenticated visitors: any visitor can view the map and click a state boundary to mark it as visited (and click again to unmark it). However, only an authenticated user's visited-state marks are persisted, by calling an existing AWS API Gateway endpoint backed by existing AWS Lambda functions (the Visit_Record_API); building or modifying that backend is out of scope for this spec. An unauthenticated user's marks exist only in the browser session and are not sent to the Visit_Record_API; Coordinate_Commons displays a prompt below the Map_View telling unauthenticated users that they need to log in to save their visited states. Users authenticate through a login page that collects a username and password and validates them against an existing AWS Cognito user pool. Visitors without an account can sign up for one from the Login_Page; self-service password reset remains out of scope unless a future spec adds them. The application uses the `make-shared-state-hook` library for state that must be shared across components (for example, session state and the set of visited states).

**Assumptions** (to be confirmed during design if incorrect):
- The Visit_Record_API associates visited-state records with the signed-in user based on the Cognito ID token sent with each request.
- Clicking an already-visited state is intended to unmark it (toggle behavior), since the alternative (no way to undo an accidental click) would leave users unable to correct mistakes.
- "The 50 US states" refers to the standard 50 states. Washington D.C. is in scope as an additional trackable region alongside the 50 US states; US territories remain out of scope unless the user indicates otherwise.

**Confirmed design decisions**:
- When an unauthenticated user logs in, any Visited_State marks made while unauthenticated are discarded and replaced by the Visited_State records retrieved from the Visit_Record_API for that account.

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
3. IF the Visit_Record_API rejects a request due to a missing, invalid, or expired ID token, THEN THE Coordinate_Commons SHALL clear the Session from the Shared_State_Store and display the Map_View.

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
9. WHEN a user moves the mouse pointer over a State_Boundary, THE Map_View SHALL render that State_Boundary's border at a visibly thicker weight than an unhovered State_Boundary's border, and SHALL restore the border to its normal weight once the pointer moves off it.

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
8. WHEN a user submits a sign-up form that passes the validation in criteria 4 through 7, THE Coordinate_Commons SHALL attempt to create a new account in the AWS Cognito user pool using the submitted username, email address, and password, and, if a location was provided, the submitted location, with the attempt completing within a maximum of 10 seconds.
9. WHEN the AWS Cognito user pool accepts the account-creation request, THE Sign_Up_Page SHALL display a control for entering the confirmation code sent to the submitted email address, and a control to submit it.
10. WHEN a user submits a non-empty confirmation code, THE Coordinate_Commons SHALL attempt to confirm the new account in the AWS Cognito user pool using that code, with the attempt completing within a maximum of 10 seconds.
11. IF a user submits an empty confirmation code, THEN THE Sign_Up_Page SHALL prevent submission and display a message indicating that a confirmation code is required.
12. WHEN the AWS Cognito user pool confirms the new account successfully, THE Coordinate_Commons SHALL display a brief success indication and SHALL display the Login_Page, without storing a Session in the Shared_State_Store.
13. IF the AWS Cognito user pool rejects the account-creation request because the submitted username is already in use, THEN THE Sign_Up_Page SHALL display an error message indicating that the username is already taken, and SHALL remain on the Sign_Up_Page's sign-up field step.
14. IF the AWS Cognito user pool rejects the account-creation request because the submitted password does not meet the user pool's password requirements, THEN THE Sign_Up_Page SHALL display an error message indicating that the password does not meet the requirements, and SHALL remain on the Sign_Up_Page's sign-up field step.
15. IF the AWS Cognito user pool rejects the submitted confirmation code as invalid or expired, THEN THE Sign_Up_Page SHALL display an error message indicating that the confirmation code is invalid or has expired, and SHALL remain on the Sign_Up_Page's confirmation-code step.
16. IF an account-creation attempt or a confirmation attempt does not complete within 10 seconds or the AWS Cognito user pool cannot be reached, THEN THE Sign_Up_Page SHALL display an error message indicating that the request could not be completed, SHALL re-enable the relevant submit control, and SHALL remain on the same step of the Sign_Up_Page.
17. WHILE an account-creation or confirmation request is in progress, THE Sign_Up_Page SHALL disable the relevant submit control and display a loading indicator.
