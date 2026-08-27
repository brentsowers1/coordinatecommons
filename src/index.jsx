// Browser entry point. Not exercised by Jest (which imports `App` directly
// in App.test.js) -- this file's only job is mounting the real DOM root,
// which only exists in an actual browser/Vite context.

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