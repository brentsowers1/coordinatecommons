// Loads real Cognito test-account credentials for the persistence e2e test
// (toggleVisitedStatePersists.spec.js) from a local, gitignored file.
//
// Why this exists: `e2e/mapLoads.spec.js` doesn't need any credentials --
// it never logs in. `toggleVisitedStatePersists.spec.js` does, and it must
// use a REAL Cognito user pool account (this suite makes real network
// calls against the real backend, consistent with the rest of this e2e
// suite -- see playwright.config.js's own header comment). Nobody involved
// in writing this test has (or should fabricate) real credentials, so
// they're supplied out-of-band by whoever runs the suite, via a small,
// git-ignored `KEY=VALUE` file -- the same `.env`/`.env.example` convention
// this project already uses for `src/config.js` (see `.env.example`), just
// under `e2e/` since these credentials are specific to this one e2e test
// and have nothing to do with the app's own `config.js`.
//
// This project has no `dotenv` dependency, and Playwright test files run
// under plain Node (not through Vite's own `.env` loading, which only
// applies to the app bundle -- see playwright.config.js's comment on
// `--mode development`), so this is a minimal, dependency-free parser
// matching this file's own trivial `KEY=VALUE` format -- no quoting,
// escaping, or multiline support is needed or attempted.

const fs = require('fs');
const path = require('path');

const CREDENTIALS_FILE_PATH = path.join(__dirname, '.env.e2e-credentials.local');

/**
 * Parses a minimal `KEY=VALUE` file's contents into a plain object.
 * Blank lines and lines starting with `#` are ignored. Values are trimmed.
 * Lines without an `=` are ignored (rather than throwing), keeping this
 * parser as forgiving/minimal as the file format itself.
 *
 * @param {string} fileContents
 * @returns {Object.<string, string>}
 */
function parseEnvFile(fileContents) {
  const values = {};
  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    values[key] = value;
  }
  return values;
}

/**
 * Loads `{ username, password }` for the real Cognito test account used by
 * `toggleVisitedStatePersists.spec.js`, from
 * `e2e/.env.e2e-credentials.local`.
 *
 * Throws a clear, actionable Error -- rather than letting the test fail
 * downstream with a confusing generic "invalid credentials" UI failure --
 * when the file doesn't exist, or when either value ends up empty (e.g.
 * the committed placeholder file, `.env.e2e-credentials.example`, copied
 * over without being filled in).
 *
 * @returns {{ username: string, password: string }}
 */
function loadTestCredentials() {
  if (!fs.existsSync(CREDENTIALS_FILE_PATH)) {
    throw new Error(
      'Real Cognito test credentials are required to run this test, but ' +
        `${CREDENTIALS_FILE_PATH} does not exist. Copy ` +
        'e2e/.env.e2e-credentials.example to e2e/.env.e2e-credentials.local ' +
        "and fill in a real test account's username/password."
    );
  }

  const fileContents = fs.readFileSync(CREDENTIALS_FILE_PATH, 'utf8');
  const values = parseEnvFile(fileContents);
  const username = (values.E2E_TEST_USERNAME || '').trim();
  const password = (values.E2E_TEST_PASSWORD || '').trim();

  if (!username || !password) {
    throw new Error(
      'Real Cognito test credentials are required to run this test, but ' +
        `E2E_TEST_USERNAME and/or E2E_TEST_PASSWORD in ${CREDENTIALS_FILE_PATH} ` +
        "are empty. Fill in a real test account's username/password in that file."
    );
  }

  return { username, password };
}

module.exports = { loadTestCredentials };
