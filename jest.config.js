module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  // `e2e/` is Playwright's own end-to-end suite (real headless browser
  // against the production build -- see playwright.config.js), not a Jest
  // test directory. Playwright's own `*.spec.js` files under `e2e/` would
  // otherwise match the `testMatch` pattern above and Jest would try (and
  // fail) to run them using `@playwright/test`'s `test`/`expect`, which
  // aren't Jest's globals.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/'],
  // make-shared-state-hook ships untranspiled ESM source in node_modules,
  // so it needs to be run through babel-jest like our own source instead of
  // being skipped by the default node_modules ignore pattern.
  transformIgnorePatterns: ['/node_modules/(?!make-shared-state-hook/)'],
};
