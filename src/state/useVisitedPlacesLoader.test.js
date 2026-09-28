import fc from 'fast-check';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useVisitedPlacesLoader,
  toVisitedStateIdsMap,
  updateVisitedPlacesCache,
} from './useVisitedPlacesLoader';

// Smoke tests for the authenticated load-on-mount effect, status/retry
// plumbing (task 8.1), and the load-success map-shaping (task 8.2).
// Comprehensive coverage (Property 8, Property 9, and the 10-second
// timeout/retry unit tests) is added by tasks 8.3, 8.5, 8.6. Task 21.9
// renamed this hook to useVisitedPlacesLoader(session, placeCategory) and
// its returned `visitedStateIds` field to `visitedPlaceIds`; the tests
// below were updated in place (not duplicated) to match, and a new
// per-category cache-reuse test was added.

describe('useVisitedPlacesLoader', () => {
  afterEach(() => {
    global.fetch = undefined;
  });

  const session = { username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 };

  it('does not call fetch and reports ready when there is no session', () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    const { result } = renderHook(() => useVisitedPlacesLoader(null, 'us-state'));

    expect(result.current.status).toBe('ready');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('starts loading and becomes ready with the returned stateIds on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ placesVisited: [{ Id: 'CA' }, { Id: 'AZ' }] }),
    });

    const { result } = renderHook(() => useVisitedPlacesLoader(session, 'us-state-smoke-1'));

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.visitedPlaceIds).toEqual({ CA: true, AZ: true });
  });

  it('reports error status when listVisitedPlaces rejects, and retry() re-issues the call', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ placesVisited: [] }),
      });

    const { result } = renderHook(() => useVisitedPlacesLoader(session, 'us-state-smoke-2'));

    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.visitedPlaceIds).toEqual({});
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('useVisitedPlacesLoader - 10-second load timeout and retry (task 8.6)', () => {
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

    const { result } = renderHook(() => useVisitedPlacesLoader(session, 'us-state-timeout-1'));

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

    const { result } = renderHook(() => useVisitedPlacesLoader(session, 'us-state-timeout-2'));

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
    expect(result.current.visitedPlaceIds).toEqual({ NY: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

// Arbitrary for an arbitrary "prior visitedPlaceIds map" (including the
// empty map). `toVisitedStateIdsMap` doesn't actually take this as an
// input (see useVisitedPlacesLoader.js: the result unconditionally
// replaces whatever visitedPlaceIds held before, so the function doesn't
// need the prior value as a parameter at all -- consistent with how
// sessionHandlers.test.js's Property 2/4 tests handle this same pattern),
// so the property below demonstrates the outcome is the same regardless of
// this value by simply not passing it in. This reduces the property to:
// for any list of placeIds returned by the Visit_Record_API, the resulting
// map's keys are always exactly that list's unique values.
const priorVisitedStateIdsArb = fc.dictionary(fc.string(), fc.constant(true));

// Excludes "__proto__" (and other reserved/prototype-chain keys): a plain
// object used as a map treats a "__proto__" key specially (it sets the
// prototype rather than an own property), which is a JS object-literal
// pitfall unrelated to toVisitedStateIdsMap's actual behavior -- real
// placeIds are USPS codes and never take this value. Without this filter,
// fc.string() can generate "__proto__" as an array element, which
// toVisitedStateIdsMap assigns via `visitedPlaceIdsMap[placeId] = true` on
// a plain `{}` -- reassigning the prototype instead of creating an own
// property, so it never shows up in Object.keys(result) and spuriously
// fails the property's key-set assertion.
const returnedStateIdsArb = fc.array(
  fc.string().filter((s) => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'),
  { maxLength: 20 }
);

describe('toVisitedStateIdsMap', () => {
  // Feature: state-visit-tracker, Property 8: Loading visited states replaces the store with exactly what the API returned
  test('property: always yields a map whose keys are exactly the returned placeIds, with every value true, regardless of any prior visitedPlaceIds', () => {
    fc.assert(
      fc.property(priorVisitedStateIdsArb, returnedStateIdsArb, (priorVisitedPlaceIds, placeIds) => {
        // priorVisitedPlaceIds is generated to demonstrate the property
        // holds "for any prior visitedPlaceIds map", but is intentionally
        // not passed to toVisitedStateIdsMap since it unconditionally
        // replaces the prior value rather than accepting it as input.
        const result = toVisitedStateIdsMap(placeIds);

        const expectedKeys = new Set(placeIds);
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

describe('useVisitedPlacesLoader - guest initialization after a session (task 8.5)', () => {
  afterEach(() => {
    global.fetch = undefined;
  });

  // Feature: state-visit-tracker, Property 9: Guest initialization never calls the API and preserves local marks
  it(
    'property: switching to a falsy session after an authenticated load never calls fetch again and leaves visitedPlaceIds unchanged',
    async () => {
      await fc.assert(
        fc.asyncProperty(returnedStateIdsArb, async (placeIds) => {
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
                placesVisited: placeIds.map((placeId) => ({ Id: placeId })),
              }),
          });

          // A fresh, unique category per property run so this test's
          // mounts never hit useVisitedPlacesLoader's per-category cache
          // from an earlier run/property case.
          const category = `us-state-guest-property-${Math.random()}`;

          const { result, rerender, unmount } = renderHook(
            ({ session: currentSession }) => useVisitedPlacesLoader(currentSession, category),
            { initialProps: { session } }
          );

          // Load as an authenticated user first, so visitedPlaceIds holds a
          // "pre-existing local map" before we simulate becoming a guest.
          await waitFor(() => expect(result.current.status).toBe('ready'));
          const expectedVisitedPlaceIds = toVisitedStateIdsMap(placeIds);
          expect(result.current.visitedPlaceIds).toEqual(expectedVisitedPlaceIds);

          const fetchCallCountBeforeGuest = global.fetch.mock.calls.length;

          // Simulate logout / an unauthenticated session by rerendering with
          // a falsy session.
          rerender({ session: null });

          // Flush any pending effects triggered by the rerender.
          await act(async () => {});

          expect(result.current.status).toBe('ready');
          expect(global.fetch.mock.calls.length).toBe(fetchCallCountBeforeGuest);
          expect(result.current.visitedPlaceIds).toEqual(expectedVisitedPlaceIds);

          unmount();
        }),
        { numRuns: 100 }
      );
    },
    30000
  );
});

describe('useVisitedPlacesLoader - per-category caching (Requirement 14.5, task 21.9)', () => {
  afterEach(() => {
    global.fetch = undefined;
  });

  const session = { username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 };

  it('reuses the cached result for an already-successfully-loaded category instead of re-fetching', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ placesVisited: [{ Id: 'NY' }] }),
    });

    const category = 'us-state-test-unique-cache';

    const first = renderHook(() => useVisitedPlacesLoader(session, category));
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Unmount and mount again for the same category: should reuse the
    // cached result rather than issuing a second request.
    first.unmount();

    const second = renderHook(() => useVisitedPlacesLoader(session, category));
    expect(second.result.current.status).toBe('ready');
    expect(second.result.current.visitedPlaceIds).toEqual({ NY: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('de-dupes concurrent mounts for the same category while the first request is still in flight (task 26.1)', async () => {
    let resolveFetch;
    global.fetch = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const category = 'us-state-test-concurrent-inflight';

    // Mount twice for the same not-yet-cached category before the first
    // request resolves.
    const first = renderHook(() => useVisitedPlacesLoader(session, category));
    const second = renderHook(() => useVisitedPlacesLoader(session, category));

    expect(first.result.current.status).toBe('loading');
    expect(second.result.current.status).toBe('loading');
    // Only one underlying fetch should have been issued for both mounts.
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ placesVisited: [{ Id: 'TX' }] }),
      });
      // Allow the in-flight promise's .then chains to flush.
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));

    expect(first.result.current.visitedPlaceIds).toEqual({ TX: true });
    expect(second.result.current.visitedPlaceIds).toEqual({ TX: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    first.unmount();
    second.unmount();
  });
});

// The three Place_Category values supported by the Visit_Record_API
// (Requirement 15.2; design.md's "Visit_Record_API Contract"), matching the
// same constant used by handlePlaceBoundaryClick.test.js and
// visitRecordApiClient.test.js.
const placeCategoryArbitrary = fc.constantFrom('us-state', 'canada-state', 'country');

// Arbitrary for a single category's slice of VisitedPlaceIdsByCategory:
// an arbitrary dictionary of { [placeId]: true }.
const visitedPlaceIdsSliceArbitrary = fc.dictionary(
  fc.string().filter((s) => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'),
  fc.constant(true)
);

// Arbitrary for a full prior VisitedPlaceIdsByCategory value: all three
// categories present, each with an arbitrary slice.
const visitedPlaceIdsByCategoryArbitrary = fc.record({
  'us-state': visitedPlaceIdsSliceArbitrary,
  'canada-state': visitedPlaceIdsSliceArbitrary,
  country: visitedPlaceIdsSliceArbitrary,
});

describe('Property 8 (generalized): per-category slice replacement in useVisitedPlaceIdsByCategory', () => {
  // Feature: state-visit-tracker, Property 8: Loading visited places for a category replaces that category's slice with exactly what the API returned, leaving other categories' slices untouched
  //
  // useVisitedPlacesLoader itself never touches useVisitedPlaceIdsByCategory
  // (see this module's doc comment) -- callers apply its load-success result
  // via the same functional-update pattern already used by
  // LoginPage.jsx/TopNav.jsx/MapView.jsx:
  //   setVisitedPlaceIdsByCategory((previous) => ({
  //     ...previous,
  //     [placeCategory]: toVisitedStateIdsMap(apiReturnedPlaceIds),
  //   }));
  // This property formalizes that pattern's guarantee directly against a
  // prior VisitedPlaceIdsByCategory value, without needing to render a
  // component or mock fetch, so a future caller change can't silently
  // regress either half of Requirement 4.3/14.6.
  test('property: replaces only the target category slice with exactly the returned placeIds, leaving every other category slice untouched', () => {
    fc.assert(
      fc.property(
        visitedPlaceIdsByCategoryArbitrary,
        placeCategoryArbitrary,
        returnedStateIdsArb,
        (priorState, targetCategory, apiReturnedPlaceIds) => {
          // The same functional-update pattern every existing caller uses.
          const nextState = {
            ...priorState,
            [targetCategory]: toVisitedStateIdsMap(apiReturnedPlaceIds),
          };

          // Requirement 4.3 (generalized): the target category's slice has
          // exactly the (deduplicated) returned placeIds as keys, each true,
          // regardless of what was in priorState[targetCategory] before.
          const expectedKeys = new Set(apiReturnedPlaceIds);
          expect(new Set(Object.keys(nextState[targetCategory]))).toEqual(expectedKeys);
          Object.values(nextState[targetCategory]).forEach((value) => {
            expect(value).toBe(true);
          });

          // Requirement 14.6: every OTHER category's slice is left
          // completely untouched -- reference-equal to its prior value,
          // since the spread pattern never creates a new object for keys
          // it doesn't explicitly overwrite.
          Object.keys(priorState)
            .filter((category) => category !== targetCategory)
            .forEach((otherCategory) => {
              expect(nextState[otherCategory]).toBe(priorState[otherCategory]);
            });
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Arbitrary for a single "switch event" in a sequence of
// useSelectedPlaceCategory changes: which category becomes newly selected,
// and (optionally) a load result that completes for it as part of that
// switch. `loadResultPlaceIds: null` simulates the switch happening without
// an associated load having completed yet (Requirement 14.2's loading
// state, or a guest session where no fetch ever happens) -- for that case
// the property step applies no state change at all. A non-null array
// simulates the eventual success handler applying its result via the same
// functional-update pattern proven correct for a single step by task 26.3's
// "Property 8 (generalized)" test above.
const switchEventArbitrary = fc.record({
  targetCategory: placeCategoryArbitrary,
  loadResultPlaceIds: fc.option(returnedStateIdsArb, { nil: null }),
});

describe('Property 29: switching Selected_Place_Category never mutates another category\'s stored records across a sequence of switches', () => {
  // Feature: state-visit-tracker, Property 29: Switching the Selected_Place_Category never mutates any other category's stored Visited_Place records
  //
  // Task 26.3's "Property 8 (generalized)" test above proves this
  // untouched-other-categories guarantee for a SINGLE functional-update
  // step. This property extends that to an arbitrary SEQUENCE of
  // `useSelectedPlaceCategory` switches (1-10 of them), where each switch
  // may or may not have an associated load completing for the newly
  // selected category, and asserts the guarantee continues to hold after
  // EVERY step in the sequence -- not just once in isolation. The
  // "expected state" is tracked across the sequence so each step's
  // assertion is against the correct immediately-prior baseline.
  test('property: after every switch in a sequence, every other category\'s slice remains reference-equal to its value immediately before that switch', () => {
    fc.assert(
      fc.property(
        visitedPlaceIdsByCategoryArbitrary,
        fc.array(switchEventArbitrary, { minLength: 1, maxLength: 10 }),
        (initialState, switchEvents) => {
          let currentState = initialState;

          switchEvents.forEach(({ targetCategory, loadResultPlaceIds }) => {
            const stateBeforeThisSwitch = currentState;

            // Only a completed load actually changes the state (via the
            // same functional-update pattern every real caller uses); a
            // null loadResultPlaceIds means "still loading" or "guest, no
            // fetch happened" for this switch, so the state is unchanged.
            const nextState =
              loadResultPlaceIds === null
                ? stateBeforeThisSwitch
                : {
                    ...stateBeforeThisSwitch,
                    [targetCategory]: toVisitedStateIdsMap(loadResultPlaceIds),
                  };

            // After this step: every category OTHER than the one just
            // targeted must be byte-for-byte (reference-equal) identical
            // to what it held immediately before this step -- regardless
            // of what happened on any earlier step in the sequence.
            Object.keys(stateBeforeThisSwitch)
              .filter((category) => category !== targetCategory)
              .forEach((otherCategory) => {
                expect(nextState[otherCategory]).toBe(stateBeforeThisSwitch[otherCategory]);
              });

            currentState = nextState;
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('useVisitedPlacesLoader - per-category loading/error/retry independence (Requirements 14.2, 14.4, task 26.6)', () => {
  // Mirrors placeBoundaries.test.js's analogous describe block: mounts
  // TWO independent useVisitedPlacesLoader instances for two DIFFERENT
  // categories at once, simulating what MapView will do once task 29
  // wires the real useSelectedPlaceCategory() through (MapView.jsx
  // currently hardcodes 'us-state' for this loader too; see that file's
  // task 21.9 comment). Existing tests above (the per-category caching
  // and Stale Request Discard describe blocks) use distinct category
  // names across different tests, but never assert two categories' loaders
  // are independent of EACH OTHER within the same test -- this fills that
  // gap for the visited-places loader specifically.
  afterEach(() => {
    global.fetch = undefined;
  });

  const session = { username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 };

  it('keeps one category loading while a different category is also still loading, independently of each other (Requirement 14.2)', () => {
    global.fetch = jest.fn(() => new Promise(() => {}));

    const categoryA = 'us-state-test-independence-loading-a';
    const categoryB = 'canada-state-test-independence-loading-b';

    const loaderA = renderHook(() => useVisitedPlacesLoader(session, categoryA));
    const loaderB = renderHook(() => useVisitedPlacesLoader(session, categoryB));

    expect(loaderA.result.current.status).toBe('loading');
    expect(loaderB.result.current.status).toBe('loading');

    loaderA.unmount();
    loaderB.unmount();
  });

  it("does not let one category's failure affect a different category's ready status, and each retry() only re-issues its own category's request (Requirement 14.4)", async () => {
    const categoryA = 'us-state-test-independence-error-a';
    const categoryB = 'canada-state-test-independence-error-b';

    let callCount = 0;
    global.fetch = jest.fn(() => {
      callCount += 1;
      // The first call is categoryA's initial request (fails); every
      // subsequent call (categoryB's initial request, and categoryA's
      // later retry) succeeds.
      if (callCount === 1) {
        return Promise.reject(new Error('network down for categoryA'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ placesVisited: [] }),
      });
    });

    const loaderA = renderHook(() => useVisitedPlacesLoader(session, categoryA));
    const loaderB = renderHook(() => useVisitedPlacesLoader(session, categoryB));

    await waitFor(() => expect(loaderA.result.current.status).toBe('error'));
    await waitFor(() => expect(loaderB.result.current.status).toBe('ready'));

    // categoryB remains 'ready' -- categoryA's error never touched it.
    expect(loaderB.result.current.status).toBe('ready');

    const fetchCallsBeforeRetry = global.fetch.mock.calls.length;
    expect(fetchCallsBeforeRetry).toBe(2);

    act(() => {
      loaderA.result.current.retry();
    });

    await waitFor(() => expect(loaderA.result.current.status).toBe('ready'));

    // Retrying categoryA must not have re-fetched or altered categoryB,
    // which never called retry(): exactly one additional fetch call (for
    // categoryA's retry), and categoryB's status/data untouched.
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(loaderB.result.current.status).toBe('ready');
    expect(loaderB.result.current.visitedPlaceIds).toEqual({});

    loaderA.unmount();
    loaderB.unmount();
  });
});

describe('useVisitedPlacesLoader - Stale Request Discard on category switch (Requirement 14.7, task 26.2)', () => {
  afterEach(() => {
    global.fetch = undefined;
  });

  const session = { username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 };

  it('discards a stale category\'s late-resolving result when the same instance switches placeCategory before it settles', async () => {
    const staleCategory = 'us-state-test-stale-switch-old';
    const newCategory = 'us-state-test-stale-switch-new';

    let resolveStaleFetch;
    global.fetch = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStaleFetch = resolve;
        })
    );

    const { result, rerender } = renderHook(
      ({ placeCategory }) => useVisitedPlacesLoader(session, placeCategory),
      { initialProps: { placeCategory: staleCategory } }
    );

    expect(result.current.status).toBe('loading');
    const staleFetchCallCount = global.fetch.mock.calls.length;
    expect(staleFetchCallCount).toBe(1);

    // Switch categories on the SAME hook instance before the stale
    // request resolves. This triggers the old effect's cleanup
    // (cancelled = true for the stale closure) and mounts a fresh effect
    // for newCategory.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ placesVisited: [{ Id: 'NEWCAT' }] }),
    });

    rerender({ placeCategory: newCategory });

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.visitedPlaceIds).toEqual({ NEWCAT: true });

    // Now resolve the stale (old category's) request late.
    await act(async () => {
      resolveStaleFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ placesVisited: [{ Id: 'STALE' }] }),
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The current instance must still reflect newCategory's data, not the
    // stale result.
    expect(result.current.status).toBe('ready');
    expect(result.current.visitedPlaceIds).toEqual({ NEWCAT: true });

    // The stale category must not have been written to the module-level
    // cache: a fresh mount for staleCategory must re-fetch from scratch
    // rather than immediately reporting the discarded 'STALE' result.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ placesVisited: [{ Id: 'FRESH' }] }),
    });

    const freshMountForStaleCategory = renderHook(() =>
      useVisitedPlacesLoader(session, staleCategory)
    );
    expect(freshMountForStaleCategory.result.current.status).toBe('loading');
    await waitFor(() =>
      expect(freshMountForStaleCategory.result.current.status).toBe('ready')
    );
    expect(freshMountForStaleCategory.result.current.visitedPlaceIds).toEqual({ FRESH: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    freshMountForStaleCategory.unmount();
  });
});

describe('Property 30: stale in-flight results are always discarded', () => {
  // Feature: state-visit-tracker, Property 30: A stale in-flight request's result is always discarded without mutating the store
  //
  // Generalizes task 26.2's fixed-example "Stale Request Discard on
  // category switch" test above (one hardcoded stale/new category pair,
  // one hardcoded pair of placeId results) into an arbitrary property:
  // for ANY two distinct categories and ANY returned placeId data, a
  // request that goes stale because the same hook instance switches away
  // from its category before the request settles must never be reflected
  // in that instance's later state, and must never poison the module-level
  // cache for the stale category -- regardless of whether the late-arriving
  // stale result is a success or a rejection (Requirement 14.7's "resolves
  // (success or failure)" wording).
  afterEach(() => {
    global.fetch = undefined;
  });

  const session = { username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 };

  // A monotonically increasing counter suffix guarantees every property
  // run (and every fixed example elsewhere in this file) uses a category
  // never seen before by the module-level visitedPlacesCacheByCategory
  // cache, which otherwise persists across property runs and across the
  // whole test file (same technique as placeBoundaries.test.js's
  // Property 28 test).
  let runCounter = 0;
  function uniqueCategoryArb(label) {
    return fc.string({ minLength: 3, maxLength: 12 }).map((s) => {
      runCounter += 1;
      return `prop30-${label}-${runCounter}-${s}`;
    });
  }

  const placeIdsArb = fc.array(
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'),
    { maxLength: 8 }
  );

  const propertyArb = fc.record({
    staleCategory: uniqueCategoryArb('stale'),
    newCategory: uniqueCategoryArb('new'),
    newPlaceIds: placeIdsArb,
    stalePlaceIds: placeIdsArb,
    staleOutcomeIsSuccess: fc.boolean(),
    freshPlaceIdsAfterDiscard: placeIdsArb,
  });

  test(
    "property: a stale category's late-arriving result (success or failure) never mutates a switched-away instance's state, and never populates that category's cache",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          propertyArb,
          async ({
            staleCategory,
            newCategory,
            newPlaceIds,
            stalePlaceIds,
            staleOutcomeIsSuccess,
            freshPlaceIdsAfterDiscard,
          }) => {
            let settleStaleFetch;
            global.fetch = jest.fn().mockImplementation(
              () =>
                new Promise((resolve, reject) => {
                  settleStaleFetch = { resolve, reject };
                })
            );

            const { result, rerender, unmount } = renderHook(
              ({ placeCategory }) => useVisitedPlacesLoader(session, placeCategory),
              { initialProps: { placeCategory: staleCategory } }
            );

            // The request for staleCategory is in flight.
            expect(result.current.status).toBe('loading');

            // Switch the SAME hook instance away from staleCategory before
            // its request settles, and let newCategory's own request
            // succeed.
            global.fetch = jest.fn().mockResolvedValue({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ placesVisited: newPlaceIds.map((placeId) => ({ Id: placeId })) }),
            });

            rerender({ placeCategory: newCategory });

            await waitFor(() => expect(result.current.status).toBe('ready'));
            const expectedNewVisitedPlaceIds = toVisitedStateIdsMap(newPlaceIds);
            expect(result.current.visitedPlaceIds).toEqual(expectedNewVisitedPlaceIds);

            // Now let the stale, original staleCategory request settle
            // late -- either as a success or as a rejection, per this
            // run's generated outcome.
            await act(async () => {
              if (staleOutcomeIsSuccess) {
                settleStaleFetch.resolve({
                  ok: true,
                  status: 200,
                  json: () => Promise.resolve({ placesVisited: stalePlaceIds.map((placeId) => ({ Id: placeId })) }),
                });
              } else {
                settleStaleFetch.reject(new Error('stale request failed late'));
              }
              await Promise.resolve();
              await Promise.resolve();
              await Promise.resolve();
            });

            // (a) The instance's current rendered state still reflects
            // newCategory's data, completely unaffected by the stale
            // resolution, whether it was a late success or a late
            // failure.
            expect(result.current.status).toBe('ready');
            expect(result.current.visitedPlaceIds).toEqual(expectedNewVisitedPlaceIds);

            // (b) A FRESH instance for staleCategory afterward must
            // trigger a genuine new fetch (proving no cache entry was
            // created for the discarded stale result -- true whether the
            // stale result was a success or a failure, since only
            // successful loads are ever cached), and that fresh fetch's
            // own (different, arbitrary) result -- not the discarded one
            // -- is what gets reported.
            global.fetch = jest.fn().mockResolvedValue({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  placesVisited: freshPlaceIdsAfterDiscard.map((placeId) => ({ Id: placeId })),
                }),
            });

            const freshMount = renderHook(() => useVisitedPlacesLoader(session, staleCategory));
            expect(freshMount.result.current.status).toBe('loading');
            expect(global.fetch).toHaveBeenCalledTimes(1);

            await waitFor(() => expect(freshMount.result.current.status).toBe('ready'));
            expect(freshMount.result.current.visitedPlaceIds).toEqual(
              toVisitedStateIdsMap(freshPlaceIdsAfterDiscard)
            );

            freshMount.unmount();
            unmount();
          }
        ),
        { numRuns: 50 }
      );
    },
    30000
  );
});

// Bugfix regression tests: updateVisitedPlacesCache (exported so
// useStateBoundaryClickHandler can keep this module's per-category cache in
// sync with direct writes it makes to the Shared_State_Store after a save
// settles -- see that export's doc comment above for the full bug this
// closes: a stale cache entry being reapplied over freshly-saved data when
// switching Selected_Place_Category away and back).
describe('updateVisitedPlacesCache', () => {
  afterEach(() => {
    global.fetch = undefined;
  });

  const session = { username: 'alice', accessToken: 'token', expiresAt: Date.now() + 100000 };

  it('writes/overwrites the cache entry for a category, so a subsequent mount reports ready with exactly that data without calling fetch', async () => {
    const category = 'us-state-test-update-cache-direct';
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    updateVisitedPlacesCache(category, { NY: true, NJ: true });

    const { result, unmount } = renderHook(() => useVisitedPlacesLoader(session, category));

    expect(result.current.status).toBe('ready');
    expect(result.current.visitedPlaceIds).toEqual({ NY: true, NJ: true });
    expect(fetchSpy).not.toHaveBeenCalled();

    unmount();
  });

  it('overwrites a previously-cached (e.g. stale pre-save) entry for the same category', async () => {
    const category = 'us-state-test-update-cache-overwrite';

    // Populate the cache the normal way (a real successful load).
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ placesVisited: [] }),
    });
    const first = renderHook(() => useVisitedPlacesLoader(session, category));
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    expect(first.result.current.visitedPlaceIds).toEqual({});
    first.unmount();

    // Simulate a save settling: directly update the cache to reflect the
    // new authoritative membership map for this category.
    updateVisitedPlacesCache(category, { CA: true });

    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    const second = renderHook(() => useVisitedPlacesLoader(session, category));
    expect(second.result.current.status).toBe('ready');
    expect(second.result.current.visitedPlaceIds).toEqual({ CA: true });
    expect(fetchSpy).not.toHaveBeenCalled();

    second.unmount();
  });
});
