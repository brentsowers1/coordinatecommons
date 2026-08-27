// MapPage (design.md Component Tree: "MapPage --> MapView", "MapPage -->
// LoginPromptBanner"; "MapPage: Composes MapView and, for unauthenticated
// sessions, LoginPromptBanner (Requirement 9.2/9.3).").
//
// Scope note (task 19.1): `MapPage` always renders both `MapView` and
// `LoginPromptBanner` as siblings, unconditionally, matching the Component
// Tree diagram exactly (`MapPage --> MapView`, `MapPage --> LoginPromptBanner`
// with no branch drawn between them). `LoginPromptBanner` already reads
// `useSession` itself and renders nothing when there is a session
// (Requirement 9.3) or the banner when there is not (Requirement 9.2) --
// see `shouldShowLoginPrompt`/`LoginPromptBanner.js`. So `MapPage` does not
// need, and deliberately does not add, any conditional logic of its own
// around `LoginPromptBanner`; doing so would duplicate logic that already
// lives in one place.
//
// Login-control note (Requirement 1.1/1.2 -- "a control available to
// navigate to the Login_Page" / "an unauthenticated user selects the login
// control"): design.md's Component Tree gives `AuthGate` the job of
// choosing between `MapPage` and `LoginPage`, but it does not spell out
// *what* triggers that choice, since there is no router/navigation-state
// concept anywhere else in this codebase. The simplest solution consistent
// with `AuthGate` owning that choice is for `AuthGate` to own a small piece
// of local state representing "the user asked to see Login_Page", and for
// `MapPage` to expose the actual clickable control that requests it -- via
// an `onRequestLogin` callback prop `AuthGate` passes down (see
// `AuthGate.js` for the other half of this). `MapPage` itself doesn't know
// or care *how* that request is handled; it just renders a minimal, always
// present "Log in" control (distinct from `LoginPromptBanner`, which is a
// passive informational message, not a control) and calls the callback
// when clicked. Requirement 1.1 says this control should be present while
// unauthenticated; since an authenticated user has no use for a "log in"
// control at all, and `MapPage` is rendered for both authenticated and
// unauthenticated sessions, `MapPage` accepts a `showLoginControl` prop
// (also owned/passed by `AuthGate`, which is the one place that already
// knows whether there is a session) so the control itself is hidden once
// signed in, rather than duplicating a `useSession` read here that would
// otherwise need to match `LoginPromptBanner`'s own logic.

import { MapView } from './MapView';
import { LoginPromptBanner } from './LoginPromptBanner';

/**
 * @param {Object} props
 * @param {() => void} [props.onRequestLogin] - called when the user clicks
 *   the "Log in" control (Requirement 1.2). Omitted/no-op renders no
 *   control at all handler-wise, but the control itself is still governed
 *   by `showLoginControl`.
 * @param {boolean} [props.showLoginControl] - whether to render the "Log
 *   in" control (Requirement 1.1: visible while unauthenticated). Defaults
 *   to `true` so a standalone/test render still shows it.
 */
export function MapPage({ onRequestLogin, showLoginControl = true }) {
  return (
    <>
      {showLoginControl ? (
        <button type="button" onClick={onRequestLogin} data-testid="login-control">
          Log in
        </button>
      ) : null}
      <MapView />
      <LoginPromptBanner />
    </>
  );
}
