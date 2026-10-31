export type AuthFormErrorKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'user_already_registered'
  | 'rate_limit'
  | 'otp_invalid'
  | 'otp_expired'
  | 'generic';

type MaybeAuthError = {
  message?: string;
  status?: number;
  code?: string;
} | null;

/**
 * Map Supabase auth errors to stable kinds for UI copy.
 * Login keeps "invalid credentials" for both unknown email and wrong password
 * (Supabase does not distinguish — by design).
 */
export function classifyAuthFormError(error: unknown): AuthFormErrorKind {
  if (!error || typeof error !== 'object') return 'generic';

  const err = error as MaybeAuthError;
  const code = (err.code ?? '').toLowerCase();
  const message = (err.message ?? '').toLowerCase();
  const status = err.status;

  if (status === 429 || code === 'over_email_send_rate_limit' || /rate.?limit|too many/i.test(message)) {
    return 'rate_limit';
  }

  if (
    code === 'otp_expired' ||
    (message.includes('otp') && message.includes('expired')) ||
    (message.includes('token') && message.includes('expired'))
  ) {
    return 'otp_expired';
  }

  if (
    code === 'otp_disabled' ||
    code === 'invalid_token' ||
    message.includes('token has expired or is invalid') ||
    message.includes('invalid otp') ||
    message.includes('otp is invalid') ||
    (message.includes('invalid') && message.includes('token'))
  ) {
    return 'otp_invalid';
  }

  if (
    code === 'email_not_confirmed' ||
    message.includes('email not confirmed') ||
    message.includes('email_not_confirmed')
  ) {
    return 'email_not_confirmed';
  }

  if (
    code === 'user_already_exists' ||
    code === 'user_already_registered' ||
    message.includes('user already registered') ||
    message.includes('already been registered')
  ) {
    return 'user_already_registered';
  }

  if (
    code === 'invalid_credentials' ||
    message.includes('invalid login credentials') ||
    message.includes('invalid_credentials')
  ) {
    return 'invalid_credentials';
  }

  return 'generic';
}
