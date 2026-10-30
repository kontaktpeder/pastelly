import { useEffect, useRef, useState } from 'react';
import { scrollFocusIntoView } from '@/lib/scrollFocusIntoView';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { COLOR_TOKEN_OPTIONS, memberAccent } from '@/lib/colors';
import {
  CALENDAR_KINDS,
  defaultShowInOtherCalendars,
  type CalendarKind,
} from '@/lib/calendarKinds';
import { setStoredActiveHouseholdId } from '@/lib/activeHousehold';
import { setWelcomeIntent } from '@/lib/welcomeIntent';
import { defaultLocaleForKind } from '@/lib/i18n/types';
import {
  clearPendingInviteCode,
  extractInviteCodeFromText,
  inviteJoinErrorKind,
  isPlausibleInviteCode,
  normalizeInviteCode,
  peekPendingInviteCode,
} from '@/lib/inviteLink';
import { getCurrentMemberId, uploadMemberAvatar } from '@/lib/uploadMemberAvatar';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from '@/hooks/useLocale';
import KeyboardAwareScreen from '@/components/KeyboardAwareScreen';
import AvatarCropModal from '@/components/AvatarCropModal';

interface OnboardingPageProps {
  onComplete: () => void;
}

const colorMap: Record<string, string> = {
  'pastel-blue': 'bg-member-blue',
  'pastel-peach': 'bg-member-peach',
  'pastel-lavender': 'bg-member-lavender',
  'pastel-mint': 'bg-member-mint',
  'pastel-rose': 'bg-member-rose',
  'pastel-yellow': 'bg-member-yellow',
};

type Mode = 'create' | 'join';

