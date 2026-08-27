import { render, screen, fireEvent } from '@testing-library/react';
import {
  useSession,
  useVisitedStateIds,
  useInfoPanelStateId,
  usePendingStateIds,
  useToastError,
} from './sharedState';

/**
 * Generic test component that renders the current value of a shared state
 * hook (JSON-stringified) and a button to set it to a provided next value.
 */
function makeHarness(useHook, nextValue) {
  return function Harness() {
    const [value, setValue] = useHook();
    return (
      <div>
        <span data-testid="value">{JSON.stringify(value)}</span>
        <button onClick={() => setValue(nextValue)}>set</button>
      </div>
    );
  };
}

describe('sharedState hooks', () => {
  test('useSession can be read and set', () => {
    const Harness = makeHarness(useSession, { username: 'alice', accessToken: 'token', expiresAt: 123 });
    render(<Harness />);
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify(null));
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value').textContent).toBe(
      JSON.stringify({ username: 'alice', accessToken: 'token', expiresAt: 123 })
    );
  });

  test('useVisitedStateIds can be read and set', () => {
    const Harness = makeHarness(useVisitedStateIds, { CA: true });
    render(<Harness />);
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify({}));
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify({ CA: true }));
  });

  test('useInfoPanelStateId can be read and set', () => {
    const Harness = makeHarness(useInfoPanelStateId, 'CA');
    render(<Harness />);
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify(null));
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify('CA'));
  });

  test('usePendingStateIds can be read and set', () => {
    const Harness = makeHarness(usePendingStateIds, { CA: true });
    render(<Harness />);
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify({}));
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify({ CA: true }));
  });

  test('useToastError can be read and set', () => {
    const Harness = makeHarness(useToastError, 'update did not save');
    render(<Harness />);
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify(null));
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify('update did not save'));
  });
});
