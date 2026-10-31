import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from '@/hooks/useLocale';
import { classifyAuthFormError } from '@/lib/auth/classifyAuthFormError';
import { normalizeAuthError } from '@/lib/auth/normalizeAuthError';
import {
  clearPendingSignup,
  peekPendingSignup,
  setPendingSignup,
} from '@/lib/auth/pendingSignup';
import { requestPasswordReset } from '@/lib/auth/requestPasswordReset';
import { consumeSessionNotice } from '@/lib/auth/sessionNotice';
import { peekPendingInviteCode } from '@/lib/inviteLink';
import { scrollFocusIntoView } from '@/lib/scrollFocusIntoView';
import KeyboardAwareScreen from '@/components/KeyboardAwareScreen';
import SignupOtpScreen from '@/components/SignupOtpScreen';
import { supabase } from '@/integrations/supabase/client';
import { getAuthRedirectUrl } from '@/lib/native/authRedirect';

type Mode = 'login' | 'signup' | 'forgot';

type AuthPageProps = {
  initialMode?: Mode;
};

type OtpGate = {
  email: string;
  password: string;
  sentAt: number;
};

function pendingToGate(): OtpGate | null {
  const pending = peekPendingSignup();
  if (!pending) return null;
  return {
    email: pending.email,
    password: pending.password,
    sentAt: pending.sentAt,
  };
}

