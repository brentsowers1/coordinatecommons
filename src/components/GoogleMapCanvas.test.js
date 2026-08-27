import { render } from '@testing-library/react';

import { GoogleMapCanvas, INITIAL_MAP_CENTER, INITIAL_MAP_ZOOM } from './GoogleMapCanvas';

// Feature: state-visit-tracker, Task 12.4: fixed initial viewport (Requirement 3.1)
describe('GoogleMapCanvas - fixed initial viewport', () => {
  afterEach(() => {
    delete window.google;
  });

  test('constructs the map exactly once with the fixed INITIAL_MAP_CENTER/INITIAL_MAP_ZOOM, and calls onMapReady with the instance', () => {
    const mapConstructor = jest.fn().mockImplementation(function Map(element, options) {
      this.element = element;
      this.options = options;
    });

    window.google = {
      maps: {
        Map: mapConstructor,
      },
    };

    const onMapReadyMock = jest.fn();

    render(<GoogleMapCanvas onMapReady={onMapReadyMock} />);

    expect(mapConstructor).toHaveBeenCalledTimes(1);

    const [, options] = mapConstructor.mock.calls[0];
    expect(options.center).toEqual(INITIAL_MAP_CENTER);
    expect(options.zoom).toBe(INITIAL_MAP_ZOOM);

    expect(onMapReadyMock).toHaveBeenCalledTimes(1);
    const constructedInstance = mapConstructor.mock.instances[0];
    expect(onMapReadyMock).toHaveBeenCalledWith(constructedInstance);
  });

  // Documentation-level sanity check rather than real Mercator math: at a
  // low zoom level, a center near the continental US latitude/longitude
  // range keeps Alaska and Hawaii within the initial viewport (Requirement
  // 3.1) without requiring the user to pan or zoom.
  test('INITIAL_MAP_CENTER/INITIAL_MAP_ZOOM are reasonable values for a viewport including Alaska and Hawaii', () => {
    expect(INITIAL_MAP_CENTER.lat).toBeGreaterThanOrEqual(30);
    expect(INITIAL_MAP_CENTER.lat).toBeLessThanOrEqual(50);
    expect(INITIAL_MAP_CENTER.lng).toBeGreaterThanOrEqual(-120);
    expect(INITIAL_MAP_CENTER.lng).toBeLessThanOrEqual(-80);

    expect(INITIAL_MAP_ZOOM).toBeGreaterThanOrEqual(2);
    expect(INITIAL_MAP_ZOOM).toBeLessThanOrEqual(4);
  });
});
