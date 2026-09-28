import React from 'react';
import { render, screen } from '@testing-library/react';

import { PlaceInfoPanel } from './PlaceInfoPanel';
import {
  useSelectedPlaceCategory,
  useInfoPanelPlaceId,
  useVisitedPlaceIdsByCategory,
  usePendingPlaceIds,
} from '../state/sharedState';

// Unit test for the fixed (non-tooltip) positioning of the State_Info_Panel
// (task 15.7).
// Feature: state-visit-tracker, Requirements: 10.1
describe('PlaceInfoPanel - fixed (non-tooltip) positioning', () => {
  it('renders with a static position, not absolute/fixed/sticky as a cursor-following tooltip would', () => {
    render(<PlaceInfoPanel regions={[]} />);

    const panel = screen.getByTestId('state-info-panel');

    expect(panel).toHaveStyle({ position: 'static' });
    expect(panel.style.position).not.toBe('absolute');
    expect(panel.style.position).not.toBe('fixed');
    expect(panel.style.position).not.toBe('sticky');
  });

  it('does not set any top/left offsets tied to a cursor position', () => {
    render(<PlaceInfoPanel regions={[]} />);

    const panel = screen.getByTestId('state-info-panel');

    expect(panel.style.top).toBe('');
    expect(panel.style.left).toBe('');
  });

  it('renders identically regardless of mouse position, since there is no cursor-tracking logic', () => {
    const { unmount } = render(<PlaceInfoPanel regions={[]} />);
    const firstRenderStyle = screen.getByTestId('state-info-panel').getAttribute('style');
    unmount();

    // Simulate mouse movement before re-rendering; the component has no
    // cursor-position state, so this should have zero effect on its markup.
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 500 }));

    render(<PlaceInfoPanel regions={[]} />);
    const secondRenderStyle = screen.getByTestId('state-info-panel').getAttribute('style');

    expect(secondRenderStyle).toBe(firstRenderStyle);
  });

  it('renders the neutral placeholder when infoPanelPlaceId is null (sanity check)', () => {
    render(<PlaceInfoPanel regions={[]} />);

    expect(screen.getByTestId('state-info-panel-placeholder')).toBeInTheDocument();
  });
});

