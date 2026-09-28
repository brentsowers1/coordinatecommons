import fc from 'fast-check';
import { listVisitedPlaces, saveVisitedPlace } from './visitRecordApiClient';

// Arbitrary for a non-null Session, varying only the accessToken (the field
// that matters for the Authorization header); other fields are along for
// the ride and unused by the client.
const sessionArbitrary = fc
  .record({
    username: fc.string({ maxLength: 20 }),
    accessToken: fc.string(),
    expiresAt: fc.integer(),
  });

// The three Place_Category values supported by the Visit_Record_API
// (Requirement 15.2; design.md's "Visit_Record_API Contract").
const placeCategoryArbitrary = fc.constantFrom('us-state', 'canada-state', 'country');

describe('visitRecordApiClient', () => {
  it('exports listVisitedPlaces and saveVisitedPlace as functions', () => {
    expect(typeof listVisitedPlaces).toBe('function');
    expect(typeof saveVisitedPlace).toBe('function');
  });

  it('listVisitedPlaces resolves to an empty array without calling fetch when session is null', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    const result = await listVisitedPlaces(null, 'us-state');

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('saveVisitedPlace resolves without calling fetch when session is null', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    await expect(saveVisitedPlace(null, 'us-state', 'CA', true)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Feature: state-visit-tracker, Property 16: No session means no request is ever sent
  it('saveVisitedPlace(null, placeCategory, placeId, visited) never calls fetch and always resolves, for any placeCategory/placeId/visited', async () => {
    await fc.assert(
      fc.asyncProperty(placeCategoryArbitrary, fc.string(), fc.boolean(), async (placeCategory, placeId, visited) => {
        const fetchSpy = jest.fn();
        global.fetch = fetchSpy;

        await expect(saveVisitedPlace(null, placeCategory, placeId, visited)).resolves.toBeUndefined();
        expect(fetchSpy).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  // Feature: state-visit-tracker, Property 15: Every Visit_Record_API request carries the session's access token as the Authorization header
  it('listVisitedPlaces always sends Authorization: <session.accessToken>, for any placeCategory', async () => {
    await fc.assert(
      fc.asyncProperty(sessionArbitrary, placeCategoryArbitrary, async (session, placeCategory) => {
        const fetchSpy = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ placesVisited: [] }),
        });
        global.fetch = fetchSpy;

        await listVisitedPlaces(session, placeCategory);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toContain(`placeType=${placeCategory}`);
        expect(init.headers.Authorization).toBe(session.accessToken);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: state-visit-tracker, Property 15: Every Visit_Record_API request carries the session's access token as the Authorization header
  it('saveVisitedPlace always sends Authorization: <session.accessToken>, for any placeCategory', async () => {
    await fc.assert(
      fc.asyncProperty(
        sessionArbitrary,
        placeCategoryArbitrary,
        fc.string(),
        fc.boolean(),
        async (session, placeCategory, placeId, visited) => {
          const fetchSpy = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                username: session.username,
                placeId,
                visited,
              }),
          });
          global.fetch = fetchSpy;

          await saveVisitedPlace(session, placeCategory, placeId, visited);

          expect(fetchSpy).toHaveBeenCalledTimes(1);
          const [, init] = fetchSpy.mock.calls[0];
          expect(init.headers.Authorization).toBe(session.accessToken);
        }
      ),
      { numRuns: 100 }
    );
  });

  it.each(['us-state', 'canada-state', 'country'])(
    'listVisitedPlaces requests a URL ending in /visit?placeType=%s, while saveVisitedPlace requests the bare /visit URL with no query string',
    async (placeCategory) => {
      const session = { username: 'alice', accessToken: 'token-123', expiresAt: Date.now() + 100000 };

      const listFetchSpy = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ placesVisited: [] }),
      });
      global.fetch = listFetchSpy;
      await listVisitedPlaces(session, placeCategory);
      const [listUrl] = listFetchSpy.mock.calls[0];
      expect(listUrl).toMatch(new RegExp(`/visit\\?placeType=${placeCategory}$`));

      const saveFetchSpy = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ username: 'alice', placeId: 'CA', visited: true }),
      });
      global.fetch = saveFetchSpy;
      await saveVisitedPlace(session, placeCategory, 'CA', true);
      const [saveUrl, saveInit] = saveFetchSpy.mock.calls[0];
      expect(saveUrl).toMatch(/\/visit$/);
      expect(saveUrl).not.toContain('?');
      expect(JSON.parse(saveInit.body).placeType).toBe(placeCategory);
    }
  );

  describe('timeout, failure, and auth-error classification', () => {
    const session = { username: 'alice', accessToken: 'token-123', expiresAt: Date.now() + 100000 };

    afterEach(() => {
      delete global.fetch;
      jest.useRealTimers();
    });

    it.each(['us-state', 'canada-state', 'country'])(
      'listVisitedPlaces rejects with { kind: "TIMEOUT" } when the request is aborted after 10 seconds (placeCategory=%s)',
      async (placeCategory) => {
        jest.useFakeTimers();
        global.fetch = jest.fn((_url, init) => {
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject({ name: 'AbortError' });
            });
          });
        });

        const promise = listVisitedPlaces(session, placeCategory);
        const expectation = expect(promise).rejects.toEqual({ kind: 'TIMEOUT' });
        await jest.advanceTimersByTimeAsync(10000);
        await expectation;
      }
    );

    it.each(['us-state', 'canada-state', 'country'])(
      'saveVisitedPlace rejects with { kind: "TIMEOUT" } when the request is aborted after 10 seconds (placeCategory=%s)',
      async (placeCategory) => {
        jest.useFakeTimers();
        global.fetch = jest.fn((_url, init) => {
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject({ name: 'AbortError' });
            });
          });
        });

        const promise = saveVisitedPlace(session, placeCategory, 'CA', true);
        const expectation = expect(promise).rejects.toEqual({ kind: 'TIMEOUT' });
        await jest.advanceTimersByTimeAsync(10000);
        await expectation;
      }
    );

    it.each(['us-state', 'canada-state', 'country'])(
      'listVisitedPlaces rejects with { kind: "FAILURE" } for a non-ok, non-401/403 response (placeCategory=%s)',
      async (placeCategory) => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

        await expect(listVisitedPlaces(session, placeCategory)).rejects.toEqual({ kind: 'FAILURE' });
      }
    );

    it.each(['us-state', 'canada-state', 'country'])(
      'saveVisitedPlace rejects with { kind: "FAILURE" } for a non-ok, non-401/403 response (placeCategory=%s)',
      async (placeCategory) => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

        await expect(saveVisitedPlace(session, placeCategory, 'CA', true)).rejects.toEqual({ kind: 'FAILURE' });
      }
    );

    it('listVisitedPlaces rejects with { kind: "FAILURE" } when fetch rejects outright (network error)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

      await expect(listVisitedPlaces(session, 'us-state')).rejects.toEqual({ kind: 'FAILURE' });
    });

    it('saveVisitedPlace rejects with { kind: "FAILURE" } when fetch rejects outright (network error)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

      await expect(saveVisitedPlace(session, 'us-state', 'CA', true)).rejects.toEqual({ kind: 'FAILURE' });
    });

    it('listVisitedPlaces rejects with { kind: "FAILURE" } when the response body is malformed JSON', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('bad json')),
      });

      await expect(listVisitedPlaces(session, 'us-state')).rejects.toEqual({ kind: 'FAILURE' });
    });

    it('saveVisitedPlace rejects with { kind: "FAILURE" } when the response body is malformed JSON', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('bad json')),
      });

      await expect(saveVisitedPlace(session, 'us-state', 'CA', true)).rejects.toEqual({ kind: 'FAILURE' });
    });

    it.each(['us-state', 'canada-state', 'country'])(
      'listVisitedPlaces rejects with { kind: "AUTH_ERROR" } for a 401 response (placeCategory=%s)',
      async (placeCategory) => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

        await expect(listVisitedPlaces(session, placeCategory)).rejects.toEqual({ kind: 'AUTH_ERROR' });
      }
    );

    it.each(['us-state', 'canada-state', 'country'])(
      'listVisitedPlaces rejects with { kind: "AUTH_ERROR" } for a 403 response (placeCategory=%s)',
      async (placeCategory) => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });

        await expect(listVisitedPlaces(session, placeCategory)).rejects.toEqual({ kind: 'AUTH_ERROR' });
      }
    );

    it.each(['us-state', 'canada-state', 'country'])(
      'saveVisitedPlace rejects with { kind: "AUTH_ERROR" } for a 401 response (placeCategory=%s)',
      async (placeCategory) => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

        await expect(saveVisitedPlace(session, placeCategory, 'CA', true)).rejects.toEqual({ kind: 'AUTH_ERROR' });
      }
    );

    it.each(['us-state', 'canada-state', 'country'])(
      'saveVisitedPlace rejects with { kind: "AUTH_ERROR" } for a 403 response (placeCategory=%s)',
      async (placeCategory) => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });

        await expect(saveVisitedPlace(session, placeCategory, 'CA', true)).rejects.toEqual({ kind: 'AUTH_ERROR' });
      }
    );
  });

  describe('Property 32: every request sent while a category is selected carries that category\'s placeType', () => {
    const session = { username: 'alice', accessToken: 'token-123', expiresAt: Date.now() + 100000 };

    // An arbitrary describing one "operation" performed while a single
    // Place_Category is selected: either a list call or a save
    // (mark/unmark) call. The placeCategory itself is NOT part of this
    // arbitrary -- it's threaded through separately, held constant for the
    // whole generated sequence, matching design.md's framing of Property 32
    // ("for any Place_Category and any sequence of ... operations performed
    // while it is the Selected_Place_Category").
    const operationArbitrary = fc.oneof(
      fc.record({ type: fc.constant('list') }),
      fc.record({
        type: fc.constant('save'),
        placeId: fc.string(),
        visited: fc.boolean(),
      })
    );

    // Captures every fetch call's URL/body as a { placeType } extracted
    // from wherever the client puts it (query param for list, body field
    // for save), regardless of which operation produced it.
    function extractPlaceType(url, init) {
      if (init.method === 'GET') {
        const match = url.match(/placeType=([^&]+)/);
        return match ? match[1] : undefined;
      }
      return JSON.parse(init.body).placeType;
    }

    // Feature: state-visit-tracker, Property 32: Every Visit_Record_API request sent while a category is selected carries that category's placeType
    it('every request in a sequence of list/save operations run for a single fixed placeCategory carries that same placeCategory as its placeType', async () => {
      await fc.assert(
        fc.asyncProperty(
          placeCategoryArbitrary,
          fc.array(operationArbitrary, { minLength: 1, maxLength: 10 }),
          async (placeCategory, operations) => {
            const capturedPlaceTypes = [];
            global.fetch = jest.fn((url, init) => {
              capturedPlaceTypes.push(extractPlaceType(url, init));
              if (init.method === 'GET') {
                return Promise.resolve({
                  ok: true,
                  status: 200,
                  json: () => Promise.resolve({ placesVisited: [] }),
                });
              }
              return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ username: session.username, visited: true }),
              });
            });

            for (const operation of operations) {
              if (operation.type === 'list') {
                await listVisitedPlaces(session, placeCategory);
              } else {
                await saveVisitedPlace(session, placeCategory, operation.placeId, operation.visited);
              }
            }

            expect(capturedPlaceTypes).toHaveLength(operations.length);
            capturedPlaceTypes.forEach((placeType) => {
              expect(placeType).toBe(placeCategory);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    // An operation tagged with its OWN placeCategory, for the
    // mixed-category interleaving variant below: proves that consecutive
    // calls issued for different categories never leak or drift onto one
    // another's placeType, which a single-fixed-category sequence alone
    // couldn't distinguish from a client that (incorrectly) cached or
    // shared placeType across calls.
    const taggedOperationArbitrary = fc.tuple(placeCategoryArbitrary, operationArbitrary).map(
      ([placeCategory, operation]) => ({ placeCategory, ...operation })
    );

    // Feature: state-visit-tracker, Property 32: Every Visit_Record_API request sent while a category is selected carries that category's placeType
    it('every request in a sequence interleaving different placeCategories carries its own operation\'s placeCategory, never another operation\'s', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(taggedOperationArbitrary, { minLength: 1, maxLength: 10 }),
          async (operations) => {
            const capturedPlaceTypes = [];
            global.fetch = jest.fn((url, init) => {
              capturedPlaceTypes.push(extractPlaceType(url, init));
              if (init.method === 'GET') {
                return Promise.resolve({
                  ok: true,
                  status: 200,
                  json: () => Promise.resolve({ placesVisited: [] }),
                });
              }
              return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ username: session.username, visited: true }),
              });
            });

            for (const operation of operations) {
              if (operation.type === 'list') {
                await listVisitedPlaces(session, operation.placeCategory);
              } else {
                await saveVisitedPlace(session, operation.placeCategory, operation.placeId, operation.visited);
              }
            }

            expect(capturedPlaceTypes).toEqual(operations.map((operation) => operation.placeCategory));
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
