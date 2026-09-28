// Unit tests for PlaceVisitStatusLists (Requirement 11). Follows
// TopNav.test.js's `Setter` harness convention for driving the
// `useVisitedPlaceIdsByCategory`/`useSelectedPlaceCategory` shared-state
// hooks (which live at module scope, persisting across tests in this file)
// before/after rendering the component under test.

import React from 'react';
import { render, screen } from '@testing-library/react';

import { PlaceVisitStatusLists } from './PlaceVisitStatusLists';
import { useVisitedPlaceIdsByCategory, useSelectedPlaceCategory } from '../state/sharedState';

const CA_REGION = { placeId: 'CA', name: 'California' };
const NY_REGION = { placeId: 'NY', name: 'New York' };
const REGIONS = [CA_REGION, NY_REGION];

function Setter({ visitedStateIds, selectedPlaceCategory }) {
  const [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
  const [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
  React.useEffect(() => {
    setVisitedPlaceIdsByCategory({ 'us-state': visitedStateIds, 'canada-state': {}, country: {} });
    if (selectedPlaceCategory != null) {
      setSelectedPlaceCategory(selectedPlaceCategory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function setUpSharedState({ visitedStateIds = {}, selectedPlaceCategory } = {}) {
  render(<Setter visitedStateIds={visitedStateIds} selectedPlaceCategory={selectedPlaceCategory} />);
}

describe('PlaceVisitStatusLists', () => {
  afterEach(() => {
    // Reset useSelectedPlaceCategory back to its default between tests,
    // since it lives at module scope and persists across tests in this
    // file (same convention as the Setter harness for the other hooks).
    setUpSharedState({ visitedStateIds: {}, selectedPlaceCategory: 'us-state' });
  });

  it('renders both columns with the correct test-ids', () => {
    setUpSharedState({ visitedStateIds: { CA: true } });

    render(<PlaceVisitStatusLists regions={REGIONS} />);

    expect(screen.getByTestId('visited-states-lists')).toBeInTheDocument();
    expect(screen.getByTestId('visited-states-list')).toBeInTheDocument();
    expect(screen.getByTestId('not-visited-states-list')).toBeInTheDocument();
  });

  it('places a region whose stateId is in visitedStateIds in the visited list and not the not-visited list', () => {
    setUpSharedState({ visitedStateIds: { CA: true } });

    render(<PlaceVisitStatusLists regions={REGIONS} />);

    expect(screen.getByTestId('visited-state-item-CA')).toBeInTheDocument();
    expect(screen.queryByTestId('not-visited-state-item-CA')).not.toBeInTheDocument();
  });

  it('places a region whose stateId is NOT in visitedStateIds in the not-visited list and not the visited list', () => {
    setUpSharedState({ visitedStateIds: { CA: true } });

    render(<PlaceVisitStatusLists regions={REGIONS} />);

    expect(screen.getByTestId('not-visited-state-item-NY')).toBeInTheDocument();
    expect(screen.queryByTestId('visited-state-item-NY')).not.toBeInTheDocument();
  });

  it('reflects a visitedStateIds change without needing a re-mount', () => {
    setUpSharedState({ visitedStateIds: {} });

    render(<PlaceVisitStatusLists regions={REGIONS} />);

    expect(screen.queryByTestId('visited-state-item-NY')).not.toBeInTheDocument();
    expect(screen.getByTestId('not-visited-state-item-NY')).toBeInTheDocument();

    // Drive the shared-state hook again, simulating a click on the map
    // marking NY as visited, WITHOUT unmounting/remounting PlaceVisitStatusLists.
    render(<Setter visitedStateIds={{ NY: true }} />);

    expect(screen.getByTestId('visited-state-item-NY')).toBeInTheDocument();
    expect(screen.queryByTestId('not-visited-state-item-NY')).not.toBeInTheDocument();
  });

  it('renders the empty-list placeholder when a column has zero entries', () => {
    setUpSharedState({ visitedStateIds: { CA: true, NY: true } });

    render(<PlaceVisitStatusLists regions={REGIONS} />);

    // notVisited is empty: no <ul>, just the "None yet" placeholder.
    expect(screen.queryByTestId('not-visited-states-list')).not.toBeInTheDocument();
    expect(screen.getByText('None yet')).toBeInTheDocument();
  });

  it('partitions using the Selected_Place_Category slice, not always the us-state slice', () => {
    // Populate the 'us-state' slice with CA visited, and the
    // 'canada-state' slice with NY -- reused here only as an arbitrary
    // placeId, not implying it's an actual Canadian province -- visited,
    // then select 'canada-state'. The component must partition using the
    // 'canada-state' slice (NY visited, CA not), proving it is not
    // hardcoded to 'us-state'.
    function FullSetter() {
      const [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
      const [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
      React.useEffect(() => {
        setVisitedPlaceIdsByCategory({
          'us-state': { CA: true },
          'canada-state': { NY: true },
          country: {},
        });
        setSelectedPlaceCategory('canada-state');
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }

    render(<FullSetter />);

    render(<PlaceVisitStatusLists regions={REGIONS} />);

    expect(screen.getByTestId('visited-state-item-NY')).toBeInTheDocument();
    expect(screen.queryByTestId('visited-state-item-CA')).not.toBeInTheDocument();
    expect(screen.getByTestId('not-visited-state-item-CA')).toBeInTheDocument();
  });
});
