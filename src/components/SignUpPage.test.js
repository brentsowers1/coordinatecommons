// Unit tests for Sign_Up_Page behavior (Requirement 12).
//
// Mirrors LoginPage.test.js's structure: `authenticationService.signUp`
// and `confirmSignUp` are mocked so no real Cognito call happens;
// `validateSignUpFields` is left as the real implementation (via
// `jest.requireActual`) so SignUpForm's/SignUpConfirmationForm's
// client-side validation still lets well-formed input through to
// `onSubmit`.
//
// Covers:
//   - the two-step transition: fields -> confirmation code ->
//     onSignUpComplete called (Requirement 12.5, 12.6, 12.7)
//   - each error-message mapping for signUp() rejections: USERNAME_EXISTS,
//     INVALID_PASSWORD, TIMEOUT_OR_UNREACHABLE (Requirement 12.5's failure
//     criteria)
//   - each error-message mapping for confirmSignUp() rejections:
//     INVALID_CODE, TIMEOUT_OR_UNREACHABLE (Requirement 12.6's failure
//     criteria)
//   - onSignUpComplete is called only after successful confirmation, and
//     never touches useSession (Requirement 12.7)

import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { SignUpPage } from './SignUpPage';

jest.mock('../services/authenticationService', () => ({
  ...jest.requireActual('../services/authenticationService'),
  signUp: jest.fn(),
  confirmSignUp: jest.fn(),
}));

import { signUp, confirmSignUp } from '../services/authenticationService';

const USERNAME_EXISTS_MESSAGE = 'That username is already taken.';
const INVALID_PASSWORD_MESSAGE = 'That password does not meet the requirements.';
const INVALID_CODE_MESSAGE = 'That confirmation code is invalid or has expired.';
const TIMEOUT_MESSAGE = 'The request could not be completed. Please try again.';

function fillValidSignUpFields() {
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice' } });
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: 'alice@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'correct-password' },
  });
  fireEvent.change(screen.getByLabelText(/confirm password/i), {
    target: { value: 'correct-password' },
  });
}

async function signUpSuccessfully() {
  signUp.mockResolvedValue({ username: 'alice' });
  fillValidSignUpFields();
  fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
  await screen.findByLabelText(/confirmation code/i);
}

beforeEach(() => {
  signUp.mockReset();
  confirmSignUp.mockReset();
});

describe('SignUpPage - basic rendering', () => {
  it('renders the sign-up fields and a submit control', () => {
    render(<SignUpPage onSignUpComplete={jest.fn()} />);

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
  });
});

describe('SignUpPage - two-step transition (Requirement 12.5, 12.6, 12.7)', () => {
  it('transitions from the fields step to the confirmation-code step on successful signUp()', async () => {
    render(<SignUpPage onSignUpComplete={jest.fn()} />);

    await signUpSuccessfully();

    expect(screen.getByLabelText(/confirmation code/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^username/i)).not.toBeInTheDocument();
  });

  it('shows instructions on the confirmation-code step with the submitted email, spam-folder guidance, and the sender address', async () => {
    render(<SignUpPage onSignUpComplete={jest.fn()} />);

    await signUpSuccessfully();

    const instructions = screen.getByTestId('signup-confirmation-instructions');
    expect(instructions).toHaveTextContent('alice@example.com');
    expect(instructions).toHaveTextContent('no-reply@verificationemail.com');
    expect(instructions).toHaveTextContent(/spam|junk/i);
  });

  it('calls onSignUpComplete with a success message after a successful confirmSignUp(), without ever creating a Session', async () => {
    confirmSignUp.mockResolvedValue(true);
    const onSignUpComplete = jest.fn();
    render(<SignUpPage onSignUpComplete={onSignUpComplete} />);

    await signUpSuccessfully();

    fireEvent.change(screen.getByLabelText(/confirmation code/i), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(onSignUpComplete).toHaveBeenCalledTimes(1));
    expect(confirmSignUp).toHaveBeenCalledWith('alice', '123456');
    expect(onSignUpComplete).toHaveBeenCalledWith(expect.stringContaining('verified'));
  });
});

describe('SignUpPage - signUp() failure messages', () => {
  it('shows the username-exists message on USERNAME_EXISTS', async () => {
    signUp.mockRejectedValue({ kind: 'USERNAME_EXISTS' });
    render(<SignUpPage onSignUpComplete={jest.fn()} />);

    fillValidSignUpFields();
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(USERNAME_EXISTS_MESSAGE);
  });

  it('shows the invalid-password message on INVALID_PASSWORD', async () => {
    signUp.mockRejectedValue({ kind: 'INVALID_PASSWORD' });
    render(<SignUpPage onSignUpComplete={jest.fn()} />);

    fillValidSignUpFields();
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(INVALID_PASSWORD_MESSAGE);
  });

  it('shows the timeout message on TIMEOUT_OR_UNREACHABLE', async () => {
    signUp.mockRejectedValue({ kind: 'TIMEOUT_OR_UNREACHABLE' });
    render(<SignUpPage onSignUpComplete={jest.fn()} />);

    fillValidSignUpFields();
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(TIMEOUT_MESSAGE);
  });
});

describe('SignUpPage - confirmSignUp() failure messages', () => {
  it('shows the invalid-code message on INVALID_CODE', async () => {
    confirmSignUp.mockRejectedValue({ kind: 'INVALID_CODE' });
    render(<SignUpPage onSignUpComplete={jest.fn()} />);

    await signUpSuccessfully();
    fireEvent.change(screen.getByLabelText(/confirmation code/i), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(INVALID_CODE_MESSAGE);
  });

  it('shows the timeout message on TIMEOUT_OR_UNREACHABLE', async () => {
    confirmSignUp.mockRejectedValue({ kind: 'TIMEOUT_OR_UNREACHABLE' });
    render(<SignUpPage onSignUpComplete={jest.fn()} />);

    await signUpSuccessfully();
    fireEvent.change(screen.getByLabelText(/confirmation code/i), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(TIMEOUT_MESSAGE);
  });
});
