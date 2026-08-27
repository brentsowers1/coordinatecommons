// Minimal smoke test for StateBoundaryOverlay (task 12.5). Comprehensive
// coverage (exact polygon count, color-update timing) is deferred to tasks
// 12.6/12.7 per tasks.md; this just confirms rendering, hit-testing wiring,
// and cleanup don't crash and behave as expected against a stubbed Maps API.

import React from 'react';
import fc from 'fast-check';
import { render, act, cleanup } from '@testing-library/react';

import { StateBoundaryOverlay } from './StateBoundaryOverlay';
import { useInfoPanelStateId, useVisitedStateIds } from '../state/sharedState';
import { VISITED_FILL_COLOR, NOT_VISITED_FILL_COLOR } from './resolveFillColor';

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

describe('StateBoundaryOverlay - smoke test', () => {
  it('constructs one polygon per region and registers exactly one click/mousemove/mouseout listener', () => {
    const polygons = setUpFakeGoogleMaps();
    const map = makeFakeMap();

    render(<StateBoundaryOverlay map={map} regions={REGIONS} />);

    expect(polygons).toHaveLength(REGIONS.length);
    expect(map.addListener).toHaveBeenCalledTimes(3);
    const registeredEvents = map.addListener.mock.calls.map(([eventName]) => eventName);
    expect(registeredEvents).toEqual(
      expect.arrayContaining(['click', 'mousemove', 'mouseout'])
    );
  });

  it('does not construct polygons or register listeners when window.google.maps is unavailable', () => {
    const map = makeFakeMap();

    expect(() => render(<StateBoundaryOverlay map={map} regions={REGIONS} />)).not.toThrow();
    expect(map.addListener).not.toHaveBeenCalled();
  });

  it('updates useInfoPanelStateId on mousemove hit and clears it on mouseout, on hover-capable devices', () => {
    setUpFakeGoogleMaps();
    const map = makeFakeMap();

    let infoPanelStateId;
    function Harness() {
      [infoPanelStateId] = useInfoPanelStateId();
      return <StateBoundaryOverlay map={map} regions={REGIONS} />;
    }

    render(<Harness />);

    act(() => {
      map.trigger('mousemove', { latLng: { lat: 0, lng: 0 } });
    });
    expect(infoPanelStateId).toBe('CA');

    act(() => {
      map.trigger('mouseout', {});
    });
    expect(infoPanelStateId).toBeNull();
  });

  it('invokes onStateBoundaryClick with the hit stateId, and does nothing when no region is hit', () => {
    setUpFakeGoogleMaps();
    const map = makeFakeMap();
    const onStateBoundaryClick = jest.fn();

    render(
      <StateBoundaryOverlay map={map} regions={REGIONS} onStateBoundaryClick={onStateBoundaryClick} />
    );

    act(() => {
      map.trigger('click', { latLng: { lat: 0, lng: 0 } });
    });
    expect(onStateBoundaryClick).toHaveBeenCalledWith('CA');

    onStateBoundaryClick.mockClear();
    act(() => {
      map.trigger('click', { latLng: { lat: 100, lng: 100 } });
    });
    expect(onStateBoundaryClick).not.toHaveBeenCalled();
  });

  it('updates polygon fill colors when visitedStateIds changes, without recreating polygons', () => {
    const polygons = setUpFakeGoogleMaps();
    const map = makeFakeMap();

    function Harness() {
      const [, setVisitedStateIds] = useVisitedStateIds();
      React.useEffect(() => {
        setVisitedStateIds({ CA: true });
      }, [setVisitedStateIds]);
      return <StateBoundaryOverlay map={map} regions={REGIONS} />;
    }

    render(<Harness />);

    expect(polygons).toHaveLength(REGIONS.length);
    expect(polygons.some((polygon) => polygon.setOptions.mock.calls.length > 0)).toBe(true);
  });

  it("updates the affected region's fill color synchronously (well within 1 second) via setOptions, without recreating any polygon, when visitedStateIds changes", () => {
    // useVisitedStateIds is shared state that persists across tests in
    // this file, so reset it to {} before this test's own assertions.
    let resetSetVisitedStateIds;
    function ResetHarness() {
      [, resetSetVisitedStateIds] = useVisitedStateIds();
      return null;
    }
    render(<ResetHarness />);
    act(() => {
      resetSetVisitedStateIds({});
    });
    cleanup();

    const polygons = setUpFakeGoogleMaps();
    const map = makeFakeMap();

    let setVisitedStateIds;
    function Harness() {
      [, setVisitedStateIds] = useVisitedStateIds();
      return <StateBoundaryOverlay map={map} regions={REGIONS} />;
    }

    render(<Harness />);

    // Immediately after initial construction, nothing is visited yet.
    const [caPolygon, nvPolygon] = polygons;
    expect(caPolygon.options.fillColor).toBe(NOT_VISITED_FILL_COLOR);
    expect(nvPolygon.options.fillColor).toBe(NOT_VISITED_FILL_COLOR);

    const constructedCountBeforeUpdate = window.google.maps.Polygon.mock.calls.length;

    // Trigger a visitedStateIds change and assert the color update is
    // observable synchronously within the same act() block -- no
    // waitFor/timers needed, demonstrating the update happens well within
    // the 1-second bound of Requirement 6.2.
    act(() => {
      setVisitedStateIds({ CA: true });
    });

    expect(caPolygon.setOptions).toHaveBeenCalledWith({ fillColor: VISITED_FILL_COLOR });

    // No polygon recreation: the constructor's call count is unchanged,
    // confirming the update went through setOptions, not a
    // page-reload-style rebuild.
    expect(window.google.maps.Polygon.mock.calls.length).toBe(constructedCountBeforeUpdate);
    expect(window.google.maps.Polygon.mock.calls.length).toBe(REGIONS.length);

    // The unaffected region's color is untouched: setOptions was never
    // called with a different fillColor for it.
    const nvFillColorCalls = nvPolygon.setOptions.mock.calls
      .map(([options]) => options.fillColor)
      .filter((fillColor) => fillColor !== NOT_VISITED_FILL_COLOR);
    expect(nvFillColorCalls).toHaveLength(0);
  });
});

