// Unit tests for useStateBoundaryClickHandler (task 14.6): the wiring
// between the pure `handleStateBoundaryClick` orchestration function and
// the Shared_State_Store (useSession/useVisitedStateIds/usePendingStateIds/
// useToastError). Properties 10-13 already cover handleStateBoundaryClick
// itself (tasks 14.2-14.5); these tests only cover that the wiring applies
// the optimistic update, then the settled result, and surfaces a toast
// error on revert (Requirements 5.3, 9.4).

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import { useStateBoundaryClickHandler } from './useStateBoundaryClickHandler';
import { useSession, useVisitedStateIds, usePendingStateIds, useToastError } from './sharedState';

function Harness({ apiClient }) {
  const onStateBoundaryClick = useStateBoundaryClickHandler(apiClient);
  const [session, setSession] = useSession();
  const [visitedStateIds] = useVisitedStateIds();
  const [pendingStateIds] = usePendingStateIds();
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
    const [, setVisitedStateIds] = useVisitedStateIds();
    const [, setPendingStateIds] = usePendingStateIds();
    const [, setToastError] = useToastError();
    React.useEffect(() => {
      setSession(null);
      setVisitedStateIds({});
      setPendingStateIds({});
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
});
