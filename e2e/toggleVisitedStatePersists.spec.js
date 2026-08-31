// End-to-end integration test: does marking/unmarking a state as visited
// actually round-trip through the REAL Visit_Record_API and REAL Cognito
// user pool?
//
// This is a different scenario from `e2e/mapLoads.spec.js` (which only
// proves the map itself boots against the real Google Maps API). This
// test additionally drives the real LoginForm against a real Cognito test
// account, clicks a real state polygon to mark it visited, reloads the
// page and logs in again to prove the mark was actually persisted server
// side (not just an in-memory optimistic update), then repeats the same
// proof for unmarking. None of this is mocked -- same philosophy as
// mapLoads.spec.js: a mocked backend would just reintroduce the "passes
// without proving the real integration works" gap this suite exists to
// close.
//
// Credentials: this test requires a real Cognito user pool account's
// username/password, supplied via `e2e/.env.e2e-credentials.local` (see
// `e2e/.env.e2e-credentials.example` and `e2e/loadTestCredentials.js`).
// Nobody writing this test has (or fabricated) real credentials -- if that
// file's values are still empty, `loadTestCredentials()` throws a clear,
// actionable error before any browser automation starts, rather than
// letting the test limp into a confusing generic login failure.
//
// Real-backend mutation warning: this test actually marks and unmarks a
// real Visited_State record for whichever account the supplied credentials
// belong to. Use a dedicated test account, not a personal one.

const { test, expect } = require('@playwright/test');
const { loadTestCredentials } = require('./loadTestCredentials');

// Duplicated from src/components/GoogleMapCanvas.jsx's own
// `INITIAL_MAP_CENTER`/`INITIAL_MAP_ZOOM` exports rather than imported: that
// module is JSX-free at the top (the constants themselves are plain
// objects/numbers) but the file as a whole is a `.jsx` React component
// module (imports `react`, uses `React.useRef`/`React.useEffect`, exports a
// component that returns JSX) -- pulling it into this plain-Node Playwright
// test would require the same JSX/React transform this app's own Babel
// config applies to app source, which Playwright's test runner does not
// apply by default. Duplicating just the two plain-value constants here
// avoids adding that transform pipeline to the e2e suite for two numbers.
// MUST stay in sync with GoogleMapCanvas.jsx's INITIAL_MAP_CENTER/
// INITIAL_MAP_ZOOM.
const INITIAL_MAP_CENTER = { lat: 44, lng: -100 };
const INITIAL_MAP_ZOOM = 3;

// The target state for this test. Texas's centroid (roughly { lat: 31.0,
// lng: -99.0 }) was chosen over e.g. Michigan/Florida/Hawaii specifically
// because Texas is large and boxy enough that its centroid reliably falls
// inside its own polygon rather than near a border, a panhandle, or open
// water. Confirmed empirically (independent of this test's own browser
// automation, since real Cognito credentials weren't available during
// development) by running the project's actual GeoJSON boundary data
// (src/data/stateBoundaries.geojson.json, the real fetched PublicaMundi
// dataset) through the app's own `resolveRegionAtLatLng` point-in-polygon
// algorithm for this exact point: it resolves to "TX", not to a
// neighboring state or no region at all. Montana ({ lat: 47.0, lng: -110.0
// }) was checked the same way as a second candidate and also resolves
// correctly, but Texas was kept as the primary choice.
const TARGET_STATE_NAME = 'Texas';
const TARGET_STATE_LAT_LNG = { lat: 31.0, lng: -99.0 };

// This test performs two full login+map-ready cycles plus two page
// reloads (each involving a real network round trip to Cognito and,
// after each click, to the real Visit_Record_API), which comfortably
// exceeds playwright.config.js's global 60s per-test timeout tuned for
// mapLoads.spec.js's single, simpler load. Raised here, surgically, for
// just this test file rather than raising the global config and affecting
// mapLoads.spec.js too.
test.setTimeout(180_000);

/**
 * Web Mercator "world coordinate" projection -- the same one Google Maps
 * itself uses internally -- for converting a { lat, lng } into an
 * unscaled pixel offset in a 256x256 "world" tile space.
 */
function projectToWorldPoint(lat, lng) {
  const sinY = Math.max(-0.9999, Math.min(0.9999, Math.sin((lat * Math.PI) / 180)));
  const x = 128 + lng * (256 / 360);
  const y = 128 - 0.5 * Math.log((1 + sinY) / (1 - sinY)) * (256 / (2 * Math.PI));
  return { x, y };
}

