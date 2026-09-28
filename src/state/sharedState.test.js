import { render, screen, fireEvent } from '@testing-library/react';
import {
  useSession,
  useSelectedPlaceCategory,
  useVisitedPlaceIdsByCategory,
  useInfoPanelPlaceId,
  usePendingPlaceIds,
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

  test('useSelectedPlaceCategory defaults to us-state and can be set', () => {
    const Harness = makeHarness(useSelectedPlaceCategory, 'canada-state');
    render(<Harness />);
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify('us-state'));
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify('canada-state'));
  });

  test('useVisitedPlaceIdsByCategory can be read and set', () => {
    const Harness = makeHarness(useVisitedPlaceIdsByCategory, {
      'us-state': { CA: true },
      'canada-state': {},
      country: {},
    });
    render(<Harness />);
    expect(screen.getByTestId('value').textContent).toBe(
      JSON.stringify({ 'us-state': {}, 'canada-state': {}, country: {} })
    );
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value').textContent).toBe(
      JSON.stringify({ 'us-state': { CA: true }, 'canada-state': {}, country: {} })
    );
  });

  test('useInfoPanelPlaceId can be read and set', () => {
    const Harness = makeHarness(useInfoPanelPlaceId, 'CA');
    render(<Harness />);
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify(null));
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify('CA'));
  });

  test('usePendingPlaceIds can be read and set', () => {
    const Harness = makeHarness(usePendingPlaceIds, {
      'us-state': { CA: true },
      'canada-state': {},
      country: {},
    });
    render(<Harness />);
    expect(screen.getByTestId('value').textContent).toBe(
      JSON.stringify({ 'us-state': {}, 'canada-state': {}, country: {} })
    );
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value').textContent).toBe(
      JSON.stringify({ 'us-state': { CA: true }, 'canada-state': {}, country: {} })
    );
  });

  test('useToastError can be read and set', () => {
    const Harness = makeHarness(useToastError, 'update did not save');
    render(<Harness />);
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify(null));
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value').textContent).toBe(JSON.stringify('update did not save'));
  });
});
