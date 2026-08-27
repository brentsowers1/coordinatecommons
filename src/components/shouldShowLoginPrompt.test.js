import fc from 'fast-check';

import { shouldShowLoginPrompt } from './shouldShowLoginPrompt';

const sessionArbitrary = fc.option(
  fc.record({
    username: fc.string(),
    accessToken: fc.string(),
    expiresAt: fc.integer(),
  }),
  { nil: null }
);

describe('shouldShowLoginPrompt', () => {
  // Feature: state-visit-tracker, Property 17: The login prompt is visible exactly when there is no session
  test('property: returns true if and only if session is null', () => {
    fc.assert(
      fc.property(sessionArbitrary, (session) => {
        expect(shouldShowLoginPrompt(session)).toBe(session === null);
      }),
      { numRuns: 100 }
    );
  });
});
