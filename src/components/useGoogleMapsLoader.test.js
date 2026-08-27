// Bugfix regression tests for useGoogleMapsLoader.js's script.onload
// bootstrap-readiness check.
//
// Background: with `loading=async` on the Maps JS API script URL,
// `script.onload` firing does not guarantee `window.google.maps
// .importLibrary` is attached in that exact synchronous tick -- it can
// land a handful of milliseconds later. The original code treated a
// false `isBootstrapLoaded()` check at that instant as a hard failure,
// which produced a silent "map failed to load" on a real first page load
// even though nothing had actually errored (confirmed by no console
// output). The fix polls briefly for `isBootstrapLoaded()` to become true
// before giving up.
//
// These tests use the same singleton-reset pattern as MapView.test.js
// (see the comment there for why): `useGoogleMapsLoader`'s state lives at
// module scope, so each test resets it via the hook's own public `retry()`
// API in `beforeEach`.

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';

import { useGoogleMapsLoader, GOOGLE_MAPS_SCRIPT_ID } from './useGoogleMapsLoader';

function Harness() {
  const { status } = useGoogleMapsLoader();
  return <div data-testid="status">{status}</div>;
}

function resetGoogleMapsLoaderSingleton() {
  function ResetHarness() {
    const { retry } = useGoogleMapsLoader();
    React.useEffect(() => {
      retry();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  const { unmount } = render(<ResetHarness />);
  unmount();
}

beforeEach(() => {
  resetGoogleMapsLoaderSingleton();
});

afterEach(() => {
  delete window.google;
  document.querySelectorAll(`#${GOOGLE_MAPS_SCRIPT_ID}`).forEach((scriptTag) => scriptTag.remove());
  jest.useRealTimers();
});

function getMapScriptTag() {
  const scriptTag = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
  expect(scriptTag).not.toBeNull();
  return scriptTag;
}

describe('useGoogleMapsLoader - script.onload bootstrap-readiness race', () => {
  it('reaches status "ready" when importLibrary attaches shortly after onload fires, instead of failing immediately', async () => {
    render(<Harness />);
    const scriptTag = getMapScriptTag();

    // window.google is NOT yet defined when onload fires -- this is the
    // race: the bootstrap stub hasn't landed on window.google.maps at the
    // exact instant onload fires, even though the script did load fine.
    expect(window.google).toBeUndefined();

    act(() => {
      scriptTag.onload();
    });

    // Must not have jumped straight to 'error' just because the bootstrap
    // wasn't attached on the very first synchronous check.
    expect(screen.getByTestId('status').textContent).toBe('loading');

    // Shortly after, the bootstrap actually lands (well within the loader's
    // polling window).
    setTimeout(() => {
      window.google = {
        maps: {
          importLibrary: jest.fn().mockResolvedValue({}),
        },
      };
    }, 20);

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
  });

  it('resolves immediately with no delay when importLibrary is already attached before onload fires', async () => {
    window.google = {
      maps: {
        importLibrary: jest.fn().mockResolvedValue({}),
      },
    };

    render(<Harness />);
    const scriptTag = getMapScriptTag();

    act(() => {
      scriptTag.onload();
    });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
  });

  it('falls back to status "error" if the bootstrap never attaches within the polling window (genuine failure)', async () => {
    jest.useFakeTimers();

    render(<Harness />);
    const scriptTag = getMapScriptTag();

    // window.google is never populated in this test -- a genuine failure,
    // not just a timing race.
    act(() => {
      scriptTag.onload();
    });

    expect(screen.getByTestId('status').textContent).toBe('loading');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });

    expect(screen.getByTestId('status').textContent).toBe('error');
  });
});
