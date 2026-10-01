import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

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
      'Log in, or sign up for an account, to save your visited states'
    );
  });

  it('renders the neutral message when signOutReason is null (never signed in)', () => {
    render(<Setter session={null} signOutReason={null} />);
    render(<LoginPromptBanner />);

    expect(screen.getByTestId('login-prompt-banner')).toHaveTextContent(
      'Log in, or sign up for an account, to save your visited states'
    );
  });

  // Requirement 9.2: the neutral message's two navigation links.
  describe('neutral message navigation links (Requirement 9.2)', () => {
    it('renders both links with the expected visible text', () => {
      render(<Setter session={null} signOutReason={null} />);
      render(<LoginPromptBanner />);

      expect(screen.getByTestId('login-prompt-login-link')).toHaveTextContent('Log in');
      expect(screen.getByTestId('login-prompt-signup-link')).toHaveTextContent(
        'sign up for an account'
      );
    });

    it('calls onRequestLogin when the "Log in" link is clicked', () => {
      const onRequestLogin = jest.fn();
      render(<Setter session={null} signOutReason={null} />);
      render(<LoginPromptBanner onRequestLogin={onRequestLogin} />);

      fireEvent.click(screen.getByTestId('login-prompt-login-link'));

      expect(onRequestLogin).toHaveBeenCalledTimes(1);
    });

    it('calls onRequestSignUp when the "sign up for an account" link is clicked', () => {
      const onRequestSignUp = jest.fn();
      render(<Setter session={null} signOutReason={null} />);
      render(<LoginPromptBanner onRequestSignUp={onRequestSignUp} />);

      fireEvent.click(screen.getByTestId('login-prompt-signup-link'));

      expect(onRequestSignUp).toHaveBeenCalledTimes(1);
    });

    it('prevents the default anchor navigation on both links', () => {
      render(<Setter session={null} signOutReason={null} />);
      render(<LoginPromptBanner onRequestLogin={jest.fn()} onRequestSignUp={jest.fn()} />);

      // fireEvent returns false when preventDefault() was called on a
      // cancelable event -- the same check used for TopNav/LoginPage links.
      expect(fireEvent.click(screen.getByTestId('login-prompt-login-link'))).toBe(false);
      expect(fireEvent.click(screen.getByTestId('login-prompt-signup-link'))).toBe(false);
    });

    it('renders and tolerates clicks with both callbacks omitted (standalone use)', () => {
      render(<Setter session={null} signOutReason={null} />);
      render(<LoginPromptBanner />);

      expect(() => {
        fireEvent.click(screen.getByTestId('login-prompt-login-link'));
        fireEvent.click(screen.getByTestId('login-prompt-signup-link'));
      }).not.toThrow();

      expect(screen.getByTestId('login-prompt-banner')).toBeInTheDocument();
    });

    it('renders the SESSION_ENDED message as plain text with no links (Requirement 2.4)', () => {
      render(<Setter session={null} signOutReason="SESSION_ENDED" />);
      render(<LoginPromptBanner onRequestLogin={jest.fn()} onRequestSignUp={jest.fn()} />);

      const banner = screen.getByTestId('login-prompt-banner');
      expect(banner).toHaveTextContent('Your session ended. Sign in to save your visited states.');
      expect(screen.queryByTestId('login-prompt-login-link')).toBeNull();
      expect(screen.queryByTestId('login-prompt-signup-link')).toBeNull();
      expect(banner.querySelectorAll('a')).toHaveLength(0);
    });
  });
});