/**
 * Converts a { lat, lng } into a pixel offset within the map container,
 * given the map's current center/zoom and the container's own rendered
 * width/height.
 */
function latLngToContainerPixel(lat, lng, centerLat, centerLng, zoom, containerWidth, containerHeight) {
  const scale = Math.pow(2, zoom);
  const worldPoint = projectToWorldPoint(lat, lng);
  const centerWorldPoint = projectToWorldPoint(centerLat, centerLng);
  const x = containerWidth / 2 + (worldPoint.x - centerWorldPoint.x) * scale;
  const y = containerHeight / 2 + (worldPoint.y - centerWorldPoint.y) * scale;
  return { x, y };
}

/**
 * Computes the absolute page coordinates (not container-relative) of
 * `TARGET_STATE_LAT_LNG`, using the map canvas's actual rendered bounding
 * box (not a hardcoded guess -- GoogleMapCanvas.jsx styles the container
 * `width: 100%`, so its real width depends on the viewport) and the app's
 * fixed initial center/zoom (GoogleMapCanvas.jsx never pans/zooms on its
 * own between page load and this test's first click).
 */
async function getTargetStatePagePosition(page) {
  const mapCanvas = page.getByTestId('google-map-canvas');
  const boundingBox = await mapCanvas.boundingBox();
  const pixel = latLngToContainerPixel(
    TARGET_STATE_LAT_LNG.lat,
    TARGET_STATE_LAT_LNG.lng,
    INITIAL_MAP_CENTER.lat,
    INITIAL_MAP_CENTER.lng,
    INITIAL_MAP_ZOOM,
    boundingBox.width,
    boundingBox.height
  );
  return { x: boundingBox.x + pixel.x, y: boundingBox.y + pixel.y };
}

/**
 * Waits for Map_View to reach its ready state -- same signals as
 * mapLoads.spec.js: no map-view-error, google-map-canvas visible, and its
 * real Maps-API-injected `.gm-style` child visible.
 */
async function waitForMapReady(page) {
  await expect(page.getByTestId('map-view-error')).not.toBeVisible();
  const mapCanvas = page.getByTestId('google-map-canvas');
  await expect(mapCanvas).toBeVisible({ timeout: 20_000 });
  await expect(mapCanvas.locator('.gm-style')).toBeVisible({ timeout: 20_000 });
  return mapCanvas;
}

/**
 * Logs in via the real UI: clicks the "Log in" control (TopNav.jsx,
 * `data-testid="nav-login-link"`), fills LoginForm's username/password
 * fields, and submits. Waits for the map to reach its ready state
 * afterward (AuthGate.jsx returns to MapPage once useSession becomes
 * non-null, which then re-triggers MapView's own loader effects).
 */
async function logIn(page, username, password) {
  await page.getByTestId('nav-login-link').click();
  await page.locator('#login-username').fill(username);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await waitForMapReady(page);
}

/**
 * Reads the State_Info_Panel's current text content
 * (`data-testid="state-info-panel-content"`, rendered as
 * `` `${name} — ${visited ? 'Visited' : 'Not visited'}` `` per
 * StateInfoPanel.jsx -- note the em dash, `&mdash;`, not a hyphen).
 * Returns `null` if the panel is currently showing the neutral
 * placeholder instead (nothing targeted yet).
 */
async function readInfoPanelText(page) {
  const content = page.getByTestId('state-info-panel-content');
  if (!(await content.isVisible())) {
    return null;
  }
  return content.textContent();
}

function expectedInfoPanelText(visited) {
  return `${TARGET_STATE_NAME} \u2014 ${visited ? 'Visited' : 'Not visited'}`;
}

