// Playwright config for Coordinate Commons's end-to-end (real headless
// browser) test suite.
//
// This is a DIFFERENT testing layer from the Jest/RTL suite in
// `src/**/*.test.js`: those tests run under jsdom with `fetch` and
// `window.google` mocked out, which is great for testing component logic
// in isolation but cannot catch bugs that only manifest in an actual
// browser executing the actual production bundle -- e.g. `global is not
// defined` crashes, a wrong static-asset path that 404s only once files
// are served for real, non-clickable polygons (a real browser hit-testing
// issue jsdom has no concept of), or `loading=async` bootstrap timing
// races against the real Google Maps script. This suite drives a real
// Chromium browser against the real `npm run build` output, served by
// `vite preview`, making real network calls (including to the live
// Google Maps JavaScript API using the project's real `.env` key -- see
// `e2e/mapLoads.spec.js`'s own header comment).
//
// Named `.js` (not `.mjs`/`.cjs`): `package.json` sets `"type":
// "commonjs"`, and this file uses `require`/`module.exports`, so plain
// `.js` is interpreted as CommonJS by Node directly -- no extension
// workaround is needed here the way `vite.config.mjs`/`eslint.config.mjs`
// needed `.mjs` to get `import`/`export default` under the same
// `"type": "commonjs"` setting.
const { defineConfig, devices } = require('@playwright/test');

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;

module.exports = defineConfig({
  // Separate from `src/**/*.test.js`, which is Jest's domain -- keeps
  // Playwright from ever picking up Jest's test files (and vice versa;
  // jest.config.js's testMatch only matches *.test.js/spec.js files
  // wherever they live, so it was updated to explicitly ignore this
  // directory too).
  testDir: './e2e',

  // The production build (`vite build`, invoked via `npm run build` below)
  // can take a little while, and this is a real network-bound integration
  // test (live Google Maps API), so a generous overall test timeout avoids
  // flaking on slower machines/connections.
  timeout: 60_000,

  fullyParallel: true,

  // Automatically builds and serves the actual production bundle before
  // tests start, and tears it down after -- this is the whole point of
  // this suite: testing the real `dist/` output, not the Vite dev server
  // (`npm run dev`) and not jsdom.
  //
  // `--mode development` (Vite's own built-in env-file convention, not
  // anything custom in vite.config.mjs) makes Vite additionally load
  // `.env.development.local` on top of `.env`/`.env.local`, with
  // `.env.development.local`'s values taking precedence. That's the same
  // file `npm run dev` loads too (it defaults to mode `development` with
  // no flag needed) -- one shared local-only key file for both local dev
  // and this e2e suite, rather than a separate e2e-only file. That file
  // overrides just `GOOGLE_MAPS_API_KEY` with a key that has no HTTP
  // referrer restriction (or explicitly allows localhost) -- the key in
  // plain `.env` is restricted (in Google Cloud Console) to the
  // production domain and Google's Maps JS API rejects requests from
  // `http://localhost:4173` with `RefererNotAllowedMapError`, which this
  // suite hit when first run against the unmodified `.env` key. Every
  // other `.env` value (Cognito settings, the Visit_Record_API URL) is
  // left as-is -- this is a real integration test against the real
  // deployed backend too, only the Maps key's referrer restriction is
  // the actual environment mismatch between "production domain" and
  // "localhost preview server."
  webServer: {
    command: `npm run build -- --mode development && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
    url: PREVIEW_URL,
    // The build step alone can take tens of seconds; this covers build +
    // preview server startup comfortably without being unreasonably long.
    timeout: 120_000,
    // Standard Playwright convention: local development can reuse an
    // already-running preview server across repeated test runs (faster
    // iteration), while CI always starts a fresh one to avoid picking up
    // stale state from an unrelated leftover process.
    reuseExistingServer: !process.env.CI,
  },

  use: {
    baseURL: PREVIEW_URL,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
