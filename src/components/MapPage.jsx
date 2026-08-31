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
// Login/logout navigation note: `MapPage` previously rendered its own
// inline "Log in" control (`onRequestLogin`/`showLoginControl` props). That
// responsibility has moved to `TopNav`, which is rendered once by
// `AuthGate` above whichever of `MapPage`/`LoginPage` it currently shows,
// so the same login/logout controls are available on every page rather
// than duplicated. `MapPage` itself is now just composition of `MapView`
// and `LoginPromptBanner`, with no navigation concept of its own.

import { MapView } from './MapView';
import { LoginPromptBanner } from './LoginPromptBanner';

export function MapPage() {
  return (
    <>
      <MapView />
      <LoginPromptBanner />
    </>
  );
}
