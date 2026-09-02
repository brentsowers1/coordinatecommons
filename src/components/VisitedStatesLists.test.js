// Unit tests for VisitedStatesLists (Requirement 11). Follows
// TopNav.test.js's `Setter` harness convention for driving the
// `useVisitedStateIds` shared-state hook (which lives at module scope,
// persisting across tests in this file) before/after rendering the
// component under test.

import React from 'react';
import { render, screen } from '@testing-library/react';

import { VisitedStatesLists } from './VisitedStatesLists';
import { useVisitedStateIds } from '../state/sharedState';

const CA_REGION = { stateId: 'CA', name: 'California' };
const NY_REGION = { stateId: 'NY', name: 'New York' };
const REGIONS = [CA_REGION, NY_REGION];

function Setter({ visitedStateIds }) {
  const [, setVisitedStateIds] = useVisitedStateIds();
  React.useEffect(() => {
    setVisitedStateIds(visitedStateIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function setUpSharedState({ visitedStateIds = {} } = {}) {
  render(<Setter visitedStateIds={visitedStateIds} />);
}

describe('VisitedStatesLists', () => {
  it('renders both columns with the correct test-ids', () => {
    setUpSharedState({ visitedStateIds: { CA: true } });

    render(<VisitedStatesLists regions={REGIONS} />);

    expect(screen.getByTestId('visited-states-lists')).toBeInTheDocument();
    expect(screen.getByTestId('visited-states-list')).toBeInTheDocument();
    expect(screen.getByTestId('not-visited-states-list')).toBeInTheDocument();
  });

  it('places a region whose stateId is in visitedStateIds in the visited list and not the not-visited list', () => {
    setUpSharedState({ visitedStateIds: { CA: true } });

    render(<VisitedStatesLists regions={REGIONS} />);

    expect(screen.getByTestId('visited-state-item-CA')).toBeInTheDocument();
    expect(screen.queryByTestId('not-visited-state-item-CA')).not.toBeInTheDocument();
  });

  it('places a region whose stateId is NOT in visitedStateIds in the not-visited list and not the visited list', () => {
    setUpSharedState({ visitedStateIds: { CA: true } });

    render(<VisitedStatesLists regions={REGIONS} />);

    expect(screen.getByTestId('not-visited-state-item-NY')).toBeInTheDocument();
    expect(screen.queryByTestId('visited-state-item-NY')).not.toBeInTheDocument();
  });

  it('reflects a visitedStateIds change without needing a re-mount', () => {
    setUpSharedState({ visitedStateIds: {} });

    render(<VisitedStatesLists regions={REGIONS} />);

    expect(screen.queryByTestId('visited-state-item-NY')).not.toBeInTheDocument();
    expect(screen.getByTestId('not-visited-state-item-NY')).toBeInTheDocument();

    // Drive the shared-state hook again, simulating a click on the map
    // marking NY as visited, WITHOUT unmounting/remounting VisitedStatesLists.
    render(<Setter visitedStateIds={{ NY: true }} />);

    expect(screen.getByTestId('visited-state-item-NY')).toBeInTheDocument();
    expect(screen.queryByTestId('not-visited-state-item-NY')).not.toBeInTheDocument();
  });

  it('renders the empty-list placeholder when a column has zero entries', () => {
    setUpSharedState({ visitedStateIds: { CA: true, NY: true } });

    render(<VisitedStatesLists regions={REGIONS} />);

    // notVisited is empty: no <ul>, just the "None yet" placeholder.
    expect(screen.queryByTestId('not-visited-states-list')).not.toBeInTheDocument();
    expect(screen.getByText('None yet')).toBeInTheDocument();
  });
});
