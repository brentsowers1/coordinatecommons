// MapPage (design.md Component Tree: "MapPage --> MapView"; "MapPage:
// Composes MapView.").
//
// Banner placement note: `MapPage` used to render `LoginPromptBanner` as a
// sibling of `MapView`. That put the banner after everything `MapView`
// renders -- including `PlaceVisitStatusLists`, whose two columns run one
// entry per place (hundreds for the 'country' category) -- so the prompt
// landed at the very bottom of the page instead of "in an area below the
// Map_View" (Requirement 9.2). The banner's placement now lives inside
// `MapView`, which renders it in the area directly below the map and above
// `Place_Visit_Status_Lists` (and in its loading/error states too, so the
// prompt is persistent while not authenticated). `LoginPromptBanner` still
// self-gates on `useSession` -- rendering nothing when there is a session
// (Requirement 9.3) and the banner when there is not (Requirement 9.2), see
// `shouldShowLoginPrompt`/`LoginPromptBanner.jsx` -- so no conditional logic
// is needed at either level.
//
// Login/logout navigation note: `MapPage` previously rendered its own
// inline "Log in" control (`onRequestLogin`/`showLoginControl` props). That
// responsibility has moved to `TopNav`, which is rendered once by
// `AuthGate` above whichever of `MapPage`/`LoginPage` it currently shows,
// so the same login/logout controls are available on every page rather
// than duplicated. `MapPage` itself is now just composition of `MapView`,
// with no navigation concept of its own.
//
// `onRequestLogin`/`onRequestSignUp` (Requirement 9.2): `MapPage` forwards
// these two callbacks straight through to `MapView` and does nothing else
// with them. They exist here purely so `LoginPromptBanner`'s "Log in" /
// "sign up for an account" links can reach `AuthGate`'s navigation --
// the banner's PLACEMENT lives in `MapView` (see the note above), but the
// only component that owns which page is showing is `AuthGate`, so the
// callbacks have to travel AuthGate -> MapPage -> MapView -> banner. This
// does not give `MapPage` a navigation concept of its own; it is a pure
// pass-through.
//
// @param {Object} props
// @param {() => void} [props.onRequestLogin]
// @param {() => void} [props.onRequestSignUp]

import { MapView } from './MapView';

export function MapPage({ onRequestLogin, onRequestSignUp } = {}) {
  return <MapView onRequestLogin={onRequestLogin} onRequestSignUp={onRequestSignUp} />;
}
