// Minimal smoke test for StateBoundaryOverlay (task 12.5). Comprehensive
// coverage (exact polygon count, color-update timing) is deferred to tasks
// 12.6/12.7 per tasks.md; this just confirms rendering, hit-testing wiring,
// and cleanup don't crash and behave as expected against a stubbed Maps API.

import React from 'react';
import fc from 'fast-check';
import { render, act, cleanup } from '@testing-library/react';

import {
  StateBoundaryOverlay,
  DEFAULT_STROKE_WEIGHT,
  HOVERED_STROKE_WEIGHT,
} from './StateBoundaryOverlay';
import {
  useInfoPanelPlaceId,
  useVisitedPlaceIdsByCategory,
  useSelectedPlaceCategory,
} from '../state/sharedState';
import { VISITED_FILL_COLOR, NOT_VISITED_FILL_COLOR } from './resolveFillColor';

const REGIONS = [
  {
    placeId: 'CA',
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
    placeId: 'NV',
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

  it('updates useInfoPanelPlaceId on mousemove hit and clears it on mouseout, on hover-capable devices', () => {
    setUpFakeGoogleMaps();
    const map = makeFakeMap();

    let infoPanelStateId;
    function Harness() {
      [infoPanelStateId] = useInfoPanelPlaceId();
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
      const [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
      React.useEffect(() => {
        setVisitedPlaceIdsByCategory((previous) => ({ ...previous, 'us-state': { CA: true } }));
      }, [setVisitedPlaceIdsByCategory]);
      return <StateBoundaryOverlay map={map} regions={REGIONS} />;
    }

    render(<Harness />);

    expect(polygons).toHaveLength(REGIONS.length);
    expect(polygons.some((polygon) => polygon.setOptions.mock.calls.length > 0)).toBe(true);
  });

  it("updates the affected region's fill color synchronously (well within 1 second) via setOptions, without recreating any polygon, when visitedStateIds changes", () => {
    // useVisitedPlaceIdsByCategory is shared state that persists across
    // tests in this file, so reset its 'us-state' slice to {} before this
    // test's own assertions.
    let resetSetVisitedPlaceIdsByCategory;
    function ResetHarness() {
      [, resetSetVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
      return null;
    }
    render(<ResetHarness />);
    act(() => {
      resetSetVisitedPlaceIdsByCategory({ 'us-state': {}, 'canada-state': {}, country: {} });
    });
    cleanup();

    const polygons = setUpFakeGoogleMaps();
    const map = makeFakeMap();

    let setVisitedPlaceIdsByCategory;
    function Harness() {
      [, setVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
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
      setVisitedPlaceIdsByCategory((previous) => ({ ...previous, 'us-state': { CA: true } }));
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

  it('thickens the hovered region border on mousemove and restores it on mouseout (Requirement 10.9)', () => {
    const polygons = setUpFakeGoogleMaps();
    const map = makeFakeMap();

    render(<StateBoundaryOverlay map={map} regions={REGIONS} />);

    const [caPolygon] = polygons;

    act(() => {
      map.trigger('mousemove', { latLng: { lat: 0, lng: 0 } });
    });
    expect(caPolygon.setOptions).toHaveBeenCalledWith({ strokeWeight: HOVERED_STROKE_WEIGHT });

    act(() => {
      map.trigger('mouseout', {});
    });
    expect(caPolygon.setOptions).toHaveBeenCalledWith({ strokeWeight: DEFAULT_STROKE_WEIGHT });
  });

  it('un-thickens the previous region and thickens the new region when the mouse moves directly between regions', () => {
    const polygons = setUpFakeGoogleMaps();
    const map = makeFakeMap();

    render(<StateBoundaryOverlay map={map} regions={REGIONS} />);

    const [caPolygon, nvPolygon] = polygons;

    act(() => {
      map.trigger('mousemove', { latLng: { lat: 0, lng: 0 } }); // hits CA
    });
    expect(caPolygon.setOptions).toHaveBeenCalledWith({ strokeWeight: HOVERED_STROKE_WEIGHT });

    caPolygon.setOptions.mockClear();
    nvPolygon.setOptions.mockClear();

    act(() => {
      map.trigger('mousemove', { latLng: { lat: 25, lng: 25 } }); // hits NV directly
    });

    expect(caPolygon.setOptions).toHaveBeenCalledWith({ strokeWeight: DEFAULT_STROKE_WEIGHT });
    expect(nvPolygon.setOptions).toHaveBeenCalledWith({ strokeWeight: HOVERED_STROKE_WEIGHT });
  });
});

describe('StateBoundaryOverlay - reads the visited-id slice for the Selected_Place_Category (task 29.1, Requirement 15.3)', () => {
  it("colors a region visited only when it is visited within the CURRENT Selected_Place_Category's slice, ignoring a different category's slice with the same placeId marked visited", () => {
    // Reset shared state (persists across tests in this file) so this
    // test starts from a known baseline.
    let resetSelectedPlaceCategory;
    let resetVisitedPlaceIdsByCategory;
    function ResetHarness() {
      [, resetSelectedPlaceCategory] = useSelectedPlaceCategory();
      [, resetVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
      return null;
    }
    render(<ResetHarness />);
    act(() => {
      resetSelectedPlaceCategory('us-state');
      // 'CA' marked visited under 'canada-state' only -- must NOT affect
      // the 'us-state' rendering below (Requirement 15.1/15.3).
      resetVisitedPlaceIdsByCategory({
        'us-state': {},
        'canada-state': { CA: true },
        country: {},
      });
    });
    cleanup();

    const polygons = setUpFakeGoogleMaps();
    const map = makeFakeMap();

    render(<StateBoundaryOverlay map={map} regions={REGIONS} />);

    const [caPolygon] = polygons;
    expect(caPolygon.options.fillColor).toBe(NOT_VISITED_FILL_COLOR);
  });

  it("re-colors using the newly Selected_Place_Category's slice when useSelectedPlaceCategory changes", () => {
    let resetSelectedPlaceCategory;
    let resetVisitedPlaceIdsByCategory;
    function ResetHarness() {
      [, resetSelectedPlaceCategory] = useSelectedPlaceCategory();
      [, resetVisitedPlaceIdsByCategory] = useVisitedPlaceIdsByCategory();
      return null;
    }
    render(<ResetHarness />);
    act(() => {
      resetSelectedPlaceCategory('us-state');
      resetVisitedPlaceIdsByCategory({
        'us-state': {},
        'canada-state': { CA: true },
        country: {},
      });
    });
    cleanup();

    const polygons = setUpFakeGoogleMaps();
    const map = makeFakeMap();

    let setSelectedPlaceCategory;
    function Harness() {
      [, setSelectedPlaceCategory] = useSelectedPlaceCategory();
      return <StateBoundaryOverlay map={map} regions={REGIONS} />;
    }

    render(<Harness />);

    const [caPolygon] = polygons;
    expect(caPolygon.options.fillColor).toBe(NOT_VISITED_FILL_COLOR);

    act(() => {
      setSelectedPlaceCategory('canada-state');
    });

    expect(caPolygon.setOptions).toHaveBeenCalledWith({ fillColor: VISITED_FILL_COLOR });
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
          [infoPanelStateId] = useInfoPanelPlaceId();
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

  it('never changes any polygon strokeWeight on mousemove/mouseout, on hover-incapable devices (Requirement 10.9)', () => {
    const polygons = setUpFakeGoogleMaps();
    const map = makeFakeMap();

    render(<StateBoundaryOverlay map={map} regions={REGIONS} />);

    act(() => {
      map.trigger('mousemove', { latLng: REGION_POINTS.CA });
      map.trigger('mousemove', { latLng: REGION_POINTS.NV });
      map.trigger('mouseout', {});
    });

    polygons.forEach((polygon) => {
      const strokeWeightCalls = polygon.setOptions.mock.calls.filter(
        ([options]) => Object.prototype.hasOwnProperty.call(options, 'strokeWeight')
      );
      expect(strokeWeightCalls).toHaveLength(0);
    });
  });
});
