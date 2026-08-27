import fc from 'fast-check';
import { listVisitedStates, saveVisitedState } from './visitRecordApiClient';

// Arbitrary for a non-null Session, varying only the accessToken (the field
// that matters for the Authorization header); other fields are along for
// the ride and unused by the client.
const sessionArbitrary = fc
  .record({
    username: fc.string({ maxLength: 20 }),
    accessToken: fc.string(),
    expiresAt: fc.integer(),
  });

describe('visitRecordApiClient', () => {
  it('exports listVisitedStates and saveVisitedState as functions', () => {
    expect(typeof listVisitedStates).toBe('function');
    expect(typeof saveVisitedState).toBe('function');
  });

  it('listVisitedStates resolves to an empty array without calling fetch when session is null', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    const result = await listVisitedStates(null);

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('saveVisitedState resolves without calling fetch when session is null', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    await expect(saveVisitedState(null, 'CA', true)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Feature: state-visit-tracker, Property 16: No session means no request is ever sent
  it('saveVisitedState(null, stateId, visited) never calls fetch and always resolves, for any stateId/visited', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.boolean(), async (stateId, visited) => {
        const fetchSpy = jest.fn();
        global.fetch = fetchSpy;

        await expect(saveVisitedState(null, stateId, visited)).resolves.toBeUndefined();
        expect(fetchSpy).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  // Feature: state-visit-tracker, Property 15: Every Visit_Record_API request carries the session's access token as the Authorization header
  it('listVisitedStates always sends Authorization: <session.accessToken>', async () => {
    await fc.assert(
      fc.asyncProperty(sessionArbitrary, async (session) => {
        const fetchSpy = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ placesVisited: [] }),
        });
        global.fetch = fetchSpy;

        await listVisitedStates(session);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toContain('placeType=us-state');
        expect(init.headers.Authorization).toBe(session.accessToken);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: state-visit-tracker, Property 15: Every Visit_Record_API request carries the session's access token as the Authorization header
  it('saveVisitedState always sends Authorization: <session.accessToken>', async () => {
    await fc.assert(
      fc.asyncProperty(
        sessionArbitrary,
        fc.string(),
        fc.boolean(),
        async (session, stateId, visited) => {
          const fetchSpy = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                username: session.username,
                placeId: stateId,
                visited,
              }),
          });
          global.fetch = fetchSpy;

          await saveVisitedState(session, stateId, visited);

          expect(fetchSpy).toHaveBeenCalledTimes(1);
          const [, init] = fetchSpy.mock.calls[0];
          expect(init.headers.Authorization).toBe(session.accessToken);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('listVisitedStates requests a URL ending in /visit?placeType=us-state, while saveVisitedState requests the bare /visit URL with no query string', async () => {
    const session = { username: 'alice', accessToken: 'token-123', expiresAt: Date.now() + 100000 };

    const listFetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ placesVisited: [] }),
    });
    global.fetch = listFetchSpy;
    await listVisitedStates(session);
    const [listUrl] = listFetchSpy.mock.calls[0];
    expect(listUrl).toMatch(/\/visit\?placeType=us-state$/);

    const saveFetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ username: 'alice', placeId: 'CA', visited: true }),
    });
    global.fetch = saveFetchSpy;
    await saveVisitedState(session, 'CA', true);
    const [saveUrl] = saveFetchSpy.mock.calls[0];
    expect(saveUrl).toMatch(/\/visit$/);
    expect(saveUrl).not.toContain('?');
  });

  describe('timeout, failure, and auth-error classification', () => {
    const session = { username: 'alice', accessToken: 'token-123', expiresAt: Date.now() + 100000 };

    afterEach(() => {
      delete global.fetch;
      jest.useRealTimers();
    });

    it('listVisitedStates rejects with { kind: "TIMEOUT" } when the request is aborted after 10 seconds', async () => {
      jest.useFakeTimers();
      global.fetch = jest.fn((_url, init) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject({ name: 'AbortError' });
          });
        });
      });

      const promise = listVisitedStates(session);
      const expectation = expect(promise).rejects.toEqual({ kind: 'TIMEOUT' });
      await jest.advanceTimersByTimeAsync(10000);
      await expectation;
    });

    it('saveVisitedState rejects with { kind: "TIMEOUT" } when the request is aborted after 10 seconds', async () => {
      jest.useFakeTimers();
      global.fetch = jest.fn((_url, init) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject({ name: 'AbortError' });
          });
        });
      });

      const promise = saveVisitedState(session, 'CA', true);
      const expectation = expect(promise).rejects.toEqual({ kind: 'TIMEOUT' });
      await jest.advanceTimersByTimeAsync(10000);
      await expectation;
    });

    it('listVisitedStates rejects with { kind: "FAILURE" } for a non-ok, non-401/403 response', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

      await expect(listVisitedStates(session)).rejects.toEqual({ kind: 'FAILURE' });
    });

    it('saveVisitedState rejects with { kind: "FAILURE" } for a non-ok, non-401/403 response', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

      await expect(saveVisitedState(session, 'CA', true)).rejects.toEqual({ kind: 'FAILURE' });
    });

    it('listVisitedStates rejects with { kind: "FAILURE" } when fetch rejects outright (network error)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

      await expect(listVisitedStates(session)).rejects.toEqual({ kind: 'FAILURE' });
    });

    it('saveVisitedState rejects with { kind: "FAILURE" } when fetch rejects outright (network error)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

      await expect(saveVisitedState(session, 'CA', true)).rejects.toEqual({ kind: 'FAILURE' });
    });

    it('listVisitedStates rejects with { kind: "FAILURE" } when the response body is malformed JSON', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('bad json')),
      });

      await expect(listVisitedStates(session)).rejects.toEqual({ kind: 'FAILURE' });
    });

    it('saveVisitedState rejects with { kind: "FAILURE" } when the response body is malformed JSON', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('bad json')),
      });

      await expect(saveVisitedState(session, 'CA', true)).rejects.toEqual({ kind: 'FAILURE' });
    });

    it('listVisitedStates rejects with { kind: "AUTH_ERROR" } for a 401 response', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

      await expect(listVisitedStates(session)).rejects.toEqual({ kind: 'AUTH_ERROR' });
    });

    it('listVisitedStates rejects with { kind: "AUTH_ERROR" } for a 403 response', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });

      await expect(listVisitedStates(session)).rejects.toEqual({ kind: 'AUTH_ERROR' });
    });

    it('saveVisitedState rejects with { kind: "AUTH_ERROR" } for a 401 response', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

      await expect(saveVisitedState(session, 'CA', true)).rejects.toEqual({ kind: 'AUTH_ERROR' });
    });

    it('saveVisitedState rejects with { kind: "AUTH_ERROR" } for a 403 response', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });

      await expect(saveVisitedState(session, 'CA', true)).rejects.toEqual({ kind: 'AUTH_ERROR' });
    });
  });
});
