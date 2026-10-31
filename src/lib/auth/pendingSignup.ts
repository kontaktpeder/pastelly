/**
 * Survives iOS PWA suspend / Mail app switch while the user enters the
 * signup OTP. Cleared on verify success, cancel, or successful password login.
 */
const KEY = 'pastelly:pending-signup';

export type PendingSignup = {
  email: string;
  password: string;
  /** epoch ms when the last OTP email was sent (signup or resend) */
  sentAt: number;
};

function safeSession(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function setPendingSignup(email: string, password: string, sentAt = Date.now()): void {
  const store = safeSession();
  if (!store) return;
  const payload: PendingSignup = {
    email: email.trim().toLowerCase(),
    password,
    sentAt,
  };
  try {
    store.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function peekPendingSignup(): PendingSignup | null {
  const store = safeSession();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSignup>;
    if (
      typeof parsed.email !== 'string' ||
      !parsed.email ||
      typeof parsed.password !== 'string' ||
      typeof parsed.sentAt !== 'number'
    ) {
      store.removeItem(KEY);
      return null;
    }
    return {
      email: parsed.email,
      password: parsed.password,
      sentAt: parsed.sentAt,
    };
  } catch {
    return null;
  }
}

export function touchPendingSignupSentAt(sentAt = Date.now()): void {
  const current = peekPendingSignup();
  if (!current) return;
  setPendingSignup(current.email, current.password, sentAt);
}

export function clearPendingSignup(): void {
  const store = safeSession();
  if (!store) return;
  try {
    store.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
