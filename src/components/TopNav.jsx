// TopNav (design.md Component Tree: "AuthGate --> TopNav"; new top-level
// navigation, always visible on every page).
//
// Renders four controls:
//   - "Coordinate Commons" (home): always rendered, regardless of session
//     state. Calls `onNavigateHome` when clicked -- `AuthGate` is the sole
//     owner of the `currentPage` navigation-state enum, so this
//     control never touches that state directly; it just asks the parent
//     to navigate home (`() => setCurrentPage('map')`, per AuthGate.jsx).
//   - `MyPlacesControl` (task 24.4, Requirement 13.1): positioned between
//     the home control and the login/logout control in DOM order, and
//     grouped together with the login/logout control in the same trailing
//     `<ul>` so the two are visually grouped on the right side of the nav
//     (see the Pico.css markup note below). `TopNav` accepts an
//     `onNavigateToMapPage` prop and passes it straight through to
//     `MyPlacesControl`'s own identically-named prop -- `TopNav` has no
//     navigation-state concept of its own (see the home-control bullet
//     above), so it forwards the callback exactly as `AuthGate` wires it
//     (`() => setCurrentPage('map')`, the same callback backing
//     `onNavigateHome`).
//   - "Log in": rendered only when there is no session. Calls
//     `onRequestLogin` when clicked (`() => setCurrentPage('login')`, per
//     AuthGate.jsx). This replaces MapPage's former inline login control.
//   - "Log out": rendered only when there IS a session. Unlike the other
//     two controls, logout doesn't need a callback from the parent --
//     `TopNav` reads `useSession`/`useVisitedPlaceIdsByCategory`/
//     `useSignOutReason` itself (matching LoginPromptBanner.jsx's own
//     pattern of reading shared state directly), calls `handleLogout()`
//     from `sessionHandlers.js`, and applies its full return value
//     (`{ session, visitedStateIds, signOutReason }`) to those three
//     setters directly -- `visitedStateIds` is merged into only the
//     `'us-state'` slice of `useVisitedPlaceIdsByCategory` (task 21.1).
//
// All three are `<a href="#">` anchors, not `<button>` elements -- this is
// a deliberate, explicit choice (superseding this file's original
// button-based reasoning): there are still no real distinct URLs in this
// SPA (no router exists), so each `onClick` handler calls
// `event.preventDefault()` first to stop the browser from jumping to the
// top of the page / appending a bare `#` to the URL, then performs the
// exact same navigation logic a `<button>` would have. Known tradeoff:
// unlike a real anchor pointing at a real destination, an `href="#"` link
// driven entirely by `preventDefault()` + JS does not support "open in new
// tab", middle-click, or right-click-copy-link the way a user might
// expect from a link -- accepted here because the visual/semantic "link"
// look was explicitly requested over button semantics.
//
// Pico.css markup: Pico's documented nav pattern (picocss.com/docs/nav)
// styles a `<nav>` containing one or more `<ul>`/`<li>` groups -- Pico's
// own nav CSS lays out a `<nav>`'s direct `<ul>` children with
// `justify-content: space-between`, spreading them apart left-to-right,
// which used to give this component its "home on the left, login/logout
// on the right" layout for free when there were only two groups. Now that
// `MyPlacesControl` (task 24.4) sits between them in DOM order (still
// satisfying Requirement 13.1's "positioned between" ordering), grouping
// `MyPlacesControl` and the login/logout control visually together on the
// right -- rather than letting Pico's `space-between` spread all three
// groups evenly, which would leave a gap between `MyPlacesControl` and the
// login/logout control -- requires `MyPlacesControl` and the login/logout
// `<li>` to live inside the SAME trailing `<ul>` group, so Pico's
// `space-between` only ever sees two direct `<ul>` children: a leading one
// (home) and a trailing one (`MyPlacesControl` + login/logout together,
// laid out left-to-right within that single `<ul>` by normal inline-list
// flow). DOM order across the whole `<nav>` is unchanged (home,
// `MyPlacesControl`, login/logout), so Requirement 13.1's ordering
// guarantee and the existing `compareDocumentPosition`-based tests still
// hold -- only which `<ul>` each control's `<li>` lives in changed. The
// `<a>` elements themselves, their `data-testid`s, `onClick` handlers, and
// the `href="#"` + `preventDefault()` pattern are unchanged.

