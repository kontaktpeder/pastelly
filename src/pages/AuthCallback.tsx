import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { handleAuthCallbackUrl } from '@/lib/auth/handleAuthCallbackUrl';
import { setSessionNotice } from '@/lib/auth/sessionNotice';
import { useLocale } from '@/hooks/useLocale';

/**
 * Fallback for users who tap the email link instead of entering the OTP.
 * Cross-browser PKCE usually fails here — we tell them to return to Pastelly
 * (homescreen) where the OTP screen can silent-sign-in, or they log in manually.
 */
const AuthCallback = () => {
  const { t } = useLocale();
  const navigate = useNavigate();
  const ranRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedFallback, setConfirmedFallback] = useState(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      const result = await handleAuthCallbackUrl(window.location.href);
      if (result.ok === false) {
        // Link opened outside the signup context — treat as "confirmed, go back".
        if (result.action === 'login') {
          setConfirmedFallback(true);
          setError(t('auth.callbackConfirmedBody'));
          return;
        }
        setError(result.error);
        return;
      }
      if (result.kind === 'recovery') {
        navigate('/auth/update-password', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    })();
  }, [navigate, t]);

  const goLogin = () => {
    setSessionNotice('email_confirmed_login');
    navigate('/', { replace: true });
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center"
        >
          <h1 className="text-2xl font-bold mb-2">
            {confirmedFallback ? t('auth.callbackConfirmedTitle') : t('auth.callbackFailedTitle')}
          </h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          {confirmedFallback ? (
            <button
              type="button"
              onClick={goLogin}
              className="w-full rounded-xl bg-green-200 px-4 py-3 font-semibold text-green-900"
            >
              {t('auth.goToLogin')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="rounded-xl bg-green-200 px-4 py-2 font-semibold text-green-900"
            >
              {t('auth.backToLogin')}
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
        <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">{t('auth.callbackWorking')}</p>
      </motion.div>
    </div>
  );
};

export default AuthCallback;
