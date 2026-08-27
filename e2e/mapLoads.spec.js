// End-to-end smoke test: does the app actually work in a real browser?
//
// This is a DIFFERENT testing layer from the Jest/RTL unit suite in
// `src/**/*.test.js`. Those tests mock `fetch` and `window.google` and run
// under jsdom, so they can (and did, repeatedly, this session) all pass
// while the real app was actually broken in a real browser -- e.g.
// "global is not defined" (a Node global `amazon-cognito-identity-js`
// expects that doesn't exist in a browser), a GeoJSON path that 404s only
// once assets are served for real, polygons that render but aren't
// actually clickable, or a `loading=async` bootstrap timing race against
// Google's real script. None of those classes of bug are visible from
// jsdom with mocked globals -- they only show up when something drives an
// actual browser against the actual built bundle.
//
// This test does exactly that: it navigates a real Chromium browser
// (via Playwright, see playwright.config.js) to the production build
// (`npm run build` + `vite preview`, started automatically by
// playwright.config.js's `webServer`), and makes REAL network calls to the
// live Google Maps JavaScript API using the project's real
// `GOOGLE_MAPS_API_KEY` from `.env` (baked into the build by
// vite.config.mjs's `define`). This is intentionally NOT mocked -- a
// mocked Maps API would just reintroduce the same "passes without proving
// the real integration works" gap this suite exists to close.

const { test, expect } = require('@playwright/test');

test('the app loads, boots Google Maps, and renders no error UI', async ({ page }) => {
  await page.goto('/');

  // Basic page shell rendered -- index.html's <title> (Requirement: a
  // stable, existing landmark rather than an invented selector).
  await expect(page).toHaveTitle('Coordinate Commons');

  // MapView.jsx renders one of three states: the loading indicator
  // (`role="status"`), an error alert (`role="alert"`, `data-testid`
  // `map-view-error"`, text matching /map failed to load/i or /region
  // data failed to load/i -- see MapView.jsx and the same text-matching
  // convention already used in MapView.test.js), or the ready map
  // (`data-testid="map-view"` containing `data-testid="google-map-canvas"`
  // from GoogleMapCanvas.jsx). Assert the error alert never appears so
  // this positively catches the class of bug this project kept hitting
  // this session (bootstrap-timing race, wrong GeoJSON path, "global is
  // not defined" crash before the map ever got a chance to render) --
  // each of those either threw before rendering or surfaced this exact
  // error alert instead of the map.
  await expect(page.getByTestId('map-view-error')).not.toBeVisible();

  // Real network round trip (page load + Google Maps script fetch/parse +
  // this app's own bootstrap-polling fix in useGoogleMapsLoader.js's
  // `pollForBootstrapThenImport`) is slower than Playwright's tiny
  // (5s) default assertion timeout, but this is a smoke test, not a
  // stress test, so 20s is generous without being excessive.
  const mapCanvas = page.getByTestId('google-map-canvas');
  await expect(mapCanvas).toBeVisible({ timeout: 20_000 });

  // `data-testid="google-map-canvas"` (GoogleMapCanvas.jsx) is this app's
  // own container div that `new google.maps.Map(...)` is mounted into --
  // its presence alone only proves our own component rendered, not that
  // Google's script actually initialized a real map inside it. Once
  // initialized, the Maps JS API injects its own `.gm-style` wrapper div
  // as the first child of that container (confirmed by inspecting the
  // real rendered DOM against the live Maps JS API while developing this
  // test) -- asserting on it catches the case where our container renders
  // but the Maps script itself silently failed to construct anything
  // inside it.
  await expect(mapCanvas.locator('.gm-style')).toBeVisible({ timeout: 20_000 });
});
