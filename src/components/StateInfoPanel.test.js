import { render, screen } from '@testing-library/react';

import { StateInfoPanel } from './StateInfoPanel';

// Unit test for the fixed (non-tooltip) positioning of the State_Info_Panel
// (task 15.7).
// Feature: state-visit-tracker, Requirements: 10.1
describe('StateInfoPanel - fixed (non-tooltip) positioning', () => {
  it('renders with a static position, not absolute/fixed/sticky as a cursor-following tooltip would', () => {
    render(<StateInfoPanel regions={[]} />);

    const panel = screen.getByTestId('state-info-panel');

    expect(panel).toHaveStyle({ position: 'static' });
    expect(panel.style.position).not.toBe('absolute');
    expect(panel.style.position).not.toBe('fixed');
    expect(panel.style.position).not.toBe('sticky');
  });

  it('does not set any top/left offsets tied to a cursor position', () => {
    render(<StateInfoPanel regions={[]} />);

    const panel = screen.getByTestId('state-info-panel');

    expect(panel.style.top).toBe('');
    expect(panel.style.left).toBe('');
  });

  it('renders identically regardless of mouse position, since there is no cursor-tracking logic', () => {
    const { unmount } = render(<StateInfoPanel regions={[]} />);
    const firstRenderStyle = screen.getByTestId('state-info-panel').getAttribute('style');
    unmount();

    // Simulate mouse movement before re-rendering; the component has no
    // cursor-position state, so this should have zero effect on its markup.
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 500 }));

    render(<StateInfoPanel regions={[]} />);
    const secondRenderStyle = screen.getByTestId('state-info-panel').getAttribute('style');

    expect(secondRenderStyle).toBe(firstRenderStyle);
  });

  it('renders the neutral placeholder when infoPanelStateId is null (sanity check)', () => {
    render(<StateInfoPanel regions={[]} />);

    expect(screen.getByTestId('state-info-panel-placeholder')).toBeInTheDocument();
  });
});