// Unit tests for the "saving..." indicator (a real, user-visible signal for
// the in-flight-save lifecycle already tracked internally by
// `usePendingPlaceIds`). Follows TopNav.test.js's `Setter` harness
// convention for driving shared-state hooks (which live at module scope,
// persisting across tests in this file) before rendering the component
// under test.
// Feature: state-visit-tracker, Requirements: 5.1, 5.2
describe('PlaceInfoPanel - "saving..." indicator', () => {
  const CA_REGION = { placeId: 'CA', name: 'California' };

  function Setter({ infoPanelPlaceId, visitedPlaceIds, pendingPlaceIds }) {
    const [, setInfoPanelPlaceId] = useInfoPanelPlaceId();
    const [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
    const [, setPendingPlaceIds] = usePendingPlaceIds();
    React.useEffect(() => {
      setInfoPanelPlaceId(infoPanelPlaceId);
      setVisitedPlaceIdsByCategory({ 'us-state': visitedPlaceIds, 'canada-state': {}, country: {} });
      setPendingPlaceIds({ 'us-state': pendingPlaceIds, 'canada-state': {}, country: {} });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  function setUpSharedState({ infoPanelPlaceId = null, visitedPlaceIds = {}, pendingPlaceIds = {} } = {}) {
    render(<Setter infoPanelPlaceId={infoPanelPlaceId} visitedPlaceIds={visitedPlaceIds} pendingPlaceIds={pendingPlaceIds} />);
  }

  it('renders when the targeted state\'s placeId is a key in pendingPlaceIds', () => {
    setUpSharedState({ infoPanelPlaceId: 'CA', pendingPlaceIds: { CA: true } });

    render(<PlaceInfoPanel regions={[CA_REGION]} />);

    expect(screen.getByTestId('state-info-panel-saving')).toBeInTheDocument();
    // Existing content rendering must be unaffected.
    expect(screen.getByTestId('state-info-panel-content')).toHaveTextContent('California \u2014 Not visited');
  });

  it('does not render when nothing is targeted (placeholder shown)', () => {
    setUpSharedState({ infoPanelPlaceId: null, pendingPlaceIds: { CA: true } });

    render(<PlaceInfoPanel regions={[CA_REGION]} />);

    expect(screen.getByTestId('state-info-panel-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('state-info-panel-saving')).not.toBeInTheDocument();
  });

  it('does not render when the targeted state is not pending (content shown, but not saving)', () => {
    setUpSharedState({ infoPanelPlaceId: 'CA', pendingPlaceIds: {} });

    render(<PlaceInfoPanel regions={[CA_REGION]} />);

    expect(screen.getByTestId('state-info-panel-content')).toBeInTheDocument();
    expect(screen.queryByTestId('state-info-panel-saving')).not.toBeInTheDocument();
  });

  it('does not render when a DIFFERENT state (not the targeted one) is pending', () => {
    setUpSharedState({ infoPanelPlaceId: 'CA', pendingPlaceIds: { NY: true } });

    render(<PlaceInfoPanel regions={[CA_REGION]} />);

    expect(screen.getByTestId('state-info-panel-content')).toBeInTheDocument();
    expect(screen.queryByTestId('state-info-panel-saving')).not.toBeInTheDocument();
  });
});

// Unit test for reading `useSelectedPlaceCategory` and scoping both
// `visitedPlaceIds` and the pending-ids lookup to it (task 30.1), mirroring
// PlaceVisitStatusLists.test.js's own category-scoping test (task 21.8).
// Feature: state-visit-tracker, Requirements: 15.4
describe('PlaceInfoPanel - Selected_Place_Category scoping', () => {
  afterEach(() => {
    // Reset useSelectedPlaceCategory back to its default between tests,
    // since it lives at module scope and persists across tests in this
    // file (same convention as the other Setter harnesses in this file).
    function ResetSetter() {
      const [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
      const [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
      const [, setPendingPlaceIds] = usePendingPlaceIds();
      const [, setInfoPanelPlaceId] = useInfoPanelPlaceId();
      React.useEffect(() => {
        setSelectedPlaceCategory('us-state');
        setVisitedPlaceIdsByCategory({ 'us-state': {}, 'canada-state': {}, country: {} });
        setPendingPlaceIds({ 'us-state': {}, 'canada-state': {}, country: {} });
        setInfoPanelPlaceId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }
    render(<ResetSetter />);
  });

  const SHARED_PLACE_ID = 'CA';
  const US_REGION = { placeId: SHARED_PLACE_ID, name: 'California' };
  const CANADA_REGION = { placeId: SHARED_PLACE_ID, name: 'Alberta' };

  function FullSetter({ selectedPlaceCategory, visitedPlaceIdsByCategory, pendingPlaceIdsByCategory }) {
    const [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
    const [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
    const [, setPendingPlaceIds] = usePendingPlaceIds();
    const [, setInfoPanelPlaceId] = useInfoPanelPlaceId();
    React.useEffect(() => {
      setVisitedPlaceIdsByCategory(visitedPlaceIdsByCategory);
      setPendingPlaceIds(pendingPlaceIdsByCategory);
      setInfoPanelPlaceId(SHARED_PLACE_ID);
      setSelectedPlaceCategory(selectedPlaceCategory);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  it('reflects the currently selected category\'s visited/saving slice, not always the us-state slice', () => {
    // 'us-state' slice: CA not visited, not pending.
    // 'canada-state' slice: CA (here standing in for Alberta) visited AND
    // pending, targeted by the same shared placeId. Selecting
    // 'canada-state' must show the canada-state region's name, "Visited",
    // and the saving indicator. `regions` is scoped to just the
    // canada-state region, matching how MapView only ever passes the
    // Selected_Place_Category's own boundary list.
    render(
      <FullSetter
        selectedPlaceCategory="canada-state"
        visitedPlaceIdsByCategory={{ 'us-state': {}, 'canada-state': { [SHARED_PLACE_ID]: true }, country: {} }}
        pendingPlaceIdsByCategory={{ 'us-state': {}, 'canada-state': { [SHARED_PLACE_ID]: true }, country: {} }}
      />
    );

    render(<PlaceInfoPanel regions={[CANADA_REGION]} />);

    expect(screen.getByTestId('state-info-panel-content')).toHaveTextContent('Alberta \u2014 Visited');
    expect(screen.getByTestId('state-info-panel-saving')).toBeInTheDocument();
  });

  it('switches back to reflecting the us-state slice when the category is switched back', () => {
    function SwitchBackSetter() {
      const [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
      React.useEffect(() => {
        setSelectedPlaceCategory('us-state');
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }

    // Same shared-state setup as above: 'us-state' slice has CA neither
    // visited nor pending, while 'canada-state' has it both.
    render(
      <FullSetter
        selectedPlaceCategory="canada-state"
        visitedPlaceIdsByCategory={{ 'us-state': {}, 'canada-state': { [SHARED_PLACE_ID]: true }, country: {} }}
        pendingPlaceIdsByCategory={{ 'us-state': {}, 'canada-state': { [SHARED_PLACE_ID]: true }, country: {} }}
      />
    );
    render(<SwitchBackSetter />);

    // Once switched back to 'us-state', MapView would pass the us-state
    // region list instead -- simulated here by passing US_REGION.
    render(<PlaceInfoPanel regions={[US_REGION]} />);

    expect(screen.getByTestId('state-info-panel-content')).toHaveTextContent('California \u2014 Not visited');
    expect(screen.queryByTestId('state-info-panel-saving')).not.toBeInTheDocument();
  });
});
