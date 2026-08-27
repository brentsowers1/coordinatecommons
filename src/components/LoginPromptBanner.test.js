import React from 'react';
import { render, screen } from '@testing-library/react';

import { LoginPromptBanner } from './LoginPromptBanner';
import { useSession, useSignOutReason } from '../state/sharedState';

// Smoke tests for LoginPromptBanner (task 17.3).
// Feature: state-visit-tracker, Requirements: 9.2, 9.3, 2.4
describe('LoginPromptBanner', () => {
  function Setter({ session, signOutReason }) {
    const [, setSession] = useSession();
    const [, setSignOutReason] = useSignOutReason();
    React.useEffect(() => {
      setSession(session);
      setSignOutReason(signOutReason);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  it('renders nothing when there is a session', () => {
    render(<Setter session={{ username: 'a', accessToken: 't', expiresAt: Date.now() + 10000 }} signOutReason={null} />);
    render(<LoginPromptBanner />);

    expect(screen.queryByTestId('login-prompt-banner')).not.toBeInTheDocument();
  });

  it('renders the session-ended message when signOutReason is SESSION_ENDED', () => {
    render(<Setter session={null} signOutReason="SESSION_ENDED" />);
    render(<LoginPromptBanner />);

    expect(screen.getByTestId('login-prompt-banner')).toHaveTextContent('Your session ended');
  });

  it('renders the neutral message when signOutReason is LOGOUT', () => {
    render(<Setter session={null} signOutReason="LOGOUT" />);
    render(<LoginPromptBanner />);

    expect(screen.getByTestId('login-prompt-banner')).toHaveTextContent(
      'Sign in to save your visited states across sessions.'
    );
  });

  it('renders the neutral message when signOutReason is null (never signed in)', () => {
    render(<Setter session={null} signOutReason={null} />);
    render(<LoginPromptBanner />);

    expect(screen.getByTestId('login-prompt-banner')).toHaveTextContent(
      'Sign in to save your visited states across sessions.'
    );
  });
});
