// TopNav (design.md Component Tree: "AuthGate --> TopNav"; new top-level
// navigation, always visible on every page).
//
// Renders three controls:
//   - "Coordinate Commons" (home): always rendered, regardless of session
//     state. Calls `onNavigateHome` when clicked -- `AuthGate` is the sole
//     owner of the `showLoginPage` navigation-state boolean, so this
//     control never touches that state directly; it just asks the parent
//     to navigate home (`() => setShowLoginPage(false)`, per AuthGate.jsx).
//   - "Log in": rendered only when there is no session. Calls
//     `onRequestLogin` when clicked (`() => setShowLoginPage(true)`, per
//     AuthGate.jsx). This replaces MapPage's former inline login control.
//   - "Log out": rendered only when there IS a session. Unlike the other
//     two controls, logout doesn't need a callback from the parent --
//     `TopNav` reads `useSession`/`useVisitedStateIds`/`useSignOutReason`
//     itself (matching LoginPromptBanner.jsx's own pattern of reading
//     shared state directly), calls `handleLogout()` from
//     `sessionHandlers.js`, and applies its full return value
//     (`{ session, visitedStateIds, signOutReason }`) to those three
//     setters directly.
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
// styles a `<nav>` containing one or more `<ul>`/`<li>` groups -- multiple
// `<ul>`s inside the same `<nav>` are laid out left-to-right in order,
// which is exactly the "home on the left, login/logout on the right"
// layout this component already needed. So the home link is wrapped in
// its own leading `<ul><li>`, and the login/logout link in a second,
// trailing `<ul><li>`; Pico's own nav CSS spaces the two groups apart,
// which replaces the previous manual
// `style={{ display: 'flex', justifyContent: 'space-between', ... }}`
// inline style. The `<a>` elements themselves, their `data-testid`s,
// `onClick` handlers, and the `href="#"` + `preventDefault()` pattern are
// unchanged.

import { useSession, useVisitedStateIds, useSignOutReason } from '../state/sharedState';
import { handleLogout } from '../services/sessionHandlers';

/**
 * @param {Object} props
 * @param {() => void} props.onNavigateHome - called when the "Coordinate
 *   Commons" control is clicked.
 * @param {() => void} props.onRequestLogin - called when the "Log in"
 *   control is clicked (only rendered when there is no session).
 */
export function TopNav({ onNavigateHome, onRequestLogin }) {
  const [session, setSession] = useSession();
  const [, setVisitedStateIds] = useVisitedStateIds();
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
    setVisitedStateIds(result.visitedStateIds);
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
