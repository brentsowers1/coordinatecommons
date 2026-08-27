import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for Coordinate Commons.
//
// Every component containing JSX lives in a `.jsx` file (pure-logic
// modules stay `.js`), so no extra esbuild/oxc loader configuration is
// needed for JSX itself -- `@vitejs/plugin-react` handles `.jsx` files out
// of the box.
//
// src/config.js reads `process.env.VISIT_RECORD_API_BASE_URL`,
// `process.env.GOOGLE_MAPS_API_KEY`, etc. -- that works under Jest (Node),
// but the browser has no `process` global, and Vite's own env mechanism
// (`import.meta.env`, `VITE_`-prefixed vars) doesn't match what config.js
// already reads. Rather than changing config.js (and risk diverging from
// what Jest already exercises), `define` performs a literal text
// substitution of each `process.env.X` expression with the corresponding
// value from `.env`/`.env.local` at build time, so config.js's existing
// code works unmodified under both test and browser runtimes.
// `loadEnv(mode, process.cwd(), '')` (empty prefix) loads every variable
// from `.env` files, not just `VITE_`-prefixed ones, so a plain `.env`
// with the same names used by config.js works directly -- see
// `.env.example`.
//
// `amazon-cognito-identity-js` (and/or its transitive dependencies, e.g.
// crypto-related polyfills) reference Node's `global` object, which
// doesn't exist in a browser -- causing "Uncaught ReferenceError: global
// is not defined" at runtime. Aliasing `global` to `globalThis` (the
// standard, spec-defined global object available in both browsers and
// Node) via `define` is the common fix for this class of Node-oriented
// library when bundled for the browser.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    // Relative base path so the production bundle (`npm run build`) still
    // resolves its asset URLs correctly when uploaded to a static host
    // that doesn't serve it from the domain root (e.g. a subdirectory).
    base: './',
    define: {
      global: 'globalThis',
      'process.env.VISIT_RECORD_API_BASE_URL': JSON.stringify(
        env.VISIT_RECORD_API_BASE_URL || ''
      ),
      'process.env.GOOGLE_MAPS_API_KEY': JSON.stringify(env.GOOGLE_MAPS_API_KEY || ''),
      'process.env.COGNITO_USER_POOL_ID': JSON.stringify(env.COGNITO_USER_POOL_ID || ''),
      'process.env.COGNITO_CLIENT_ID': JSON.stringify(env.COGNITO_CLIENT_ID || ''),
      'process.env.COGNITO_REGION': JSON.stringify(env.COGNITO_REGION || ''),
    },
  };
});