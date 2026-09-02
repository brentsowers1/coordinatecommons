// Browser entry point. Not exercised by Jest (which imports `App` directly
// in App.test.js) -- this file's only job is mounting the real DOM root,
// which only exists in an actual browser/Vite context.

// Pico.css (classless-friendly, minimal CSS framework) -- gives every
// semantic HTML element in the app a reasonable visual baseline with no/
// minimal extra classes. Imported first, before any component imports, so
// its styles are the lowest-priority layer any component-level styling
// would otherwise need to override. Vite handles this CSS import in a JS
// entry file natively (no additional plugin needed). The bare
// `@picocss/pico` specifier resolves to the package's `main` field
// (`css/pico.min.css`).
import '@picocss/pico';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);