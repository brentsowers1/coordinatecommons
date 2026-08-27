// Smoke tests for MapPage (task 19.1).
//
// MapView pulls in the real Google Maps script loader / region loader /
// fetch, which is heavier than this component-composition test needs, so
// MapView and LoginPromptBanner are mocked here -- this test only verifies
// MapPage renders both of its children per design.md's Component Tree
// (`MapPage --> MapView`, `MapPage --> LoginPromptBanner`) and wires the
// login control correctly (Requirement 1.1/1.2).

import { render, screen, fireEvent } from '@testing-library/react';

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

  it('shows the login control by default and calls onRequestLogin when clicked', () => {
    const onRequestLogin = jest.fn();
    render(<MapPage onRequestLogin={onRequestLogin} />);

    const control = screen.getByTestId('login-control');
    expect(control).toBeInTheDocument();
    fireEvent.click(control);

    expect(onRequestLogin).toHaveBeenCalledTimes(1);
  });

  it('hides the login control when showLoginControl is false', () => {
    render(<MapPage showLoginControl={false} />);

    expect(screen.queryByTestId('login-control')).not.toBeInTheDocument();
  });
});
