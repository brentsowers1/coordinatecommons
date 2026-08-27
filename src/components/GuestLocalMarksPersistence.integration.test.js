// Integration test (task 17.4): guest local marks persist across a
// re-render and never trigger a Visit_Record_API call.
//
// This spans the real wiring across three layers, rather than testing any
// one of them in isolation (which tasks 14.2-14.5 and
// useStateBoundaryClickHandler.test.js's own unit tests already cover):
//
//   StateBoundaryOverlay (map click -> resolveRegionAtLatLng -> onStateBoundaryClick)
//     -> useStateBoundaryClickHandler (real hook, wired to shared state)
//       -> handleStateBoundaryClick (pure toggle logic)
//         -> apiClient.saveVisitedState (spied; must NEVER be called for a guest)
//
// Requirement 9.1: a guest's marks persist in memory for the session.
// Requirement 9.4: an unauthenticated user's marks are never sent to the
// Visit_Record_API.
//
// Fixtures (REGIONS / makeFakeMap / setUpFakeGoogleMaps) are adapted from
// StateBoundaryOverlay.test.js; the reset-shared-state pattern is adapted
// from useStateBoundaryClickHandler.test.js's `resetSharedState()`.

import React from 'react';
import { render, act } from '@testing-library/react';

import { StateBoundaryOverlay } from './StateBoundaryOverlay';
import { useStateBoundaryClickHandler } from '../state/useStateBoundaryClickHandler';
import { useSession, useVisitedStateIds, usePendingStateIds, useToastError } from '../state/sharedState';

const REGIONS = [
  {
    stateId: 'CA',
    name: 'California',
    polygons: [
      [
        [-10, -10],
        [10, -10],
        [10, 10],
        [-10, 10],
      ],
    ],
  },
  {
    stateId: 'NV',
    name: 'Nevada',
    polygons: [
      [
        [20, 20],
        [30, 20],
        [30, 30],
        [20, 30],
      ],
    ],
  },
];

function makeFakeMap() {
  const listeners = {};
  return {
    addListener: jest.fn((eventName, handler) => {
      listeners[eventName] = handler;
      return { remove: jest.fn() };
    }),
    trigger(eventName, event) {
      listeners[eventName](event);
    },
  };
}

function makeFakePolygon() {
  return {
    setMap: jest.fn(),
    setOptions: jest.fn(),
  };
}

function setUpFakeGoogleMaps() {
  const polygons = [];
  window.google = {
    maps: {
      Polygon: jest.fn().mockImplementation(function Polygon(options) {
        Object.assign(this, makeFakePolygon());
        this.options = options;
        polygons.push(this);
      }),
    },
  };
  return polygons;
}

afterEach(() => {
  delete window.google;
});

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

// Sibling probe component reading the shared visited-state map, following
// the SessionProbe pattern used in LoginPage.test.js.
function VisitedStateIdsProbe() {
  const [visitedStateIds] = useVisitedStateIds();
  return <div data-testid="visited-state-ids-probe">{JSON.stringify(visitedStateIds)}</div>;
}

// Wires a REAL onStateBoundaryClick (built from the real
// useStateBoundaryClickHandler hook) into StateBoundaryOverlay -- the
// integration point under test.
function GuestMapHarness({ map, apiClient }) {
  const onStateBoundaryClick = useStateBoundaryClickHandler(apiClient);
  return (
    <>
      <StateBoundaryOverlay map={map} regions={REGIONS} onStateBoundaryClick={onStateBoundaryClick} />
      <VisitedStateIdsProbe />
    </>
  );
}

describe('Guest local marks persistence across a re-render (integration)', () => {
  it('keeps a mark made while unauthenticated in memory across a re-render, and never calls the Visit_Record_API', async () => {
    setUpFakeGoogleMaps();
    const map = makeFakeMap();
    const apiClient = { saveVisitedState: jest.fn() };

    const { rerender, getByTestId } = render(<GuestMapHarness map={map} apiClient={apiClient} />);

    // Guest/unauthenticated: no session was set (resetSharedState left it
    // null), and visitedStateIds starts empty.
    expect(getByTestId('visited-state-ids-probe').textContent).toBe(JSON.stringify({}));

    // Click a known region (CA) -- this goes through the real
    // StateBoundaryOverlay -> resolveRegionAtLatLng -> onStateBoundaryClick
    // (useStateBoundaryClickHandler) -> handleStateBoundaryClick chain.
    // handleStateBoundaryClick's settle() resolves asynchronously (even
    // for a guest, it's an async function), so flush that microtask
    // inside act() as well to avoid an act() warning from the resulting
    // setPendingStateIds call.
    await act(async () => {
      map.trigger('click', { latLng: { lat: 0, lng: 0 } });
      await Promise.resolve();
    });

    expect(getByTestId('visited-state-ids-probe').textContent).toBe(JSON.stringify({ CA: true }));

    // Re-render the component tree. Because useVisitedStateIds is shared
    // state (make-shared-state-hook's module-level state), not local
    // component state, the mark must survive this re-render.
    rerender(<GuestMapHarness map={map} apiClient={apiClient} />);

    expect(getByTestId('visited-state-ids-probe').textContent).toBe(JSON.stringify({ CA: true }));

    // Requirement 9.4: guest marks never hit the Visit_Record_API, before
    // or after the re-render.
    expect(apiClient.saveVisitedState).not.toHaveBeenCalled();
  });
});