import { useSession, useVisitedPlaceIdsByCategory, useSignOutReason } from '../state/sharedState';
import { handleLogout } from '../services/sessionHandlers';
import { MyPlacesControl } from './MyPlacesControl';

/**
 * @param {Object} props
 * @param {() => void} props.onNavigateHome - called when the "Coordinate
 *   Commons" control is clicked.
 * @param {() => void} [props.onNavigateToMapPage] - passed straight
 *   through to `MyPlacesControl`'s identically-named prop; called after
 *   selecting any My_Places_Control option (Requirement 13.5).
 * @param {() => void} props.onRequestLogin - called when the "Log in"
 *   control is clicked (only rendered when there is no session).
 */
export function TopNav({ onNavigateHome, onNavigateToMapPage, onRequestLogin }) {
  const [session, setSession] = useSession();
  const [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
  const [, setSignOutReason] = useSignOutReason();

  function handleHomeClick(event) {
    event.preventDefault();
    onNavigateHome();
  }

  function handleLoginClick(event) {
    event.preventDefault();
    onRequestLogin();
  }

  function handleLogoutClick(event) {
    event.preventDefault();
    const result = handleLogout();
    setSession(result.session);
    // Task 21.1: handleLogout() still returns a flat `{ [stateId]: true }`
    // map scoped to US states; apply it to only the 'us-state' slice of
    // the per-category store so existing behavior is unchanged.
    setVisitedPlaceIdsByCategory((previous) => ({
      ...previous,
      'us-state': result.visitedStateIds,
    }));
    setSignOutReason(result.signOutReason);
  }

  // Spacing fix: measured via getComputedStyle() against the real running
  // page, `nav li` (picocss.com/docs/css-variables) uses
  // `padding: var(--pico-nav-element-spacing-vertical) var(--pico-nav-
  // element-spacing-horizontal)`, and Pico's default
  // `--pico-nav-element-spacing-vertical` is `1rem` -- confirmed 20px
  // top+bottom padding on each `<li>` at this project's base 20px root
  // font size, producing a measured 70px-tall `<nav>`/`<header>` (vs.
  // `<main class="container">`'s own 0px top/bottom padding, so the extra
  // height here is entirely nav-internal, not from the shared `container`
  // class). Overriding just this one variable, scoped to this `<nav>`
  // alone via an inline custom-property style (rather than at `:root`, per
  // Pico's own documented customization approach), drops that `<li>`
  // padding to 5px top+bottom, which measured as a 40px-tall nav after the
  // change -- a visible reduction while keeping the link's own click
  // target padding (`--pico-nav-link-spacing-vertical`, unrelated/
  // untouched) intact.
  return (
    <nav
      aria-label="Main"
      data-testid="top-nav"
      style={{ '--pico-nav-element-spacing-vertical': '0.25rem' }}
    >
      <ul>
        <li>
          <a href="#" onClick={handleHomeClick} data-testid="nav-home-link">
            Coordinate Commons
          </a>
        </li>
      </ul>
      <ul>
        <li>
          <MyPlacesControl onNavigateToMapPage={onNavigateToMapPage} />
        </li>
        <li>
          {session ? (
            <a href="#" onClick={handleLogoutClick} data-testid="nav-logout-link">
              Log out
            </a>
          ) : (
            <a href="#" onClick={handleLoginClick} data-testid="nav-login-link">
              Log in
            </a>
          )}
        </li>
      </ul>
    </nav>
  );
}
