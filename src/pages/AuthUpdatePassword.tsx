import { useEffect, useRef, useState } from 'react';
import { scrollFocusIntoView } from '@/lib/scrollFocusIntoView';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { logAuthDiagnostic } from '@/lib/auth/diagnostics';
import {
  clearRecoveryFlow,
  getRecoveryState,
  hasPendingRecoveryIntent,
  markRecoverySessionReady,
  startRecoveryFlow,
  subscribeRecoveryState,
} from '@/lib/auth/recoveryState';
import { shouldPromoteRecoveryPage } from '@/lib/auth/recoveryGating';
import KeyboardAwareScreen from '@/components/KeyboardAwareScreen';

type PageState = 'checking' | 'ready' | 'submitting' | 'success' | 'error';

// How long we wait for a PASSWORD_RECOVERY signal before giving up
// with a proper error state. Never an infinite spinner.
const SESSION_TIMEOUT_MS = 5000;

const AuthUpdatePassword = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;
    logAuthDiagnostic('recovery:page:checking');

    const promote = () => {
      if (disposed) return;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      markRecoverySessionReady();
      setState((prev) => (prev === 'checking' ? 'ready' : prev));
      logAuthDiagnostic('recovery:page:promote');
      logAuthDiagnostic('recovery:page:ready');
    };

    const tryPromoteFromState = (event: string | null) => {
      const rs = getRecoveryState();
      const pending = hasPendingRecoveryIntent();
      if (shouldPromoteRecoveryPage(rs, event, { pendingIntent: pending })) {
        promote();
      } else {
        logAuthDiagnostic('recovery:page:promote_blocked', {
          isRecoveryFlow: rs.isRecoveryFlow,
          recoverySessionReady: rs.recoverySessionReady,
          pending,
        });
      }
    };

    // If recovery is already marked ready (e.g. event fired before mount),
    // promote immediately. Do NOT promote on a plain existing session.
    tryPromoteFromState(null);

    // Short polling fallback: on native PKCE the PASSWORD_RECOVERY event
    // often never fires and `type=recovery` is stripped. Poll getSession
    // every 400ms up to 5s — as soon as we have a session, promote. If
    // we've landed on this page a session already implies the recovery
    // deep link was consumed.
    let pollAttempts = 0;
    const pollId = window.setInterval(async () => {
      if (disposed) return;
      pollAttempts += 1;
      // A session alone is not proof of recovery: a normally signed-in user
      // opening this URL must not be pushed into the recovery flow.
      const rs = getRecoveryState();
      if (!rs.isRecoveryFlow && !rs.recoverySessionReady && !hasPendingRecoveryIntent()) {
        if (pollAttempts >= 13) window.clearInterval(pollId);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (disposed) return;
      if (data.session) {
        startRecoveryFlow();
        markRecoverySessionReady();
        promote();
        window.clearInterval(pollId);
        return;
      }
      if (pollAttempts >= 13) window.clearInterval(pollId);
    }, 400);

    // Live auth events — PASSWORD_RECOVERY authoritative; SIGNED_IN is a
    // native PKCE fallback (fires without PASSWORD_RECOVERY).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (disposed) return;
      logAuthDiagnostic('auth:event', { event });
      // PASSWORD_RECOVERY is authoritative; SIGNED_IN only counts while a
      // recovery flow / pending intent is active (native PKCE fallback).
      if (
        shouldPromoteRecoveryPage(getRecoveryState(), event, {
          pendingIntent: hasPendingRecoveryIntent(),
        })
      ) {
        startRecoveryFlow();
        markRecoverySessionReady();
        promote();
      }
    });

    // External recovery-state changes (e.g. RecoveryRouter marked ready).
    const unsubState = subscribeRecoveryState((rs) => {
      if (disposed) return;
      if (rs.recoverySessionReady) promote();
    });

    // Timeout — surface a clear error instead of flashing spinners.
    timeoutRef.current = window.setTimeout(() => {
      if (disposed) return;
      setState((prev) => {
        if (prev !== 'checking') return prev;
        setError('Vi klarte ikke å bekrefte gjenopprettingslenken. Be om en ny e-post og prøv igjen.');
        logAuthDiagnostic('recovery:page:timeout');
        return 'error';
      });
    }, SESSION_TIMEOUT_MS);

    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
      unsubState();
      window.clearInterval(pollId);
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Passord må være minst 6 tegn');
      return;
    }
    if (password !== confirm) {
      setError('Passordene er ikke like');
      return;
    }
    setState('submitting');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setState('ready');
      logAuthDiagnostic('recovery:page:error');
      return;
    }
    setState('success');
    clearRecoveryFlow();
    // Small delay so the success state is visible before navigating.
    window.setTimeout(() => navigate('/', { replace: true }), 600);
  };

  const handleBack = () => {
    clearRecoveryFlow();
    navigate('/', { replace: true });
  };

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Klargjør gjenoppretting...</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-[100dvh] overflow-y-auto py-safe px-6 bg-background flex items-center justify-center">
        <div className="w-full max-w-sm text-center">
          <p className="text-5xl mb-4">🔒</p>
          <h1 className="text-2xl font-bold mb-2">Lenken er ugyldig</h1>
          <p className="text-muted-foreground mb-6">{error || 'Denne siden krever en gyldig gjenopprettingslenke.'}</p>
          <button
            onClick={handleBack}
            className="rounded-xl bg-green-200 px-4 py-2 font-semibold text-green-900"
          >
            Tilbake
          </button>
        </div>
      </div>
    );
  }

  return (
    <KeyboardAwareScreen
      asForm
      onSubmit={handleSubmit}
      contentClassName="flex flex-col justify-center pb-6"
      footer={
        <button
          type="submit"
          disabled={state === 'submitting' || state === 'success'}
          className="w-full rounded-xl bg-green-200 py-3 font-semibold text-green-900 transition-colors hover:bg-green-300 disabled:opacity-60"
        >
          {state === 'submitting' ? 'Lagrer...' : state === 'success' ? 'Ferdig ✓' : 'Lagre nytt passord'}
        </button>
      }
    >
      <div className="w-full max-w-sm mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">Nytt passord 🔑</h1>
        <p className="text-muted-foreground text-center mb-8">Velg et nytt passord for kontoen din</p>

        <div className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nytt passord"
            required
            minLength={6}
            autoComplete="new-password" onFocus={scrollFocusIntoView}
            disabled={state === 'submitting' || state === 'success'}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Bekreft passord"
            required
            minLength={6}
            autoComplete="new-password" onFocus={scrollFocusIntoView}
            disabled={state === 'submitting' || state === 'success'}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
          />
          {error && <p className="text-destructive text-sm text-center">{error}</p>}
        </div>
      </div>
    </KeyboardAwareScreen>
  );
};

export default AuthUpdatePassword;
