// Unit tests for useStateBoundaryClickHandler (task 14.6): the wiring
// between the pure `handlePlaceBoundaryClick` orchestration function and
// the Shared_State_Store (useSession/useVisitedPlaceIdsByCategory/
// usePendingPlaceIds/useToastError). Properties 10-13 already cover handlePlaceBoundaryClick
// itself (tasks 14.2-14.5); these tests only cover that the wiring applies
// the optimistic update, then the settled result, and surfaces a toast
// error on revert (Requirements 5.3, 9.4).

import React from 'react';
import { render, screen, fireEvent, waitFor, act, renderHook } from '@testing-library/react';

import { useStateBoundaryClickHandler } from './useStateBoundaryClickHandler';
import { useVisitedPlacesLoader, updateVisitedPlacesCache } from './useVisitedPlacesLoader';
import {
  useSession,
  useSelectedPlaceCategory,
  useVisitedPlaceIdsByCategory,
  usePendingPlaceIds,
  useToastError,
} from './sharedState';

jest.mock('./useVisitedPlacesLoader', () => {
  const actual = jest.requireActual('./useVisitedPlacesLoader');
  return {
    ...actual,
    updateVisitedPlacesCache: jest.fn(actual.updateVisitedPlacesCache),
  };
});

function Harness({ apiClient, category = 'us-state' }) {
  const onStateBoundaryClick = useStateBoundaryClickHandler(apiClient);
  const [, setSession] = useSession();
  const [visitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
  const [pendingPlaceIds] = usePendingPlaceIds();
  const visitedStateIds = visitedPlaceIdsByCategory[category];
  const pendingStateIds = pendingPlaceIds[category];
  const [toastError] = useToastError();

  return (
    <div>
      <span data-testid="visited">{JSON.stringify(visitedStateIds)}</span>
      <span data-testid="pending">{JSON.stringify(pendingStateIds)}</span>
      <span data-testid="toastError">{JSON.stringify(toastError)}</span>
      <button onClick={() => setSession({ username: 'alice', accessToken: 'tok', expiresAt: Date.now() + 100000 })}>
        sign in
      </button>
      <button onClick={() => setSession(null)}>sign out</button>
      <button onClick={() => onStateBoundaryClick('CA')}>click CA</button>
    </div>
  );
}

function resetSharedState() {
  function Reset() {
    const [, setSession] = useSession();
    const [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
    const [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
    const [, setPendingPlaceIds] = usePendingPlaceIds();
    const [, setToastError] = useToastError();
    React.useEffect(() => {
      setSession(null);
      setSelectedPlaceCategory('us-state');
      setVisitedPlaceIdsByCategory({ 'us-state': {}, 'canada-state': {}, country: {} });
      setPendingPlaceIds({ 'us-state': {}, 'canada-state': {}, country: {} });
      setToastError(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }
  const { unmount } = render(<Reset />);
  unmount();
}

beforeEach(() => {
  resetSharedState();
  updateVisitedPlacesCache.mockClear();
});

describe('useStateBoundaryClickHandler', () => {
  it('applies the optimistic update immediately, then the settled result on a successful authenticated save', async () => {
    const apiClient = { saveVisitedState: jest.fn().mockResolvedValue(undefined) };
    render(<Harness apiClient={apiClient} />);

    fireEvent.click(screen.getByText('sign in'));
    fireEvent.click(screen.getByText('click CA'));

    // Optimistic update: CA marked visited and pending immediately.
    expect(screen.getByTestId('visited').textContent).toBe(JSON.stringify({ CA: true }));
    expect(screen.getByTestId('pending').textContent).toBe(JSON.stringify({ CA: true }));

    await waitFor(() =>
      expect(screen.getByTestId('pending').textContent).toBe(JSON.stringify({}))
    );

    expect(screen.getByTestId('visited').textContent).toBe(JSON.stringify({ CA: true }));
    expect(screen.getByTestId('toastError').textContent).toBe(JSON.stringify(null));
    expect(apiClient.saveVisitedState).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'tok' }),
      'us-state',
      'CA',
      true
    );
  });

  it('reverts the optimistic update and surfaces a toast error when the save fails', async () => {
    const apiClient = {
      saveVisitedState: jest.fn().mockRejectedValue({ kind: 'FAILURE' }),
    };
    render(<Harness apiClient={apiClient} />);

    fireEvent.click(screen.getByText('sign in'));
    fireEvent.click(screen.getByText('click CA'));

    expect(screen.getByTestId('visited').textContent).toBe(JSON.stringify({ CA: true }));

    await waitFor(() =>
      expect(screen.getByTestId('visited').textContent).toBe(JSON.stringify({}))
    );

    expect(screen.getByTestId('pending').textContent).toBe(JSON.stringify({}));
    expect(screen.getByTestId('toastError').textContent).not.toBe(JSON.stringify(null));
  });

  it('toggles locally and never calls the API when unauthenticated', async () => {
    const apiClient = { saveVisitedState: jest.fn() };
    render(<Harness apiClient={apiClient} />);

    fireEvent.click(screen.getByText('click CA'));

    expect(screen.getByTestId('visited').textContent).toBe(JSON.stringify({ CA: true }));

    await waitFor(() =>
      expect(screen.getByTestId('pending').textContent).toBe(JSON.stringify({}))
    );

    expect(apiClient.saveVisitedState).not.toHaveBeenCalled();
    expect(screen.getByTestId('visited').textContent).toBe(JSON.stringify({ CA: true }));
  });

  it('ignores repeated clicks while a request for that stateId is pending', async () => {
    let resolveSave;
    const apiClient = {
      saveVisitedState: jest.fn(
        () =>
          new Promise((resolve) => {
            resolveSave = resolve;
          })
      ),
    };
    render(<Harness apiClient={apiClient} />);

    fireEvent.click(screen.getByText('sign in'));
    fireEvent.click(screen.getByText('click CA'));
    fireEvent.click(screen.getByText('click CA'));
    fireEvent.click(screen.getByText('click CA'));

    expect(apiClient.saveVisitedState).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave(undefined);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByTestId('pending').textContent).toBe(JSON.stringify({}))
    );
  });

  // Bugfix regression test (Requirement 15.2): this hook must read the
  // *current* Selected_Place_Category itself -- not a hardcoded
  // 'us-state' -- so saves under any other category send the correct
  // placeCategory/placeType, and update that category's own slice of the
  // per-category stores rather than 'us-state''s.
  it('uses the current (non-us-state) Selected_Place_Category for the save call and for the store slice it reads/writes', async () => {
    const apiClient = { saveVisitedState: jest.fn().mockResolvedValue(undefined) };

    function CategorySetter() {
      const [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
      React.useEffect(() => {
        setSelectedPlaceCategory('canada-state');
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }
    render(<CategorySetter />);

    render(<Harness apiClient={apiClient} category="canada-state" />);

    fireEvent.click(screen.getByText('sign in'));
    fireEvent.click(screen.getByText('click CA'));

    // Optimistic update applied to the 'canada-state' slice.
    expect(screen.getByTestId('visited').textContent).toBe(JSON.stringify({ CA: true }));
    expect(screen.getByTestId('pending').textContent).toBe(JSON.stringify({ CA: true }));

    await waitFor(() =>
      expect(screen.getByTestId('pending').textContent).toBe(JSON.stringify({}))
    );

    expect(screen.getByTestId('visited').textContent).toBe(JSON.stringify({ CA: true }));
    expect(apiClient.saveVisitedState).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'tok' }),
      'canada-state',
      'CA',
      true
    );

    // The 'us-state' slice must remain untouched by a 'canada-state' save.
    function UsStateReader() {
      const [visitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
      const [pendingPlaceIds] = usePendingPlaceIds();
      return (
        <span data-testid="us-state-visited">
          {JSON.stringify(visitedPlaceIdsByCategory['us-state'])}
          {JSON.stringify(pendingPlaceIds['us-state'])}
        </span>
      );
    }
    render(<UsStateReader />);
    expect(screen.getByTestId('us-state-visited').textContent).toBe(
      JSON.stringify({}) + JSON.stringify({})
    );
  });

  // Bugfix regression tests: this hook must keep useVisitedPlacesLoader's
  // per-category cache (updateVisitedPlacesCache) in sync with the settled
  // (authoritative) result on BOTH the success path and the
  // reverted-failure path, so a later switch away from and back to this
  // category never causes useVisitedPlacesLoader to reapply stale
  // pre-save data over the shared store (see useVisitedPlacesLoader.js's
  // updateVisitedPlacesCache doc comment for the full bug).
  it('calls updateVisitedPlacesCache with the correct category and final map once a successful save settles', async () => {
    const apiClient = { saveVisitedState: jest.fn().mockResolvedValue(undefined) };
    render(<Harness apiClient={apiClient} category="canada-state" />);

    function CategorySetter() {
      const [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
      React.useEffect(() => {
        setSelectedPlaceCategory('canada-state');
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }
    render(<CategorySetter />);

    fireEvent.click(screen.getByText('sign in'));

    // Not called yet from the optimistic (pre-settle) update.
    fireEvent.click(screen.getByText('click CA'));
    expect(updateVisitedPlacesCache).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.getByTestId('pending').textContent).toBe(JSON.stringify({}))
    );

    expect(updateVisitedPlacesCache).toHaveBeenCalledTimes(1);
    expect(updateVisitedPlacesCache).toHaveBeenCalledWith('canada-state', { CA: true });
  });

  it('calls updateVisitedPlacesCache with the reverted map once a failed save settles', async () => {
    const apiClient = { saveVisitedState: jest.fn().mockRejectedValue({ kind: 'FAILURE' }) };
    render(<Harness apiClient={apiClient} />);

    fireEvent.click(screen.getByText('sign in'));
    fireEvent.click(screen.getByText('click CA'));

    expect(updateVisitedPlacesCache).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.getByTestId('visited').textContent).toBe(JSON.stringify({}))
    );

    expect(updateVisitedPlacesCache).toHaveBeenCalledTimes(1);
    expect(updateVisitedPlacesCache).toHaveBeenCalledWith('us-state', {});
  });

  it(
    'end-to-end: a saved place under a non-default category is not lost when switching away and back (reproduces the stale-cache bug)',
    async () => {
      // Pre-populate useVisitedPlacesLoader's cache for 'canada-state' with
      // an empty (pre-save) result, matching the bug scenario: the category
      // was already loaded once before the user clicks a boundary.
      const loader = renderHook(() =>
        useVisitedPlacesLoader(
          { username: 'alice', accessToken: 'tok', expiresAt: Date.now() + 100000 },
          'canada-state-e2e-cache-bug'
        )
      );

      // Manually seed the cache the way a real load would (avoids needing
      // to mock the API client for this loader too).
      updateVisitedPlacesCache('canada-state-e2e-cache-bug', {});
      loader.unmount();

      const apiClient = { saveVisitedState: jest.fn().mockResolvedValue(undefined) };

      function CategorySetter() {
        const [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
        React.useEffect(() => {
          setSelectedPlaceCategory('canada-state-e2e-cache-bug');
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
        return null;
      }
      render(<CategorySetter />);
      render(<Harness apiClient={apiClient} category="canada-state-e2e-cache-bug" />);

      fireEvent.click(screen.getByText('sign in'));
      fireEvent.click(screen.getByText('click CA'));

      await waitFor(() =>
        expect(screen.getByTestId('pending').textContent).toBe(JSON.stringify({}))
      );
      expect(screen.getByTestId('visited').textContent).toBe(JSON.stringify({ CA: true }));

      // Simulate switching away to a different category and back: remount
      // useVisitedPlacesLoader for the same category, as MapView would do.
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy;

      const reMount = renderHook(() =>
        useVisitedPlacesLoader(
          { username: 'alice', accessToken: 'tok', expiresAt: Date.now() + 100000 },
          'canada-state-e2e-cache-bug'
        )
      );

      // The just-saved place must still be present -- NOT the stale
      // pre-save {} that was cached before the click -- and no new fetch
      // should have been issued (it's served straight from the
      // now-updated cache).
      expect(reMount.result.current.status).toBe('ready');
      expect(reMount.result.current.visitedPlaceIds).toEqual({ CA: true });
      expect(fetchSpy).not.toHaveBeenCalled();

      reMount.unmount();
      global.fetch = undefined;
    }
  );
});
