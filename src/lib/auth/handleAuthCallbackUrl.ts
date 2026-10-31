import { supabase } from '@/integrations/supabase/client';
import { logAuthDiagnostic } from './diagnostics';
import {
  clearPendingRecoveryIntent,
  getRecoveryState,
  hasPendingRecoveryIntent,
  markRecoverySessionReady,
  startRecoveryFlow,
} from './recoveryState';


export type AuthCallbackKind = 'signup' | 'recovery' | 'magic_link' | 'unknown';

export type AuthCallbackResult =
  | { ok: true; kind: AuthCallbackKind }
  | { ok: false; error: string; action?: 'login' };

export type AuthCallbackType = 'code' | 'token' | 'token_hash' | 'recovery' | 'unknown';

const PKCE_VERIFIER_RE = /code verifier|pkce/i;

export function isPkceVerifierError(message: string | null | undefined): boolean {
  return !!message && PKCE_VERIFIER_RE.test(message);
}

const PKCE_CROSS_BROWSER_ERROR =
  'Kontoen er bekreftet. Gå tilbake til Pastelly og logg inn.';

const NO_PARAMS_LOGIN_HINT =
  'Kontoen er bekreftet. Gå tilbake til Pastelly og logg inn.';

const NATIVE_SCHEME = 'pastelly:';
const NATIVE_HOST = 'auth';
const NATIVE_PATH = '/callback';
const WEB_PATH = '/auth/callback';

/**
 * Persistent dedup across WebView reloads. On native, `App.getLaunchUrl()`
 * keeps returning the original recovery URL after a WebView reload, so an
 * in-memory Set gets wiped and lets the same code be processed twice.
 */
const DEDUP_KEY = 'pastelly:auth-callback-seen';
const DEDUP_TTL_MS = 60_000;

type DedupEntry = { key: string; expiresAt: number };

