/**
 * Shared Google Maps JavaScript API script loader (design.md: "MapView /
 * StateBoundaryOverlay").
 *
 * Loads `https://maps.googleapis.com/maps/api/js` via a single `<script>`
 * tag injected into `document.head`, using `config.googleMaps.apiKey`
 * rather than a hardcoded key (Requirements 3.3, 3.4, 8.2, 8.3). The script
 * is loaded at most once app-wide: state is held at module scope so that
 * every component calling `useGoogleMapsLoader()` -- even multiple
 * simultaneous instances -- observes the same `status` and shares the same
 * script tag instead of each injecting its own.
 */

import React from 'react';
import { config } from '../config';

/** DOM id assigned to the injected Google Maps script tag. */
export const GOOGLE_MAPS_SCRIPT_ID = 'coordinate-commons-google-maps-script';

// --- Module-level singleton state -----------------------------------------
//
// `moduleState` and `scriptElement` are shared by every hook instance across
// the app. `listeners` lets each mounted hook instance re-render when the
// singleton's status changes.

let moduleState = { status: 'loading' };
let scriptElement = null;
const listeners = new Set();

// `script.onload`'s bootstrap-readiness check (see `isBootstrapLoaded()`
// below) is polled for up to this long, at this interval, before giving up
// and reporting a genuine failure. With `loading=async` on the script URL,
// `onload` firing does not always mean `window.google.maps.importLibrary`
// is attached in that exact same tick -- it can land a handful of
// milliseconds later. Polling briefly avoids misreporting that harmless
// timing race as a hard failure while still failing fast for a real one.
const BOOTSTRAP_POLL_INTERVAL_MS = 50;
const BOOTSTRAP_POLL_MAX_ATTEMPTS = 20;

function getState() {
  return moduleState;
}

function setState(nextState) {
  moduleState = nextState;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Checks whether the Maps JS API bootstrap has already successfully landed
 * on `window.google.maps.importLibrary` -- i.e. some earlier script tag's
 * `onload` fired and populated it, regardless of whether the subsequent
 * `importLibrary('maps')` call itself succeeded or failed.
 */
function isBootstrapLoaded() {
  return (
    typeof window !== 'undefined' &&
    window.google != null &&
    window.google.maps != null &&
    typeof window.google.maps.importLibrary === 'function'
  );
}

/**
 * Imports the 'maps' library from the already-bootstrapped Maps JS API and
 * reports 'ready'/'error' accordingly. Shared by `loadScript()`'s `onload`
 * handler and `retryLoad()`'s already-bootstrapped retry path.
 */
function importMapsLibrary() {
  window.google.maps
    .importLibrary('maps')
    .then(() => {
      setState({ status: 'ready' });
    })
    .catch(() => {
      setState({ status: 'error' });
    });
}

/**
 * Called from `script.onload`. Checks `isBootstrapLoaded()` and, if it's
 * not true yet, retries every `BOOTSTRAP_POLL_INTERVAL_MS` up to
 * `BOOTSTRAP_POLL_MAX_ATTEMPTS` times to absorb the brief timing race
 * between `onload` firing and `window.google.maps.importLibrary` actually
 * being attached (see `script.onload` above). Once bootstrapped, proceeds
 * to `importMapsLibrary()` exactly as before. If the window is exhausted
 * without the bootstrap ever landing, reports a genuine 'error'.
 */
function pollForBootstrapThenImport(attempt) {
  if (isBootstrapLoaded()) {
    importMapsLibrary();
    return;
  }

  if (attempt >= BOOTSTRAP_POLL_MAX_ATTEMPTS) {
    setState({ status: 'error' });
    return;
  }

  setTimeout(() => pollForBootstrapThenImport(attempt + 1), BOOTSTRAP_POLL_INTERVAL_MS);
}

/**
 * Injects the Google Maps script tag if it has not already been injected
 * (or has been cleared by `retry()`). Safe to call from multiple hook
 * instances mounting concurrently -- the presence of `scriptElement` makes
 * every call after the first a no-op.
 */
function loadScript() {
  if (scriptElement) {
    return;
  }

  // loading=async on the URL (distinct from the script tag's own
  // async attribute below) tells the Maps JS API's own internal bootstrap
  // loader to run asynchronously, per Google's recommended loading pattern
  // (https://goo.gle/js-api-loading) -- without it, the API logs a
  // console warning about suboptimal performance.
  const script = document.createElement('script');
  script.id = GOOGLE_MAPS_SCRIPT_ID;
  script.src = `https://maps.googleapis.com/maps/api/js?key=${config.googleMaps.apiKey}&loading=async`;
  script.async = true;

  script.onload = () => {
    // With loading=async on the URL, the script tag's onload only
    // means the small bootstrap stub has landed on window.google.maps --
    // it does NOT yet populate google.maps.Map, google.maps.Polygon, etc.
    // Those only become available once the 'maps' library is explicitly
    // imported via importLibrary(), per Google's Dynamic Library Import
    // pattern (https://goo.gle/js-api-loading). GoogleMapCanvas and
    // StateBoundaryOverlay construct google.maps.Map/Polygon directly, so
    // this loader must finish that import before reporting 'ready' --
    // otherwise those constructors don't exist yet and callers crash with
    // "googleMaps.Map is not a constructor".
    //
    // Separately, `onload` firing does not guarantee `importLibrary` is
    // attached in that exact same synchronous tick -- it can land shortly
    // after, a timing race rather than a real failure. Poll briefly for
    // it instead of failing on the very first check, only reporting
    // 'error' once the poll window is exhausted.
    pollForBootstrapThenImport(0);
  };

  script.onerror = () => {
    setState({ status: 'error' });
  };

  scriptElement = script;
  document.head.appendChild(script);
}

/**
 * Retries after a failure. If the Maps JS bootstrap itself already
 * succeeded once (only the `importLibrary('maps')` call failed -- e.g. a
 * blocked telemetry ping), re-invokes `importLibrary('maps')` directly
 * without touching the existing script tag, since the Maps JS API does not
 * support being bootstrapped twice on one page (re-injecting a script tag
 * in that case throws "already defined" for its custom elements and leaves
 * `importLibrary` in a broken state). Otherwise (the bootstrap script
 * itself never loaded, e.g. `script.onerror` fired), removes any stale
 * script tag and re-attempts loading from scratch.
 */
function retryLoad() {
  if (isBootstrapLoaded()) {
    setState({ status: 'loading' });
    importMapsLibrary();
    return;
  }

  if (scriptElement) {
    scriptElement.remove();
    scriptElement = null;
  }
  setState({ status: 'loading' });
  loadScript();
}

/**
 * React hook exposing the shared Google Maps JavaScript API loading state.
 *
 * @returns {{status: 'loading' | 'ready' | 'error', retry: () => void}}
 */
export function useGoogleMapsLoader() {
  const state = React.useSyncExternalStore(subscribe, getState);

  React.useEffect(() => {
    loadScript();
  }, []);

  const retry = React.useCallback(() => {
    retryLoad();
  }, []);

  return { status: state.status, retry };
}
