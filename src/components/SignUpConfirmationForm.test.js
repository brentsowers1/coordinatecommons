// Unit tests for SignUpConfirmationForm (Requirement 12.6, 12.15, 12.17).
//
// Regression coverage: React 18/19's <React.StrictMode> intentionally
// mounts every component twice in development (mount -> effect cleanup ->
// unmount -> re-mount -> effect rerun) to help surface exactly the class of
// bug this test guards against -- an `isMountedRef` guard that is only
// ever set to `false` (on cleanup) and never reset back to `true` when the
// effect (re-)runs stays permanently `false` after StrictMode's discarded
// first mount, even though the component that is actually still on screen
// is fully mounted. That silently breaks the `isMountedRef.current` guard
// in `handleSubmit`'s `.finally()`, so `setIsSubmitting(false)` never runs
// after a real (non-StrictMode-discarded) submit settles -- the form gets
// stuck showing "Loading..." with the submit control and code field
// disabled forever, even though `errorMessage` from the parent renders
// correctly. This was reproduced against the real Cognito user pool (a
// real wrong confirmation code produces exactly this: the alert appears,
// but the button/input never re-enable) before being fixed by resetting
// `isMountedRef.current = true` at the top of the mount effect.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { SignUpConfirmationForm } from './SignUpConfirmationForm';

describe('SignUpConfirmationForm - pending state clears after submit settles (Requirement 12.17)', () => {
  it('re-enables the code field and submit control after a rejected onSubmit, under React.StrictMode', async () => {
    const onSubmit = jest.fn().mockRejectedValue({ kind: 'INVALID_CODE' });

    function Wrapper() {
      const [errorMessage, setErrorMessage] = React.useState(null);
      return (
        <SignUpConfirmationForm
          onSubmit={(code) =>
            onSubmit(code).catch(() => {
              setErrorMessage('That confirmation code is invalid or has expired.');
            })
          }
          errorMessage={errorMessage}
        />
      );
    }

    render(
      <React.StrictMode>
        <Wrapper />
      </React.StrictMode>
    );

    fireEvent.change(screen.getByLabelText(/confirmation code/i), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That confirmation code is invalid or has expired.');

    // The bug this guards against: the alert appearing is not sufficient
    // -- the pending/disabled state must clear too (Requirement 12.17
    // requires the submit control to be disabled only "while ... in
    // progress", and Requirement 12.15 requires the user to be able to
    // try a different code afterward).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm/i })).not.toBeDisabled();
    });
    expect(screen.getByLabelText(/confirmation code/i)).not.toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('re-enables after a resolved onSubmit too, under React.StrictMode', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <React.StrictMode>
        <SignUpConfirmationForm onSubmit={onSubmit} />
      </React.StrictMode>
    );

    fireEvent.change(screen.getByLabelText(/confirmation code/i), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm/i })).not.toBeDisabled();
    });
    expect(screen.getByLabelText(/confirmation code/i)).not.toBeDisabled();
  });
});