function safeLocal(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readDedup(): DedupEntry[] {
  const store = safeLocal();
  if (!store) return [];
  try {
    const raw = store.getItem(DEDUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DedupEntry[];
    const now = Date.now();
    return Array.isArray(parsed) ? parsed.filter((e) => e.expiresAt > now) : [];
  } catch {
    return [];
  }
}

function writeDedup(entries: DedupEntry[]): void {
  const store = safeLocal();
  if (!store) return;
  try {
    store.setItem(DEDUP_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

function hasSeen(key: string): boolean {
  return readDedup().some((e) => e.key === key);
}

function markSeen(key: string): void {
  const entries = readDedup();
  if (entries.some((e) => e.key === key)) return;
  entries.push({ key, expiresAt: Date.now() + DEDUP_TTL_MS });
  writeDedup(entries);
}

async function dedupResultForKind(
  kind: AuthCallbackKind,
): Promise<AuthCallbackResult> {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    // Rehydrate recovery readiness so a WebView reload mid-flow still
    // lands on /auth/update-password instead of hanging on "checking".
    const rs = getRecoveryState();
    const pending = hasPendingRecoveryIntent();
    if (kind === 'recovery' || rs.isRecoveryFlow || pending) {
      startRecoveryFlow();
      markRecoverySessionReady();
      emitRecoveryNavigate();
      clearPendingRecoveryIntent();
      return { ok: true, kind: 'recovery' };
    }
    return { ok: true, kind };
  }
  return { ok: false, error: 'Gjenopprettingslenken er allerede brukt. Be om en ny e-post.' };
}

function emitRecoveryNavigate(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pastelly:recovery-navigate'));
    }
  } catch {
    /* ignore */
  }
}

function hasPkceCodeVerifier(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.endsWith('-code-verifier')) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function safeParse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function getHashParams(parsed: URL): URLSearchParams {
  const raw = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
  return new URLSearchParams(raw);
}

export function isValidAuthCallbackUrl(url: string): boolean {
  const parsed = safeParse(url);
  if (!parsed) return false;

  if (parsed.protocol === NATIVE_SCHEME) {
    return parsed.host === NATIVE_HOST && parsed.pathname === NATIVE_PATH;
  }

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return parsed.pathname === WEB_PATH;
  }

  return false;
}

export function parseAuthCallbackType(url: string): AuthCallbackType {
  const parsed = safeParse(url);
  if (!parsed) return 'unknown';

  const query = parsed.searchParams;
  const hash = getHashParams(parsed);

  if (query.get('type') === 'recovery' || hash.get('type') === 'recovery') {
    return 'recovery';
  }
  // token_hash works across browsers (no PKCE verifier in localStorage).
  if (query.get('token_hash') || hash.get('token_hash')) return 'token_hash';
  if (query.get('code')) return 'code';
  if (hash.get('access_token') && hash.get('refresh_token')) return 'token';
  return 'unknown';
}

type OtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email';

function resolveOtpType(raw: string | null, treatAsRecovery: boolean): OtpType {
  if (treatAsRecovery) return 'recovery';
  switch (raw) {
    case 'recovery':
      return 'recovery';
    case 'invite':
      return 'invite';
    case 'magiclink':
    case 'magic_link':
      return 'magiclink';
    case 'email_change':
      return 'email_change';
    case 'email':
      return 'email';
    case 'signup':
    default:
      return 'signup';
  }
}

export async function handleAuthCallbackUrl(url: string): Promise<AuthCallbackResult> {
  if (!isValidAuthCallbackUrl(url)) {
    logAuthDiagnostic('callback:invalid_url');
    return { ok: false, error: 'Ugyldig callback-URL' };
  }

  const parsed = safeParse(url)!;
  const type = parseAuthCallbackType(url);
  logAuthDiagnostic('callback:received', { type });

  const query = parsed.searchParams;
  const hash = getHashParams(parsed);
  const explicitType = query.get('type') ?? hash.get('type') ?? null;
  const isRecoveryFlag = explicitType === 'recovery';
  // Survives native PKCE (unlike type=recovery). Set on reset emails via
  // getPasswordResetRedirectUrl so a late tap still opens "new password".
  const isRecoveryIntent =
    query.get('intent') === 'recovery' || hash.get('intent') === 'recovery';
  // Explicit non-recovery URL types (signup, magiclink, invite, email_change).
  // If Supabase tells us the link is anything other than recovery, honor it
  // and drop any stale pendingRecoveryIntent — otherwise a leftover intent
  // from an earlier "forgot password" attempt would hijack signup links.
  const isExplicitNonRecovery = !!explicitType && explicitType !== 'recovery';
  if (isExplicitNonRecovery && hasPendingRecoveryIntent()) {
    clearPendingRecoveryIntent();
  }

  // Recovery when: URL marked recovery (type or our intent=), or a native
  // deep link arrives while a recovery intent is pending (fallback for
  // reset emails sent before intent=recovery was added; PKCE strips type).
  // Web links always carry `type`, so a pending intent must never turn a
  // web signup confirm into a password reset. We also do NOT treat every
  // native `pastelly://` link as recovery — signup deep links arrive on
  // the same scheme and must route normally.
  const isNativeCallback = parsed.protocol === NATIVE_SCHEME;
  const pendingIntent = hasPendingRecoveryIntent();
  const treatAsRecovery =
    isRecoveryFlag ||
    isRecoveryIntent ||
    (isNativeCallback && pendingIntent && !isExplicitNonRecovery);
  if (treatAsRecovery) {
    startRecoveryFlow();
  }

  // 1. token_hash + type — works when link opens in another browser/app (Gmail, etc.)
  const tokenHash = query.get('token_hash') ?? hash.get('token_hash');
  if (tokenHash) {
    const otpType = resolveOtpType(explicitType, treatAsRecovery);
    const dedupKey = `token_hash:${tokenHash.slice(-24)}`;
    let kind: AuthCallbackKind =
      otpType === 'recovery' ? 'recovery' : otpType === 'magiclink' ? 'magic_link' : 'signup';
    if (hasSeen(dedupKey)) {
      logAuthDiagnostic('callback:dedup_token_hash');
      return dedupResultForKind(kind);
    }
    logAuthDiagnostic('callback:verify_otp_start', { otpType });
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    if (error) {
      logAuthDiagnostic('callback:verify_otp_error');
      return { ok: false, error: error.message, action: 'login' };
    }
    markSeen(dedupKey);
    logAuthDiagnostic('callback:verify_otp_ok');
    if (otpType === 'recovery' || treatAsRecovery || getRecoveryState().isRecoveryFlow) {
      startRecoveryFlow();
      markRecoverySessionReady();
      emitRecoveryNavigate();
      clearPendingRecoveryIntent();
      kind = 'recovery';
    }
    return { ok: true, kind };
  }

  // 2. PKCE code (same-browser signup / native deep link)
  const code = query.get('code');
  if (code) {
    const dedupKey = `code:${code}`;
    let kind: AuthCallbackKind = treatAsRecovery ? 'recovery' : 'signup';
    if (hasSeen(dedupKey)) {
      logAuthDiagnostic('callback:dedup_code');
      return dedupResultForKind(treatAsRecovery ? 'recovery' : 'unknown');
    }
    logAuthDiagnostic('callback:pkce_verifier', { present: hasPkceCodeVerifier() });
    logAuthDiagnostic('callback:exchange_start');
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      logAuthDiagnostic('callback:exchange_error');
      if (isPkceVerifierError(error.message)) {
        return { ok: false, error: PKCE_CROSS_BROWSER_ERROR, action: 'login' };
      }
      return { ok: false, error: error.message, action: 'login' };
    }
    markSeen(dedupKey);
    logAuthDiagnostic('callback:exchange_ok');
    const rsAfter = getRecoveryState();
    if (treatAsRecovery || rsAfter.isRecoveryFlow) {
      startRecoveryFlow();
      markRecoverySessionReady();
      emitRecoveryNavigate();
      clearPendingRecoveryIntent();
      kind = 'recovery';
    }
    return { ok: true, kind };
  }

  // 3. Hash tokens fallback (implicit flow)
  const access_token = hash.get('access_token');
  const refresh_token = hash.get('refresh_token');
  if (access_token && refresh_token) {
    const dedupKey = `token:${access_token.slice(-16)}`;
    let kind: AuthCallbackKind = treatAsRecovery ? 'recovery' : 'magic_link';
    if (hasSeen(dedupKey)) {
      logAuthDiagnostic('callback:dedup_token');
      return dedupResultForKind(treatAsRecovery ? 'recovery' : 'unknown');
    }
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) {
      logAuthDiagnostic('callback:set_session_error');
      return { ok: false, error: error.message };
    }
    markSeen(dedupKey);
    logAuthDiagnostic('callback:set_session_ok');
    if (treatAsRecovery || getRecoveryState().isRecoveryFlow) {
      startRecoveryFlow();
      markRecoverySessionReady();
      emitRecoveryNavigate();
      clearPendingRecoveryIntent();
      kind = 'recovery';
    }
    return { ok: true, kind };
  }

  // 4. No auth params — common when Gmail/Safari opens pastelly.no after
  // confirm already succeeded elsewhere, or redirect stripped ?code=/#tokens.
  // Prefer an existing session; otherwise soft-prompt login (not a hard failure).
  logAuthDiagnostic('callback:no_params');
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session) {
    logAuthDiagnostic('callback:no_params_has_session');
    if (treatAsRecovery || getRecoveryState().isRecoveryFlow || hasPendingRecoveryIntent()) {
      startRecoveryFlow();
      markRecoverySessionReady();
      emitRecoveryNavigate();
      clearPendingRecoveryIntent();
      return { ok: true, kind: 'recovery' };
    }
    return { ok: true, kind: 'unknown' };
  }

  return { ok: false, error: NO_PARAMS_LOGIN_HINT, action: 'login' };
}
