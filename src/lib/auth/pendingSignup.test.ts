import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPendingSignup,
  peekPendingSignup,
  setPendingSignup,
  touchPendingSignupSentAt,
} from './pendingSignup';

describe('pendingSignup', () => {
  afterEach(() => {
    clearPendingSignup();
  });

  it('stores and reads email/password/sentAt', () => {
    setPendingSignup('Ada@Example.com', 'secret123', 1000);
    expect(peekPendingSignup()).toEqual({
      email: 'ada@example.com',
      password: 'secret123',
      sentAt: 1000,
    });
  });

  it('updates sentAt on touch', () => {
    setPendingSignup('a@b.c', 'x', 1);
    touchPendingSignupSentAt(99);
    expect(peekPendingSignup()?.sentAt).toBe(99);
  });

  it('clears', () => {
    setPendingSignup('a@b.c', 'x', 1);
    clearPendingSignup();
    expect(peekPendingSignup()).toBeNull();
  });
});
