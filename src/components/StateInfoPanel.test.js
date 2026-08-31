import React from 'react';
import { render, screen } from '@testing-library/react';

import { StateInfoPanel } from './StateInfoPanel';
import { useInfoPanelStateId, useVisitedStateIds, usePendingStateIds } from '../state/sharedState';

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

// Unit tests for the "saving..." indicator (a real, user-visible signal for
// the in-flight-save lifecycle already tracked internally by
// `usePendingStateIds`). Follows TopNav.test.js's `Setter` harness
// convention for driving shared-state hooks (which live at module scope,
// persisting across tests in this file) before rendering the component
// under test.
// Feature: state-visit-tracker, Requirements: 5.1, 5.2
describe('StateInfoPanel - "saving..." indicator', () => {
  const CA_REGION = { stateId: 'CA', name: 'California' };

  function Setter({ infoPanelStateId, visitedStateIds, pendingStateIds }) {
    const [, setInfoPanelStateId] = useInfoPanelStateId();
    const [, setVisitedStateIds] = useVisitedStateIds();
    const [, setPendingStateIds] = usePendingStateIds();
    React.useEffect(() => {
      setInfoPanelStateId(infoPanelStateId);
      setVisitedStateIds(visitedStateIds);
      setPendingStateIds(pendingStateIds);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  function setUpSharedState({ infoPanelStateId = null, visitedStateIds = {}, pendingStateIds = {} } = {}) {
    render(<Setter infoPanelStateId={infoPanelStateId} visitedStateIds={visitedStateIds} pendingStateIds={pendingStateIds} />);
  }

  it('renders when the targeted state\'s stateId is a key in pendingStateIds', () => {
    setUpSharedState({ infoPanelStateId: 'CA', pendingStateIds: { CA: true } });

    render(<StateInfoPanel regions={[CA_REGION]} />);

    expect(screen.getByTestId('state-info-panel-saving')).toBeInTheDocument();
    // Existing content rendering must be unaffected.
    expect(screen.getByTestId('state-info-panel-content')).toHaveTextContent('California \u2014 Not visited');
  });

  it('does not render when nothing is targeted (placeholder shown)', () => {
    setUpSharedState({ infoPanelStateId: null, pendingStateIds: { CA: true } });

    render(<StateInfoPanel regions={[CA_REGION]} />);

    expect(screen.getByTestId('state-info-panel-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('state-info-panel-saving')).not.toBeInTheDocument();
  });

  it('does not render when the targeted state is not pending (content shown, but not saving)', () => {
    setUpSharedState({ infoPanelStateId: 'CA', pendingStateIds: {} });

    render(<StateInfoPanel regions={[CA_REGION]} />);

    expect(screen.getByTestId('state-info-panel-content')).toBeInTheDocument();
    expect(screen.queryByTestId('state-info-panel-saving')).not.toBeInTheDocument();
  });

  it('does not render when a DIFFERENT state (not the targeted one) is pending', () => {
    setUpSharedState({ infoPanelStateId: 'CA', pendingStateIds: { NY: true } });

    render(<StateInfoPanel regions={[CA_REGION]} />);

    expect(screen.getByTestId('state-info-panel-content')).toBeInTheDocument();
    expect(screen.queryByTestId('state-info-panel-saving')).not.toBeInTheDocument();
  });
});
