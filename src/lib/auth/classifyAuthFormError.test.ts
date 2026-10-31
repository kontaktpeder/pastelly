import { describe, expect, it } from 'vitest';
import { classifyAuthFormError } from './classifyAuthFormError';

describe('classifyAuthFormError', () => {
  it('maps invalid credentials for unknown email and wrong password alike', () => {
    expect(
      classifyAuthFormError({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
    ).toBe('invalid_credentials');
    expect(classifyAuthFormError({ message: 'Invalid login credentials' })).toBe(
      'invalid_credentials',
    );
  });

  it('maps email not confirmed', () => {
    expect(classifyAuthFormError({ code: 'email_not_confirmed' })).toBe('email_not_confirmed');
    expect(classifyAuthFormError({ message: 'Email not confirmed' })).toBe('email_not_confirmed');
  });

  it('maps already registered', () => {
    expect(classifyAuthFormError({ message: 'User already registered' })).toBe(
      'user_already_registered',
    );
  });

  it('maps rate limits', () => {
    expect(classifyAuthFormError({ status: 429 })).toBe('rate_limit');
    expect(classifyAuthFormError({ code: 'over_email_send_rate_limit' })).toBe('rate_limit');
  });

  it('maps otp invalid and expired', () => {
    expect(classifyAuthFormError({ code: 'otp_expired' })).toBe('otp_expired');
    expect(classifyAuthFormError({ message: 'Token has expired or is invalid' })).toBe('otp_expired');
    expect(classifyAuthFormError({ message: 'Invalid OTP' })).toBe('otp_invalid');
  });

  it('falls back to generic', () => {
    expect(classifyAuthFormError(null)).toBe('generic');
    expect(classifyAuthFormError({ message: 'Something else' })).toBe('generic');
  });
});
