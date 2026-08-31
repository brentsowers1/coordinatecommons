// Smoke tests for MapPage (task 19.1).
//
// MapView pulls in the real Google Maps script loader / region loader /
// fetch, which is heavier than this component-composition test needs, so
// MapView and LoginPromptBanner are mocked here -- this test only verifies
// MapPage renders both of its children per design.md's Component Tree
// (`MapPage --> MapView`, `MapPage --> LoginPromptBanner`). Login/logout
// navigation now lives in `TopNav` (rendered by `AuthGate`), not `MapPage`,
// so that behavior is covered by TopNav.test.js/AuthGate.test.js instead.

import { render, screen } from '@testing-library/react';

jest.mock('./MapView', () => ({
  MapView: () => <div data-testid="mock-map-view" />,
}));
jest.mock('./LoginPromptBanner', () => ({
  LoginPromptBanner: () => <div data-testid="mock-login-prompt-banner" />,
}));

import { MapPage } from './MapPage';

describe('MapPage', () => {
  it('renders both MapView and LoginPromptBanner unconditionally', () => {
    render(<MapPage />);

    expect(screen.getByTestId('mock-map-view')).toBeInTheDocument();
    expect(screen.getByTestId('mock-login-prompt-banner')).toBeInTheDocument();
  });
});