describe('StateBoundaryOverlay - Property 21 (touch-only devices)', () => {
  // Fixture points known (from the REGIONS fixture above) to fall inside
  // each region's polygon.
  const REGION_POINTS = {
    CA: { lat: 0, lng: 0 },
    NV: { lat: 25, lng: 25 },
  };

  beforeEach(() => {
    // Simulates a touch-only device: useIsHoverCapable() reads
    // window.matchMedia('(hover: hover) and (pointer: fine)').matches.
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
  });

  afterEach(() => {
    delete window.matchMedia;
  });

  // Feature: state-visit-tracker, Property 21: On hover-incapable devices, the info panel always reflects the most recent click
  it('always reflects the last clicked stateId in the sequence, regardless of interleaved hover-like events', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('CA', 'NV'), { minLength: 1 }), (clickSequence) => {
        setUpFakeGoogleMaps();
        const map = makeFakeMap();

        let infoPanelStateId;
        function Harness() {
          [infoPanelStateId] = useInfoPanelStateId();
          return <StateBoundaryOverlay map={map} regions={REGIONS} />;
        }

        render(<Harness />);

        act(() => {
          clickSequence.forEach((stateId) => {
            map.trigger('click', { latLng: REGION_POINTS[stateId] });
            // Interleaved hover-like events: on a touch-only device these
            // must be no-ops (StateBoundaryOverlay's handleMouseMove /
            // handleMouseOut both bail out when isHoverCapable is false),
            // so they must never change infoPanelStateId away from what
            // the most recent click set it to.
            const otherStateId = stateId === 'CA' ? 'NV' : 'CA';
            map.trigger('mousemove', { latLng: REGION_POINTS[otherStateId] });
            map.trigger('mouseout', {});
          });
        });

        expect(infoPanelStateId).toBe(clickSequence[clickSequence.length - 1]);

        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});