const AuthPage = ({ initialMode = 'login' }: AuthPageProps = {}) => {
  const { t } = useLocale();
  const pendingInvite = peekPendingInviteCode();
  const [mode, setMode] = useState<Mode>(() =>
    pendingInvite && initialMode === 'login' ? 'signup' : initialMode,
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [otpGate, setOtpGate] = useState<OtpGate | null>(() => pendingToGate());
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const { signIn, signUp, user } = useAuth();

  // Survive remount after signUp's temporary session: always re-hydrate OTP.
  useEffect(() => {
    if (otpGate) return;
    const gate = pendingToGate();
    if (gate) {
      setOtpGate(gate);
      return;
    }
    // Unconfirmed session without pending password — still collect the code.
    if (user && !user.email_confirmed_at && user.email) {
      setOtpGate({
        email: user.email,
        password: '',
        sentAt: Date.now() - 30_000,
      });
    }
  }, [otpGate, user]);

  useEffect(() => {
    const pending = consumeSessionNotice();
    if (pending === 'account_unavailable') {
      setNotice(t('auth.accountUnavailable'));
      return;
    }
    if (pending === 'email_confirmed_login') {
      setNotice(t('auth.emailConfirmedLogin'));
      setMode('login');
      return;
    }
    const code = peekPendingInviteCode();
    if (code) setNotice(t('auth.inviteReady', { code }));
  }, [t]);

  const openOtp = (nextEmail: string, nextPassword: string, sentAt = Date.now()) => {
    setPendingSignup(nextEmail, nextPassword, sentAt);
    setOtpGate({ email: nextEmail.trim().toLowerCase(), password: nextPassword, sentAt });
  };

  const applyAuthError = (err: unknown) => {
    const kind = classifyAuthFormError(err);
    switch (kind) {
      case 'invalid_credentials':
        setError(t('auth.invalidCredentials'));
        return;
      case 'email_not_confirmed':
        openOtp(email, password);
        void supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: getAuthRedirectUrl() },
        });
        return;
      case 'user_already_registered':
        if (mode === 'signup') {
          setAlreadyRegistered(true);
          return;
        }
        setError(t('auth.userAlreadyRegistered'));
        return;
      case 'rate_limit':
        setError(t('auth.rateLimited'));
        return;
      default:
        setError(normalizeAuthError(err).message || t('auth.genericError'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) applyAuthError(error);
        else clearPendingSignup();
      } else if (mode === 'signup') {
        const result = await signUp(email, password);
        if (result.error) {
          applyAuthError(result.error);
          return;
        }
        if (result.alreadyRegistered) {
          setAlreadyRegistered(true);
          return;
        }
        if (result.needsConfirm) {
          // pendingSignup already written inside signUp; open UI (or remount recovers it).
          openOtp(email, password);
          return;
        }
        // Email confirm disabled in project — session is live, Index will enter app.
        clearPendingSignup();
      } else {
        const result = await requestPasswordReset(email);
        if (result.ok === true) {
          setResetSent(true);
        } else {
          applyAuthError(result.error);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
    setAlreadyRegistered(false);
    setResetSent(false);
  };

  if (otpGate) {
    return (
      <SignupOtpScreen
        email={otpGate.email}
        password={otpGate.password}
        sentAt={otpGate.sentAt}
        onCancel={() => {
          clearPendingSignup();
          setOtpGate(null);
          setMode('login');
          setEmail(otpGate.email);
          if (user && !user.email_confirmed_at) {
            void supabase.auth.signOut({ scope: 'local' });
          }
        }}
      />
    );
  }

  if (alreadyRegistered) {
    return (
      <div className="min-h-[100dvh] overflow-y-auto py-safe px-6 bg-background flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold mb-2">{t('auth.alreadyHaveAccountTitle')}</h1>
          <p className="text-muted-foreground mb-6">{t('auth.alreadyHaveAccountBody')}</p>
          <button
            onClick={() => switchMode('login')}
            className="w-full rounded-xl bg-green-200 px-4 py-2.5 font-semibold text-green-900"
          >
            {t('auth.goToLogin')}
          </button>
          <button
            type="button"
            onClick={() => switchMode('forgot')}
            className="mt-4 text-sm text-muted-foreground underline underline-offset-2"
          >
            {t('auth.forgotPassword')}
          </button>
        </motion.div>
      </div>
    );
  }

  if (resetSent) {
    return (
      <div className="min-h-[100dvh] overflow-y-auto py-safe px-6 bg-background flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold mb-2">{t('auth.resetSentTitle')}</h1>
          <p className="text-muted-foreground mb-6">{t('auth.resetSentBody')}</p>
          <button
            onClick={() => switchMode('login')}
            className="text-foreground font-medium underline underline-offset-2"
          >
            {t('auth.backToLogin')}
          </button>
        </motion.div>
      </div>
    );
  }

  const title =
    mode === 'login'
      ? t('auth.loginTitle')
      : mode === 'signup'
        ? t('auth.signupTitle')
        : t('auth.forgotTitle');
  const subtitle =
    mode === 'login'
      ? pendingInvite
        ? t('auth.loginWithInvite')
        : t('auth.loginSubtitle')
      : mode === 'signup'
        ? pendingInvite
          ? t('auth.signupWithInvite')
          : t('auth.signupSubtitle')
        : t('auth.forgotSubtitle');

  const submitLabel =
    mode === 'login'
      ? t('auth.goToLogin')
      : mode === 'signup'
        ? t('auth.createAccount')
        : t('auth.sendLink');

  return (
    <KeyboardAwareScreen
      asForm
      onSubmit={handleSubmit}
      contentClassName="flex flex-col justify-center pb-6"
      footer={
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-green-200 py-3 font-semibold text-green-900 transition-colors active:bg-green-300 disabled:opacity-60"
        >
          {busy ? t('auth.sending') : submitLabel}
        </button>
      }
    >
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">{title}</h1>
        <p className="text-muted-foreground text-center mb-8">{subtitle}</p>

        {notice && (
          <p className="mb-4 rounded-xl bg-muted px-4 py-3 text-sm text-center text-foreground">
            {notice}
          </p>
        )}

        <div className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            required
            autoComplete="email"
            onFocus={scrollFocusIntoView}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {mode !== 'forgot' && (
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                onFocus={scrollFocusIntoView}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {mode === 'login' && (
                <p className="mt-2 text-right text-sm">
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-muted-foreground underline underline-offset-2"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-destructive text-sm text-center">{error}</p>
          )}
        </div>

        <p className="text-center mt-6 text-sm text-muted-foreground">
          {mode === 'signup' ? (
            <>
              {t('auth.hasAccount')}{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-foreground font-medium underline underline-offset-2"
              >
                {t('auth.goToLogin')}
              </button>
            </>
          ) : mode === 'forgot' ? (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="text-foreground font-medium underline underline-offset-2"
            >
              {t('auth.backToLogin')}
            </button>
          ) : (
            <>
              {t('auth.noAccount')}{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="text-foreground font-medium underline underline-offset-2"
              >
                {t('auth.createAccount')}
              </button>
            </>
          )}
        </p>
      </motion.div>
    </KeyboardAwareScreen>
  );
};

export default AuthPage;
