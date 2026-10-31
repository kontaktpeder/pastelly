import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getAuthRedirectUrl } from '@/lib/native/authRedirect';
import { clearLocalUserState } from '@/lib/auth/localReset';
import { setPendingSignup } from '@/lib/auth/pendingSignup';
import { classifySessionUserError, type SessionUserCheck } from '@/lib/auth/sessionValidity';
import { setSessionNotice } from '@/lib/auth/sessionNotice';
import { clearPushUser, identifyPushUser } from '@/lib/native/push';
import type { User, Session } from '@supabase/supabase-js';

async function clearInvalidSession(): Promise<void> {
  setSessionNotice('account_unavailable');
  await clearLocalUserState();
  await supabase.auth.signOut({ scope: 'local' });
}

/**
 * Server-roundtrip check: a local JWT can outlive a deleted auth.users row.
 * Network failures return `unknown` so we never sign out on a flaky connection.
 */
async function checkSessionUser(): Promise<SessionUserCheck> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return classifySessionUserError(error);
  return data.user ? 'valid' : 'gone';
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const validatingRef = useRef(false);

  useEffect(() => {
    const applySession = (next: Session | null) => {
      setSession(next);
      setUser(next?.user ?? null);
      setLoading(false);
      if (next?.user?.id) {
        void identifyPushUser(next.user.id);
      } else {
        void clearPushUser();
      }
    };

    const validateExistingSession = async (next: Session) => {
      if (validatingRef.current) return;
      validatingRef.current = true;
      try {
        if ((await checkSessionUser()) === 'gone') {
          await clearInvalidSession();
          applySession(null);
          return;
        }
        applySession(next);
      } finally {
        validatingRef.current = false;
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (event === 'SIGNED_OUT' || !nextSession) {
          applySession(null);
          return;
        }
        // INITIAL_SESSION / SIGNED_IN: confirm the user still exists server-side.
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          void validateExistingSession(nextSession);
          return;
        }
        applySession(nextSession);
      },
    );

    supabase.auth.getSession().then(({ data: { session: next } }) => {
      if (!next) {
        applySession(null);
        return;
      }
      void validateExistingSession(next);
    });

    const revalidateOnResume = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        const { data: { session: current } } = await supabase.auth.getSession();
        if (!current) return;
        if ((await checkSessionUser()) === 'gone') {
          await clearInvalidSession();
          applySession(null);
        }
      })();
    };
    document.addEventListener('visibilitychange', revalidateOnResume);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', revalidateOnResume);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: getAuthRedirectUrl() },
    });
    if (error) return { data, error, alreadyRegistered: false, needsConfirm: false };

    // Supabase returns a user with empty identities when the email is taken
    // (anti-enumeration) — treat as already registered, not a fresh signup.
    const identities = data.user?.identities ?? [];
    if (data.user && identities.length === 0) {
      return { data, error: null, alreadyRegistered: true, needsConfirm: false };
    }

    const needsConfirm = !!data.user && !data.user.email_confirmed_at;
    if (needsConfirm) {
      // Persist BEFORE clearing any surprise session so Auth remounts into OTP
      // even if SIGNED_IN already unmounted the form mid-await.
      setPendingSignup(email, password);
      if (data.session) {
        await supabase.auth.signOut({ scope: 'local' });
      }
    }

    return { data, error: null, alreadyRegistered: false, needsConfirm };
  };

  const signOut = async () => {
    await clearLocalUserState();
    // Revoke refresh tokens on every device; fall back to local when the
    // session is already invalid server-side.
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) {
      const { error: localError } = await supabase.auth.signOut({ scope: 'local' });
      if (localError) throw localError;
    }
    queryClient.clear();
  };

  return { user, session, loading, signIn, signUp, signOut };
}
