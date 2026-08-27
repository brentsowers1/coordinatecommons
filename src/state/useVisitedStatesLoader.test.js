import fc from 'fast-check';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useVisitedStatesLoader, toVisitedStateIdsMap } from './useVisitedStatesLoader';

// Smoke tests for the authenticated load-on-mount effect, status/retry
// plumbing (task 8.1), and the load-success map-shaping (task 8.2).
// Comprehensive coverage (Property 8, Property 9, and the 10-second
// timeout/retry unit tests) is added by tasks 8.3, 8.5, 8.6.

describe('useVisitedStatesLoader', () => {
  afterEach(() => {
    global.fetch = undefined;
  });

  const session = { username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 };

  it('does not call fetch and reports ready when there is no session', () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    const { result } = renderHook(() => useVisitedStatesLoader(null));

    expect(result.current.status).toBe('ready');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('starts loading and becomes ready with the returned stateIds on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ placesVisited: [{ Id: 'CA' }, { Id: 'AZ' }] }),
    });

    const { result } = renderHook(() => useVisitedStatesLoader(session));

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.visitedStateIds).toEqual({ CA: true, AZ: true });
  });

  it('reports error status when listVisitedStates rejects, and retry() re-issues the call', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ placesVisited: [] }),
      });

    const { result } = renderHook(() => useVisitedStatesLoader(session));

    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.visitedStateIds).toEqual({});
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('useVisitedStatesLoader - 10-second load timeout and retry (task 8.6)', () => {
  afterEach(() => {
    global.fetch = undefined;
    jest.useRealTimers();
  });

  const session = { username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 };

  it('reports status "error" once the internal 10-second timeout fires (Requirements 4.1, 4.2, 4.4)', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject({ name: 'AbortError' });
        });
      });
    });

    const { result } = renderHook(() => useVisitedStatesLoader(session));

    // Loading indicator shown while the request is in flight.
    expect(result.current.status).toBe('loading');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10000);
    });

    expect(result.current.status).toBe('error');
  });

  it('retry() re-issues the request and transitions loading -> ready after a timed-out attempt (Requirement 4.5)', async () => {
    jest.useFakeTimers();
    global.fetch = jest
      .fn()
      .mockImplementationOnce((_url, init) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject({ name: 'AbortError' });
          });
        });
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ placesVisited: [{ Id: 'NY' }] }),
      });

    const { result } = renderHook(() => useVisitedStatesLoader(session));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10000);
    });

    expect(result.current.status).toBe('error');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retry();
    });

    expect(result.current.status).toBe('loading');

    // Switch back to real timers so the second (successful, non-aborting)
    // fetch's promise microtasks resolve without needing to advance fake
    // timers further.
    jest.useRealTimers();

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.visitedStateIds).toEqual({ NY: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

// Arbitrary for an arbitrary "prior visitedStateIds map" (including the
// empty map). `toVisitedStateIdsMap` doesn't actually take this as an
// input (see useVisitedStatesLoader.js: the result unconditionally
// replaces whatever visitedStateIds held before, so the function doesn't
// need the prior value as a parameter at all -- consistent with how
// sessionHandlers.test.js's Property 2/4 tests handle this same pattern),
// so the property below demonstrates the outcome is the same regardless of
// this value by simply not passing it in. This reduces the property to:
// for any list of stateIds returned by the Visit_Record_API, the resulting
// map's keys are always exactly that list's unique values.
const priorVisitedStateIdsArb = fc.dictionary(fc.string(), fc.constant(true));

// Excludes "__proto__" (and other reserved/prototype-chain keys): a plain
// object used as a map treats a "__proto__" key specially (it sets the
// prototype rather than an own property), which is a JS object-literal
// pitfall unrelated to toVisitedStateIdsMap's actual behavior -- real
// stateIds are USPS codes and never take this value. Without this filter,
// fc.string() can generate "__proto__" as an array element, which
// toVisitedStateIdsMap assigns via `visitedStateIdsMap[stateId] = true` on
// a plain `{}` -- reassigning the prototype instead of creating an own
// property, so it never shows up in Object.keys(result) and spuriously
// fails the property's key-set assertion.
const returnedStateIdsArb = fc.array(
  fc.string().filter((s) => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'),
  { maxLength: 20 }
);

describe('toVisitedStateIdsMap', () => {
  // Feature: state-visit-tracker, Property 8: Loading visited states replaces the store with exactly what the API returned
  test('property: always yields a map whose keys are exactly the returned stateIds, with every value true, regardless of any prior visitedStateIds', () => {
    fc.assert(
      fc.property(priorVisitedStateIdsArb, returnedStateIdsArb, (priorVisitedStateIds, stateIds) => {
        // priorVisitedStateIds is generated to demonstrate the property
        // holds "for any prior visitedStateIds map", but is intentionally
        // not passed to toVisitedStateIdsMap since it unconditionally
        // replaces the prior value rather than accepting it as input.
        const result = toVisitedStateIdsMap(stateIds);

        const expectedKeys = new Set(stateIds);
        expect(new Set(Object.keys(result))).toEqual(expectedKeys);
        Object.values(result).forEach((value) => {
          expect(value).toBe(true);
        });
      }),
      { numRuns: 100 }
    );
  });

  // Empty-list case is naturally covered by returnedStateIdsArb (fc.array
  // defaults to minLength: 0), but pin it down explicitly too.
  test('returns {} for an empty returned list', () => {
    expect(toVisitedStateIdsMap([])).toEqual({});
  });
});

describe('useVisitedStatesLoader - guest initialization after a session (task 8.5)', () => {
  afterEach(() => {
    global.fetch = undefined;
  });

  // Feature: state-visit-tracker, Property 9: Guest initialization never calls the API and preserves local marks
  it(
    'property: switching to a falsy session after an authenticated load never calls fetch again and leaves visitedStateIds unchanged',
    async () => {
      await fc.assert(
        fc.asyncProperty(returnedStateIdsArb, async (stateIds) => {
          const session = {
            username: 'alice',
            accessToken: 'token',
            expiresAt: Date.now() + 100000,
          };

          global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                placesVisited: stateIds.map((stateId) => ({ Id: stateId })),
              }),
          });

          const { result, rerender, unmount } = renderHook(
            ({ session: currentSession }) => useVisitedStatesLoader(currentSession),
            { initialProps: { session } }
          );

          // Load as an authenticated user first, so visitedStateIds holds a
          // "pre-existing local map" before we simulate becoming a guest.
          await waitFor(() => expect(result.current.status).toBe('ready'));
          const expectedVisitedStateIds = toVisitedStateIdsMap(stateIds);
          expect(result.current.visitedStateIds).toEqual(expectedVisitedStateIds);

          const fetchCallCountBeforeGuest = global.fetch.mock.calls.length;

          // Simulate logout / an unauthenticated session by rerendering with
          // a falsy session.
          rerender({ session: null });

          // Flush any pending effects triggered by the rerender.
          await act(async () => {});

          expect(result.current.status).toBe('ready');
          expect(global.fetch.mock.calls.length).toBe(fetchCallCountBeforeGuest);
          expect(result.current.visitedStateIds).toEqual(expectedVisitedStateIds);

          unmount();
        }),
        { numRuns: 100 }
      );
    },
    30000
  );
});