const OnboardingPage = ({ onComplete }: OnboardingPageProps) => {
  const { t, appLocale, setAppLocale } = useLocale();
  const { signOut } = useAuth();
  const pendingInvite = peekPendingInviteCode();
  const [mode, setMode] = useState<Mode>(() => (pendingInvite ? 'join' : 'create'));
  const [displayName, setDisplayName] = useState('');
  const [kind, setKind] = useState<CalendarKind>('home');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState(() => pendingInvite ?? '');
  const [colorToken, setColorToken] = useState('pastel-blue');
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [pasteHint, setPasteHint] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const code = peekPendingInviteCode();
    if (!code) return;
    setInviteCode(code);
    setMode('join');
  }, []);

  const defaultName =
    kind === 'work' ? t('kind.workDefaultName') : t('kind.homeDefaultName');

  const createHousehold = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_household_with_owner', {
        p_name: householdName || defaultName,
        p_display_name: displayName || t('common.me'),
        p_color_token: colorToken,
        p_kind: kind,
        p_show_in_other_calendars: defaultShowInOtherCalendars(kind),
        p_locale: defaultLocaleForKind(kind),
      } as any);
      if (error) throw error;
      return data as { id: string };
    },
  });

  const joinHousehold = useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('join_household_by_code', {
        p_invite_code: code,
        p_display_name: displayName || t('common.me'),
        p_color_token: colorToken,
      });
      if (error) throw error;
      return data as string;
    },
  });

  const isPending = createHousehold.isPending || joinHousehold.isPending;

  const maybeUploadAvatar = async (householdId: string) => {
    if (!avatarBlob) return;
    const memberId = await getCurrentMemberId(householdId);
    if (!memberId) return;
    await uploadMemberAvatar({
      householdId,
      memberId,
      blob: avatarBlob,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError(t('onboarding.photoInvalid'));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(t('onboarding.photoTooLarge'));
        return;
      }
      setError('');
      const reader = new FileReader();
      reader.onload = () => setCropImageSrc(reader.result as string);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleCropDone = (blob: Blob) => {
    setCropImageSrc(null);
    setAvatarBlob(blob);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(URL.createObjectURL(blob));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      let householdId: string | null = null;
      if (mode === 'create') {
        const data = await createHousehold.mutateAsync();
        householdId = data?.id ?? null;
      } else {
        const code = normalizeInviteCode(inviteCode);
        if (!code) {
          setError(t('onboarding.inviteCodeEmpty'));
          return;
        }
        if (!isPlausibleInviteCode(code)) {
          setError(t('onboarding.inviteCodeFormat'));
          return;
        }
        setInviteCode(code);
        householdId = await joinHousehold.mutateAsync(code);
      }
      if (householdId) {
        setStoredActiveHouseholdId(householdId);
        setWelcomeIntent(mode === 'create' ? 'create' : 'join', householdId);
        // Consumed on join, abandoned on create — either way it must not
        // resurface for the next onboarding or account on this device.
        clearPendingInviteCode();
        try {
          await maybeUploadAvatar(householdId);
        } catch {
          /* avatar is optional — profile can set it later */
        }
      }
      onComplete();
    } catch (err: any) {
      if (mode === 'join') {
        const kind = inviteJoinErrorKind(err?.message);
        if (kind === 'invalid') setError(t('onboarding.inviteCodeInvalid'));
        else if (kind === 'already') setError(t('onboarding.inviteCodeAlready'));
        else if (kind === 'format') setError(t('onboarding.inviteCodeFormat'));
        else setError(err?.message || t('common.error'));
      } else {
        setError(err?.message || t('common.error'));
      }
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setError('');
    try {
      await signOut();
    } catch (err: any) {
      setError(err.message || t('common.error'));
      setSigningOut(false);
    }
  };

  return (
    <>
      <KeyboardAwareScreen
        asForm
        onSubmit={handleSubmit}
        contentClassName="pb-6"
        footer={
          <div className="space-y-3">
            <button type="submit" disabled={isPending || signingOut}
              className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition-colors active:opacity-90 disabled:opacity-50">
              {isPending
                ? (mode === 'create' ? t('onboarding.creating') : t('onboarding.joining'))
                : (mode === 'create' ? t('onboarding.start') : t('onboarding.joinCta'))}
            </button>
            <p className="text-center text-xs text-muted-foreground">{t('onboarding.signOutHint')}</p>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isPending || signingOut}
              className="w-full rounded-xl py-2.5 text-sm font-medium text-muted-foreground underline underline-offset-2 disabled:opacity-50"
            >
              {signingOut ? t('profile.signingOut') : t('onboarding.signOut')}
            </button>
          </div>
        }
      >
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm mx-auto">
          <h1 className="text-3xl font-bold text-center mb-2">{t('onboarding.welcome')}</h1>
          <p className="text-muted-foreground text-center mb-6">{t('onboarding.subtitle')}</p>

          <div className="mb-5 flex flex-col items-center">
            <div className="relative w-24 h-24 mb-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-full h-full rounded-full overflow-hidden transition-all ${
                  avatarPreview ? 'ring-2 ring-foreground ring-offset-2' : ''
                }`}
                style={
                  avatarPreview
                    ? undefined
                    : {
                        backgroundColor: memberAccent(colorToken).fill,
                        color: memberAccent(colorToken).text,
                      }
                }
                aria-label={t('onboarding.addPhoto')}
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-2xl font-semibold">
                    {(displayName.trim()[0] || '?').toUpperCase()}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md"
                aria-label={t('onboarding.addPhoto')}
              >
                <Camera size={15} strokeWidth={2.5} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">{t('onboarding.photoHint')}</p>
          </div>

          <div className="mb-5 space-y-2">
            <label className="text-sm font-medium block">{t('locale.app')}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['nb', 'en'] as const).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => void setAppLocale(loc)}
                  className={`rounded-xl py-2.5 text-sm font-semibold transition-all ${
                    appLocale === loc ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted'
                  }`}
                >
                  {t(loc === 'nb' ? 'locale.nb' : 'locale.en')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex rounded-xl bg-muted p-1 mb-6">
            <button type="button" onClick={() => { setMode('create'); setError(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === 'create' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
              {t('onboarding.create')}
            </button>
            <button type="button" onClick={() => { setMode('join'); setError(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === 'join' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
              {t('onboarding.join')}
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium mb-2 block">{t('onboarding.yourName')}</label>
              <input type="text" onFocus={scrollFocusIntoView} value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Peder"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            {mode === 'create' ? (
              <>
                <div>
                  <label className="text-sm font-medium mb-2 block">{t('onboarding.type')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {CALENDAR_KINDS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setKind(opt.value);
                          if (!householdName || CALENDAR_KINDS.some((k) => k.defaultName === householdName)) {
                            setHouseholdName(
                              opt.value === 'work' ? t('kind.workDefaultName') : t('kind.homeDefaultName'),
                            );
                          }
                        }}
                        className={`rounded-xl p-3 text-left transition-all ${
                          kind === opt.value
                            ? 'bg-primary/20 ring-2 ring-primary'
                            : 'bg-muted hover:bg-muted/80'
                        }`}
                      >
                        <p className="font-semibold text-sm">
                          {opt.value === 'work' ? t('kind.work') : t('kind.home')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {opt.value === 'work' ? t('kind.workDesc') : t('kind.homeDesc')}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    {kind === 'work' ? t('onboarding.workName') : t('onboarding.homeName')}
                  </label>
                  <input type="text" onFocus={scrollFocusIntoView} value={householdName} onChange={(e) => setHouseholdName(e.target.value)}
                    placeholder={defaultName}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="text-sm font-medium block">{t('onboarding.inviteCode')}</label>
                  <button
                    type="button"
                    onClick={async () => {
                      setPasteHint('');
                      try {
                        const text = await navigator.clipboard.readText();
                        const next = extractInviteCodeFromText(text);
                        if (!next) {
                          setPasteHint(t('onboarding.pasteEmpty'));
                          return;
                        }
                        setInviteCode(next);
                        setError('');
                        setPasteHint(t('onboarding.pasted'));
                      } catch {
                        setPasteHint(t('onboarding.pasteFailed'));
                      }
                    }}
                    className="text-xs font-semibold text-primary underline underline-offset-2"
                  >
                    {t('onboarding.paste')}
                  </button>
                </div>
                <input
                  type="text"
                  onFocus={scrollFocusIntoView}
                  value={inviteCode}
                  onChange={(e) => setInviteCode(normalizeInviteCode(e.target.value))}
                  placeholder="AB12-CD34"
                  autoComplete="off"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {pasteHint && (
                  <p className="text-xs text-muted-foreground mt-1.5">{pasteHint}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1.5">{t('onboarding.inviteCodeHint')}</p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-3 block">{t('onboarding.pickColor')}</label>
              <div className="flex gap-3 justify-center">
                {COLOR_TOKEN_OPTIONS.map((token) => (
                  <button key={token} type="button" onClick={() => setColorToken(token)}
                    className={`w-12 h-12 rounded-full ${colorMap[token]} transition-all ${
                      colorToken === token ? 'ring-2 ring-foreground ring-offset-2 scale-110' : 'hover:scale-105'
                    }`} />
                ))}
              </div>
            </div>

            {error && <p className="text-destructive text-sm text-center">{error}</p>}
          </div>
        </motion.div>
      </KeyboardAwareScreen>

      {cropImageSrc && (
        <AvatarCropModal
          imageSrc={cropImageSrc}
          onCropDone={handleCropDone}
          onCancel={() => setCropImageSrc(null)}
        />
      )}
    </>
  );
};

export default OnboardingPage;
