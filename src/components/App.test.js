// Smoke test for App (task 19.2).
//
// AuthGate is mocked so this test only confirms App renders it -- AuthGate's
// own behavior is already covered by AuthGate.test.js.

import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('./AuthGate', () => ({
  AuthGate: () => <div data-testid="mock-auth-gate" />,
}));

import { App } from './App';

describe('App', () => {
  it('renders AuthGate', () => {
    render(<App />);

    expect(screen.getByTestId('mock-auth-gate')).toBeInTheDocument();
  });
});
