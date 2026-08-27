// ESLint flat config for Coordinate Commons.
//
// Named `eslint.config.mjs` (not `.js`) for the same reason
// `vite.config.js` was previously renamed to `vite.config.mjs`: the
// project's `package.json` sets `"type": "commonjs"`, so a plain `.js`
// file using `export default` would be parsed as CommonJS and fail --
// flat config files are always loaded as native ESM/CJS based on their
// own extension regardless of the nearest `package.json`, so `.mjs` here
// (like `vite.config.mjs`) is the file that gets to use `import`/`export
// default` unconditionally.
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**'],
  },

  // Base recommended rules (applies to every linted file below).
  js.configs.recommended,

  // React (JSX) recommended rules, plus the jsx-runtime preset which turns
  // off react/react-in-jsx-scope and react/jsx-uses-react -- this project
  // uses React 19's automatic JSX runtime (@vitejs/plugin-react), so JSX
  // doesn't need `React` in scope purely to be compiled.
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],

  // React Hooks rules -- this codebase uses hooks extensively
  // (useGoogleMapsLoader, useVisitedStatesLoader, the
  // make-shared-state-hook-based hooks in sharedState.js), so
  // rules-of-hooks and exhaustive-deps stay on.
  //
  // Note: eslint-plugin-react-hooks 7.x's own `recommended`/
  // `recommended-latest` flat configs bundle ~15 additional "React
  // Compiler" diagnostic rules (react-hooks/refs, set-state-in-effect,
  // purity, immutability, etc.) alongside these two. Those extra rules
  // flag several patterns that are deliberate and already documented at
  // length in this codebase's own comments -- e.g. StateBoundaryOverlay.js's
  // ref-mirroring pattern (refs updated during render specifically so
  // listener closures always see the latest prop without re-registering
  // the map's listeners), and the setState-at-the-top-of-an-effect pattern
  // in AuthGate.jsx/useVisitedStatesLoader.js/stateBoundaries.js (used to
  // synchronously reset a status flag before an async operation starts).
  // Silencing those with disable comments file-by-file would be noisy for
  // rules this project hasn't opted into by name, so only the two
  // classic, universally-applicable hook rules are enabled here.
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    settings: {
      react: {
        version: '19.2.8',
      },
    },
  },

  // Application source: runs in the browser.
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
  },

  // config.js reads `process.env.*` (Requirements: see the file's own
  // comment) -- under Jest this runs in real Node, where `process` is a
  // genuine global; in the browser bundle, vite.config.mjs's `define`
  // performs a literal text substitution of each `process.env.X`
  // expression at build time, so the substituted code never actually
  // references `process` at runtime in the browser either. Either way,
  // `process` itself needs to be a recognized global for this file.
  {
    files: ['src/config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Test files: same browser globals as application code, plus Jest's
  // globals (describe/it/expect/jest/beforeEach/...). Babel/Jest run
  // these under Node, and several test files use Node-only globals
  // alongside the browser ones -- `global` (Jest's own alias for the
  // global object, used to stub `global.fetch`) and `require` (a couple
  // of tests do an in-body `require(...)` instead of a static import,
  // e.g. stateBoundaries.test.js) -- so Node's globals are layered in too.
  {
    files: ['**/*.test.js', '**/*.test.jsx'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
  },

  // Root-level tooling config files run under Node, not the browser, and
  // use CommonJS (`module.exports`, `require`).
  {
    files: ['babel.config.js', 'jest.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },

  // vite.config.mjs runs under Node too, but is native ESM (import/export).
  {
    files: ['vite.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },

  {
    rules: {
      // This codebase documents prop shapes with JSDoc comments (see e.g.
      // StateBoundaryOverlay.js) rather than the separate `prop-types`
      // package, so the recommended rule requiring PropTypes validation
      // doesn't fit this project's existing convention.
      'react/prop-types': 'off',

      // `ignoreRestSiblings` allows the common
      // `const { [key]: _omitted, ...rest } = obj` rest-destructuring
      // pattern used to build a copy of an object without one property
      // (see e.g. resolveFillColor.test.js) without flagging the
      // deliberately-unused extracted binding. `argsIgnorePattern`
      // recognizes a leading underscore as "intentionally unused" for
      // function parameters -- several property tests generate an
      // arbitrary specifically to demonstrate a property holds regardless
      // of its value, without passing it to the function under test (see
      // e.g. sessionHandlers.test.js's priorSession/sourceOperation
      // params, each already documented in a comment explaining why the
      // generated value is intentionally unused).
      'no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
    },
  },
];