test.describe('toggling a visited state persists through the real Visit_Record_API', () => {
  let username;
  let password;

  test.beforeAll(() => {
    // Fails fast, with a clear and actionable message, if
    // e2e/.env.e2e-credentials.local doesn't exist or isn't filled in --
    // see loadTestCredentials.js. This is the expected state until a real
    // Cognito test account's credentials are supplied.
    ({ username, password } = loadTestCredentials());
  });

  test('mark, reload+verify, unmark, reload+verify', async ({ page }) => {
    await page.goto('/');
    await waitForMapReady(page);
    await logIn(page, username, password);

    const { x: targetX, y: targetY } = await getTargetStatePagePosition(page);

    // --- Idempotency / test-hygiene safety step -----------------------
    // A prior run of this same test could have died partway through
    // (e.g. after marking but before unmarking), leaving the target
    // state's real persisted status as "visited" going into this run.
    // Hover (not click) to check the CURRENT status without mutating it,
    // and normalize to "not visited" first if needed, so this test always
    // starts from -- and always ends at -- a known clean state.
    await page.mouse.move(targetX, targetY);
    await expect(page.getByTestId('state-info-panel-content')).toHaveText(
      new RegExp(`^${TARGET_STATE_NAME}`),
      { timeout: 10_000 }
    );
    const initialText = await readInfoPanelText(page);
    if (initialText === expectedInfoPanelText(true)) {
      await page.mouse.click(targetX, targetY);
      await expect(page.getByTestId('state-info-panel-content')).toHaveText(
        expectedInfoPanelText(false)
      );
      // This normalization click's own background save (settle()) must
      // finish before proceeding, for the same reason Step 1's wait below
      // is needed: without it, this click's in-flight POST /visit could
      // still be pending when Step 1's click fires immediately after,
      // leaving the state's pending/optimistic bookkeeping (and the real
      // backend record) in a race between two overlapping saves rather
      // than one clean settle-then-save sequence. There's no reload
      // immediately after this click today, but waiting here is what
      // keeps this step's own persistence claim ("normalized to not
      // visited") actually true on the backend before Step 1 builds on
      // top of it, not just true in the optimistic UI.
      await expect(page.getByTestId('state-info-panel-saving')).not.toBeVisible({ timeout: 10_000 });
    }

    // --- Step 1: mark the state as visited -----------------------------
    await page.mouse.click(targetX, targetY);
    await expect(page.getByTestId('state-info-panel-content')).toHaveText(
      expectedInfoPanelText(true)
    );
    // Wait for the background save (POST /visit) to actually settle
    // before reloading -- the optimistic UI update above happens
    // synchronously and well before the save even starts, so reloading
    // immediately after it can abort the in-flight request and make the
    // very next check (Step 2) fail even though the app behaved
    // correctly. `state-info-panel-saving` (StateInfoPanel.jsx) reflects
    // `usePendingStateIds`'s real save-in-flight lifecycle for the
    // currently targeted state, so waiting for it to disappear here is
    // waiting for the real save to have resolved (success or reverted),
    // not an arbitrary sleep.
    await expect(page.getByTestId('state-info-panel-saving')).not.toBeVisible({ timeout: 10_000 });

    // --- Step 2: reload, log in again, verify WITHOUT clicking ---------
    // Proves the mark round-tripped through the real Visit_Record_API and
    // was reloaded from it via listVisitedStates, not just an in-memory
    // optimistic value -- a fresh page load has no in-memory state at all.
    await page.goto('/');
    await waitForMapReady(page);
    await logIn(page, username, password);

    const { x: targetXAfterReload1, y: targetYAfterReload1 } = await getTargetStatePagePosition(page);
    // Hover only (no click) -- a click here would toggle the state again
    // and invalidate this exact assertion's proof. StateBoundaryOverlay.js
    // updates the info panel from a plain mousemove on hover-capable
    // devices (Playwright's default chromium `Desktop Chrome` device
    // profile is hover-capable/fine-pointer, so useIsHoverCapable()'s
    // matchMedia('(hover: hover) and (pointer: fine)') check resolves to
    // true here), without invoking the click/toggle handler.
    await page.mouse.move(targetXAfterReload1, targetYAfterReload1);
    await expect(page.getByTestId('state-info-panel-content')).toHaveText(
      expectedInfoPanelText(true),
      { timeout: 10_000 }
    );

    // --- Step 3: unmark the state ---------------------------------------
    await page.mouse.click(targetXAfterReload1, targetYAfterReload1);
    await expect(page.getByTestId('state-info-panel-content')).toHaveText(
      expectedInfoPanelText(false)
    );
    // Same reasoning as Step 1's wait above: let the real background save
    // settle before reloading, so Step 4's verification isn't racing an
    // in-flight (and about-to-be-aborted-by-navigation) POST /visit.
    await expect(page.getByTestId('state-info-panel-saving')).not.toBeVisible({ timeout: 10_000 });

    // --- Step 4: reload, log in again, verify the unmark persisted -----
    await page.goto('/');
    await waitForMapReady(page);
    await logIn(page, username, password);

    const { x: targetXAfterReload2, y: targetYAfterReload2 } = await getTargetStatePagePosition(page);
    await page.mouse.move(targetXAfterReload2, targetYAfterReload2);
    await expect(page.getByTestId('state-info-panel-content')).toHaveText(
      expectedInfoPanelText(false),
      { timeout: 10_000 }
    );
  });
});
