import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useLocale } from '@/hooks/useLocale';
import { classifyAuthFormError } from '@/lib/auth/classifyAuthFormError';
import { normalizeAuthError } from '@/lib/auth/normalizeAuthError';
import {
  clearPendingSignup,
  peekPendingSignup,
  touchPendingSignupSentAt,
} from '@/lib/auth/pendingSignup';
import { getAuthRedirectUrl } from '@/lib/native/authRedirect';
import { scrollFocusIntoView } from '@/lib/scrollFocusIntoView';

const OTP_LEN = 6;
const RESEND_COOLDOWN_SEC = 30;
const POLL_MS = 3000;

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, OTP_LEN);
}

function secondsLeft(sentAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_SEC * 1000 - now) / 1000));
}

type SignupOtpScreenProps = {
  email: string;
  password: string;
  sentAt: number;
  onCancel: () => void;
};

/**
 * Single hidden-ish numeric input over six visual boxes — keeps iOS/Android
 * one-time-code autofill and paste working (six separate inputs don't).
 */
const SignupOtpScreen = ({ email, password, sentAt: initialSentAt, onCancel }: SignupOtpScreenProps) => {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const verifyingRef = useRef(false);
  const [code, setCode] = useState('');
  const [sentAt, setSentAt] = useState(initialSentAt);
  const [cooldown, setCooldown] = useState(() => secondsLeft(initialSentAt));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setCooldown(secondsLeft(sentAt)), 250);
    return () => window.clearInterval(id);
  }, [sentAt]);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    const id = window.setTimeout(focus, 320);
    return () => window.clearTimeout(id);
  }, []);

  const mapOtpError = useCallback(
    (err: unknown) => {
      const kind = classifyAuthFormError(err);
      if (kind === 'otp_expired') return t('auth.otpExpired');
      if (kind === 'otp_invalid') return t('auth.otpInvalid');
      if (kind === 'rate_limit') return t('auth.rateLimited');
      return normalizeAuthError(err).message || t('auth.genericError');
    },
    [t],
  );

  const verify = useCallback(
    async (token: string) => {
      if (verifyingRef.current || token.length !== OTP_LEN) return;
      verifyingRef.current = true;
      setBusy(true);
      setError('');
      try {
        const { error: otpError } = await supabase.auth.verifyOtp({
          email,
          token,
          type: 'signup',
        });
        if (otpError) {
          setError(mapOtpError(otpError));
          setCode('');
          window.setTimeout(() => inputRef.current?.focus(), 50);
          return;
        }
        clearPendingSignup();
        // Session is set — Index swaps away from Auth via onAuthStateChange.
      } finally {
        verifyingRef.current = false;
        setBusy(false);
      }
    },
    [email, mapOtpError],
  );

  const trySilentSignIn = useCallback(async () => {
    const pending = peekPendingSignup();
    if (!pending?.password) return;
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: pending.email,
      password: pending.password,
    });
    if (!signInError) {
      clearPendingSignup();
    }
  }, []);

  // If the user confirmed via the email link in another browser, pick up the
  // session when they return (or every few seconds while this screen is open).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void trySilentSignIn();
    };
    document.addEventListener('visibilitychange', onVisible);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void trySilentSignIn();
    }, POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(poll);
    };
  }, [trySilentSignIn]);

  const onCodeChange = (raw: string) => {
    const next = digitsOnly(raw);
    setCode(next);
    setError('');
    if (next.length === OTP_LEN) void verify(next);
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError('');
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: getAuthRedirectUrl() },
      });
      if (resendError) {
        setError(mapOtpError(resendError));
        return;
      }
      const now = Date.now();
      setSentAt(now);
      setCooldown(RESEND_COOLDOWN_SEC);
      touchPendingSignupSentAt(now);
      setCode('');
      window.setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setResending(false);
    }
  };

  const boxes = Array.from({ length: OTP_LEN }, (_, i) => code[i] ?? '');

  return (
    <div className="min-h-[100dvh] overflow-y-auto py-safe px-6 bg-background flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm text-center"
      >
        <h1 className="text-2xl font-bold mb-2">{t('auth.otpTitle')}</h1>
        <p className="text-muted-foreground mb-8">
          {t('auth.otpBody', { email })}
        </p>

        <button
          type="button"
          className="relative mx-auto mb-4 block w-full max-w-[320px] cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          <div className="pointer-events-none flex justify-between gap-2" aria-hidden>
            {boxes.map((digit, i) => (
              <div
                key={i}
                className={`flex h-14 flex-1 items-center justify-center rounded-xl border text-2xl font-semibold tabular-nums ${
                  digit
                    ? 'border-foreground bg-background text-foreground'
                    : i === code.length
                      ? 'border-primary ring-2 ring-primary/30 bg-background'
                      : 'border-border bg-muted/40 text-muted-foreground'
                }`}
              >
                {digit || (i === code.length ? '·' : '')}
              </div>
            ))}
          </div>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            pattern="[0-9]*"
            maxLength={OTP_LEN}
            value={code}
            disabled={busy}
            onChange={(e) => onCodeChange(e.target.value)}
            onFocus={scrollFocusIntoView}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (!text) return;
              e.preventDefault();
              onCodeChange(text);
            }}
            aria-label={t('auth.otpAria')}
            className="absolute inset-0 z-10 h-full w-full cursor-text opacity-[0.02]"
          />
        </button>

        {busy && (
          <p className="text-sm text-muted-foreground mb-3">{t('auth.otpVerifying')}</p>
        )}
        {error && (
          <p className="text-destructive text-sm mb-3">{error}</p>
        )}

        <button
          type="button"
          disabled={cooldown > 0 || resending}
          onClick={() => void handleResend()}
          className="text-sm font-medium text-foreground underline underline-offset-2 disabled:no-underline disabled:text-muted-foreground disabled:opacity-70"
        >
          {resending
            ? t('auth.otpResending')
            : cooldown > 0
              ? t('auth.otpResendWait', { seconds: String(cooldown) })
              : t('auth.otpResend')}
        </button>

        <button
          type="button"
          onClick={() => {
            clearPendingSignup();
            onCancel();
          }}
          className="mt-6 block w-full text-sm text-muted-foreground underline underline-offset-2"
        >
          {t('auth.backToLogin')}
        </button>
      </motion.div>
    </div>
  );
};

export default SignupOtpScreen;
