// App (design.md Component Tree: "App --> AuthGate"; "App: Top-level
// component. Instantiates the shared-state hooks module and renders
// AuthGate.").
//
// Placement note: every other component in the Component Tree (AuthGate,
// MapPage, LoginPage, MapView, etc.) lives in `src/components/`, so `App`
// is placed here as `src/components/App.js` rather than `src/App.js` for
// consistency with that existing convention -- `src/`'s only top-level
// (non-`components/`) files are non-component modules (`config.js`,
// `state/`, `services/`, `data/`).
//
// "Instantiates the shared-state hooks module" note: this phrase reads
// like it implies some setup step App must perform at render time (e.g. a
// Provider wrapping children), but `make-shared-state-hook` has no such
// concept -- confirmed against the library's README (see
// node_modules/make-shared-state-hook/README.md): `makeSharedStateHook`
// hooks are created once at module load time (see sharedState.js, where
// every `use*` hook is already a fully-formed export from a top-level
// `makeSharedStateHook(React, initialValue)` call) and are plain hook
// functions callable from any component thereafter, with no Provider, no
// context, and no explicit "start using shared state now" call required.
//
// Concretely, "instantiation" already happens as a side effect of
// `sharedState.js` being imported -- which happens transitively via
// `AuthGate` (and, deeper still, via `MapPage`/`LoginPage`) even without
// `App` importing it directly. `App` itself uses none of the hooks
// directly (it renders no session-dependent UI of its own -- that's
// `AuthGate`'s job), so there is nothing for it to call beyond rendering
// `AuthGate`. `App` therefore does not need, and deliberately does not
// add, a Provider or any other wrapper: the design.md wording is
// describing where in the tree the shared-state module comes into effect
// (the root), not a runtime action `App` must additionally perform.

import { AuthGate } from './AuthGate';

export function App() {
  return <AuthGate />;
}
