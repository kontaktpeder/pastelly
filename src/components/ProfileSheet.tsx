import { useState, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { memberAccent } from '@/lib/colors';
import type { HouseholdMember, Household } from '@/hooks/useHousehold';
import type { CalendarMembership } from '@/hooks/useCurrentHouseholdContext';
import {
  CALENDAR_KINDS,
  calendarKindLabelLocalized,
  defaultShowInOtherCalendars,
  resolveCalendarKind,
  type CalendarKind,
} from '@/lib/calendarKinds';
import { setStoredActiveHouseholdId } from '@/lib/activeHousehold';
import { setWelcomeIntent } from '@/lib/welcomeIntent';
import { uploadMemberAvatar } from '@/lib/uploadMemberAvatar';
import {
  buildInviteShareText,
  buildInviteUrl,
  inviteJoinErrorKind,
  isPlausibleInviteCode,
  normalizeInviteCode,
} from '@/lib/inviteLink';
import { deleteAccount } from '@/lib/auth/deleteAccount';
import { Camera } from 'lucide-react';
import AvatarCropModal from '@/components/AvatarCropModal';
import CategoryColorSettings from '@/components/CategoryColorSettings';
import DailyDigestSettings from '@/components/DailyDigestSettings';
import { AppLocaleSettings, CalendarLocaleSettings } from '@/components/LocaleSettings';
import CenteredPopup from '@/components/CenteredPopup';
import { useLocale } from '@/hooks/useLocale';
import { defaultLocaleForKind } from '@/lib/i18n/types';
import { getMonthTheme, withAlpha } from '@/lib/monthTheme';

export type ProfileSheetMode = 'calendar' | 'account';

interface ProfileSheetProps {
  mode: ProfileSheetMode;
  household: Household;
  members: HouseholdMember[];
  currentMember: HouseholdMember;
  memberships: CalendarMembership[];
  /** Month currently open in the calendar, so settings match its color. */
  accentDate?: Date;
  onSelectCalendar: (householdId: string) => void;
  onClose: () => void;
  onSignOut: () => Promise<void>;
}

const MemberAvatar = ({ member, size = 'md' }: { member: HouseholdMember; size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = { sm: 'w-10 h-10 text-base', md: 'w-16 h-16 text-2xl', lg: 'w-20 h-20 text-3xl' };
  const accent = memberAccent(member.color_token);

  if (member.avatar_url) {
    return (
      <img
        src={member.avatar_url}
        alt={member.display_name}
        className={`${sizeClasses[size]} rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold`}
      style={{ backgroundColor: accent.fill, color: accent.text }}
    >
      {member.display_name.charAt(0)}
    </div>
  );
};

const ProfileSheet = ({
  mode,
  household,
  members,
  currentMember,
  memberships,
  accentDate,
  onSelectCalendar,
  onClose,
  onSignOut,
}: ProfileSheetProps) => {
  const { t, intlLocale } = useLocale();
  const theme = getMonthTheme(accentDate ?? new Date());
  const rule = withAlpha(theme.base, 0.4);
  const primaryStyle = { backgroundColor: theme.base, color: theme.textOnStrong };
  const fieldStyle = { borderColor: rule };
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteExpiry, setInviteExpiry] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createKind, setCreateKind] = useState<CalendarKind>('work');
  const [createName, setCreateName] = useState('Jobb');
  const [createError, setCreateError] = useState('');
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const isWorkCalendar = resolveCalendarKind(household) === 'work';
  const [workOrgId, setWorkOrgId] = useState(household.work_organization_id ?? '');
  const [workOrgError, setWorkOrgError] = useState('');
  const [workOrgSaved, setWorkOrgSaved] = useState(false);

  const saveWorkOrg = useMutation({
    mutationFn: async () => {
      const trimmed = workOrgId.trim();
      if (
        trimmed &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
      ) {
        throw new Error('invalid-work-org');
      }
      const { error } = await supabase
        .from('households')
        .update({ work_organization_id: trimmed || null })
        .eq('id', household.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setWorkOrgError('');
      setWorkOrgSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['work-org-link', household.id] });
      void queryClient.invalidateQueries({ queryKey: ['work-schedule', household.id] });
    },
    onError: (err: Error) => {
      setWorkOrgSaved(false);
      setWorkOrgError(err.message === 'invalid-work-org' ? t('profile.workOrgInvalid') : err.message);
    },
  });

  const leaveHousehold = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('leave_household', {
        p_household_id: household.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setLeaveError('');
      setShowLeaveConfirm(false);
      const remaining = memberships.filter((m) => m.household_id !== household.id);
      if (remaining[0]) {
        setStoredActiveHouseholdId(remaining[0].household_id);
        onSelectCalendar(remaining[0].household_id);
      }
      await queryClient.invalidateQueries();
      onClose();
    },
    onError: (err: any) => {
      setLeaveError(err?.message ?? 'Kunne ikke forlate kalenderen');
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      setDeleteError('');
      queryClient.clear();
      onClose();
    },
    onError: (err: any) => {
      setDeleteError(err?.message ?? 'Kunne ikke slette kontoen');
    },
  });

  const uploadAvatar = useMutation({
    mutationFn: async (blob: Blob) =>
      uploadMemberAvatar({
        householdId: household.id,
        memberId: currentMember.id,
        blob,
      }),
    onSuccess: () => {
      setUploadError('');
      setCropImageSrc(null);
      queryClient.invalidateQueries({ queryKey: ['current-household-context'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (err: any) => {
      setUploadError(err?.message ?? 'Kunne ikke laste opp bilde');
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setUploadError('Filen må være et bilde');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setUploadError('Maks 10 MB');
        return;
      }
      setUploadError('');
      const reader = new FileReader();
      reader.onload = () => setCropImageSrc(reader.result as string);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleCropDone = (blob: Blob) => {
    setCropImageSrc(null);
    uploadAvatar.mutate(blob);
  };

  const joinHousehold = useMutation({
    mutationFn: async () => {
      const code = normalizeInviteCode(joinCode);
      if (!code) throw new Error(t('onboarding.inviteCodeEmpty'));
      if (!isPlausibleInviteCode(code)) throw new Error(t('onboarding.inviteCodeFormat'));
      const { data, error } = await supabase.rpc('join_household_by_code', {
        p_invite_code: code,
        p_display_name: currentMember.display_name || t('common.me'),
        p_color_token: currentMember.color_token || 'pastel-blue',
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async (newId) => {
      setJoinError('');
      setJoinCode('');
      setShowJoin(false);
      // Refresh memberships first so the new calendar can become active immediately.
      await queryClient.invalidateQueries({ queryKey: ['current-household-context'] });
      await queryClient.invalidateQueries();
      if (newId) {
        setStoredActiveHouseholdId(newId);
        setWelcomeIntent('join', newId);
        onSelectCalendar(newId);
      }
      onClose();
    },
    onError: (err: any) => {
      const kind = inviteJoinErrorKind(err?.message);
      if (kind === 'invalid') setJoinError(t('onboarding.inviteCodeInvalid'));
      else if (kind === 'already') setJoinError(t('onboarding.inviteCodeAlready'));
      else setJoinError(err?.message ?? t('common.error'));
    },
  });

  const createCalendar = useMutation({
    mutationFn: async () => {
      const meta = CALENDAR_KINDS.find((k) => k.value === createKind)!;
      const { data, error } = await supabase.rpc('create_household_with_owner', {
        p_name: createName.trim() || meta.defaultName,
        p_display_name: currentMember.display_name || 'Meg',
        p_color_token: currentMember.color_token || 'pastel-blue',
        p_kind: createKind,
        p_show_in_other_calendars: defaultShowInOtherCalendars(createKind),
        p_locale: defaultLocaleForKind(createKind),
      } as any);
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      setCreateError('');
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: ['current-household-context'] });
      await queryClient.invalidateQueries();
      if (data?.id) {
        setStoredActiveHouseholdId(data.id);
        setWelcomeIntent('create', data.id);
        onSelectCalendar(data.id);
      }
      onClose();
    },
    onError: (err: any) => {
      setCreateError(err?.message ?? 'Kunne ikke opprette kalender');
    },
  });

  const createInvite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_household_invite', {
        p_household_id: household.id,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    onSuccess: (data) => {
      if (data) {
        setInviteCode(data.code);
        setInviteExpiry(data.expires_at);
      }
    },
  });

  const toggleShowInOther = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from('household_members')
        .update({ show_in_other_calendars: next })
        .eq('id', currentMember.id)
        .eq('user_id', currentMember.user_id);
      if (error) throw error;

      if (currentMember.role === 'owner') {
        const { error: householdError } = await supabase
          .from('households')
          .update({ show_in_other_calendars: next })
          .eq('id', household.id);
        if (householdError) throw householdError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentMember'] });
      queryClient.invalidateQueries({ queryKey: ['members', household.id] });
      queryClient.invalidateQueries({ queryKey: ['current-household-context'] });
      queryClient.invalidateQueries({ queryKey: ['overlay-events'] });
    },
  });

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(normalizeInviteCode(inviteCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleShareCode = async () => {
    if (!inviteCode) return;
    const text = buildInviteShareText(inviteCode, {
      greeting: t('welcome.inviteShareGreeting'),
      codeLabel: t('welcome.inviteShareCodeLabel'),
      linkHint: t('welcome.inviteShareLinkHint'),
    });
    try {
      if (navigator.share) {
        await navigator.share({ text, title: 'Pastelly' });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* ignore */
      }
    }
  };

  const handleSignOutClick = async () => {
    setSignOutError('');
    setIsSigningOut(true);
    try {
      await onSignOut();
    } catch (err: any) {
      setSignOutError(err?.message ?? 'Kunne ikke logge ut');
    } finally {
      setIsSigningOut(false);
    }
  };

  const isOwner = currentMember.role === 'owner';

  return (
    <>
    <CenteredPopup
      onClose={onClose}
      onExit={onClose}
      size="sheet"
      zClassName="z-[60]"
      chrome={{ paper: theme.paper, accent: theme.base }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          data-sheet-scroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-touch px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          style={{
            touchAction: 'pan-y',
            overscrollBehavior: 'contain',
            ['--sheet-accent' as string]: theme.base,
            ['--sheet-on-accent' as string]: theme.textOnStrong,
            ['--sheet-rule' as string]: rule,
          }}
        >
          {mode === 'calendar' ? (
            <div className="space-y-5 pb-2">
              <header className="pb-1">
                <p
                  className="m-0 font-calendar text-[0.68rem] font-bold uppercase leading-none tracking-[0.2em]"
                  style={{ color: theme.base }}
                >
                  {calendarKindLabelLocalized(household, t)}
                </p>
                <h2
                  className="m-0 mt-1 break-words font-calendar font-black leading-[0.9] tracking-tighter"
                  style={{ color: theme.base, fontSize: 'clamp(2.4rem, 10vw, 3.5rem)' }}
                >
                  {household.name}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('profile.thisCalendarHint', { name: household.name })}
                </p>
                <div className="mt-3 h-px w-full" style={{ backgroundColor: withAlpha(theme.base, 0.55) }} />
              </header>

              <section className="space-y-2">
                <p className="font-calendar text-[0.68rem] font-bold uppercase tracking-[0.18em]" style={{ color: theme.base }}>
                  {t('profile.members')}
                </p>
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 border-b py-3" style={{ borderColor: rule }}>
                    <MemberAvatar member={m} size="sm" />
                    <div>
                      <p className="font-medium text-base">{m.display_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {m.role === 'owner' ? t('common.owner') : t('common.member')}
                      </p>
                    </div>
                  </div>
                ))}
              </section>

              {isWorkCalendar && (
                <section className="space-y-2">
                  <p className="font-calendar text-[0.68rem] font-bold uppercase tracking-[0.18em]" style={{ color: theme.base }}>
                    {t('profile.workOrg')}
                  </p>
                  <p className="text-sm text-muted-foreground">{t('profile.workOrgHint')}</p>
                  {isOwner ? (
                    <div className="space-y-2">
                      <input
                        value={workOrgId}
                        onChange={(e) => {
                          setWorkOrgId(e.target.value);
                          setWorkOrgSaved(false);
                        }}
                        placeholder="00000000-0000-4000-8000-000000000000"
                        className="w-full rounded-lg border bg-transparent px-3 py-2.5 text-base"
                        style={fieldStyle}
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        onClick={() => saveWorkOrg.mutate()}
                        disabled={saveWorkOrg.isPending}
                        className="w-full rounded-lg py-2.5 text-base font-semibold disabled:opacity-50"
                        style={primaryStyle}
                      >
                        {saveWorkOrg.isPending ? t('common.loading') : t('common.save')}
                      </button>
                      {workOrgSaved && (
                        <p className="text-sm text-muted-foreground text-center">{t('profile.workOrgSaved')}</p>
                      )}
                      {workOrgError && (
                        <p className="text-destructive text-base text-center">{workOrgError}</p>
                      )}
                    </div>
                  ) : null}
                </section>
              )}

              <section className="space-y-3">
                <label className="flex cursor-pointer items-start gap-3 border-b py-3" style={{ borderColor: rule }}>
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-border"
                    style={{ accentColor: theme.base }}
                    checked={!!currentMember.show_in_other_calendars}
                    disabled={toggleShowInOther.isPending}
                    onChange={(e) => toggleShowInOther.mutate(e.target.checked)}
                  />
                  <span>
                    <span className="block text-base font-medium">{t('profile.showInOther')}</span>
                    <span className="block text-sm text-muted-foreground mt-0.5">
                      {t('profile.showInOtherHint', { name: household.name })}
                    </span>
                  </span>
                </label>

                <CalendarLocaleSettings
                  householdId={household.id}
                  locale={(household as any).locale}
                  canEdit={isOwner}
                />

                {isOwner && (
                  <div className="space-y-2">
                    {!inviteCode ? (
                      <button
                        onClick={() => createInvite.mutate()}
                        disabled={createInvite.isPending}
                        className="w-full rounded-lg py-3 text-base font-semibold disabled:opacity-50"
                        style={primaryStyle}
                      >
                        {createInvite.isPending ? t('onboarding.creating') : t('profile.invite')}
                      </button>
                    ) : (
                      <div className="space-y-3 border-b py-3" style={{ borderColor: rule }}>
                        <p className="text-base font-medium text-center">{t('profile.inviteCode')}</p>
                        <p className="text-2xl font-bold text-center tracking-widest select-all">{inviteCode}</p>
                        {inviteExpiry && (
                          <p className="text-sm text-muted-foreground text-center">
                            {new Date(inviteExpiry).toLocaleDateString(intlLocale)}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground text-center break-all">
                          {buildInviteUrl(inviteCode)}
                        </p>
                        <button
                          onClick={() => void handleCopyCode()}
                          className="w-full rounded-lg py-2.5 text-base font-semibold"
                          style={primaryStyle}
                        >
                          {copied ? t('profile.copied') : t('welcome.copyCode')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleShareCode()}
                          className="w-full rounded-lg border bg-transparent py-2.5 text-base font-medium"
                          style={fieldStyle}
                        >
                          {t('welcome.shareCode')}
                        </button>
                      </div>
                    )}
                    {createInvite.isError && (
                      <p className="text-destructive text-base text-center">
                        {(createInvite.error as any)?.message || t('common.error')}
                      </p>
                    )}
                  </div>
                )}
              </section>

              <section className="space-y-3 pt-1">
                <p className="font-calendar text-[0.68rem] font-bold uppercase tracking-[0.18em]" style={{ color: theme.base }}>
                  {t('profile.settingsThis')}
                </p>
                <DailyDigestSettings member={currentMember} />
                <CategoryColorSettings member={currentMember} calendarKind={household.kind} />
              </section>

              <section className="pt-1">
                {!showLeaveConfirm ? (
                  <button
                    onClick={() => { setLeaveError(''); setShowLeaveConfirm(true); }}
                    className="w-full rounded-lg border bg-transparent py-3 text-base font-medium text-foreground"
                    style={fieldStyle}
                  >
                    {t('profile.leave')}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-base font-medium text-center">
                      {t('profile.leaveConfirm', { name: household.name })}
                    </p>
                    <p className="text-sm text-muted-foreground text-center">
                      {members.length <= 1
                        ? t('profile.leaveSole')
                        : currentMember.role === 'owner'
                          ? t('profile.leaveOwner')
                          : t('profile.leaveMember')}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { setShowLeaveConfirm(false); setLeaveError(''); }}
                        disabled={leaveHousehold.isPending}
                        className="rounded-lg border bg-transparent py-2.5 text-base font-medium disabled:opacity-50"
                        style={fieldStyle}
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={() => leaveHousehold.mutate()}
                        disabled={leaveHousehold.isPending}
                        className="rounded-xl bg-destructive py-2.5 text-base font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {leaveHousehold.isPending ? t('profile.leaving') : t('profile.leaveYes')}
                      </button>
                    </div>
                    {leaveError && (
                      <p className="text-destructive text-base text-center">{leaveError}</p>
                    )}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="space-y-5 pb-2">
              <section>
                <p
                  className="m-0 font-calendar text-[0.68rem] font-bold uppercase leading-none tracking-[0.2em]"
                  style={{ color: theme.base }}
                >
                  {t('profile.account')}
                </p>
                <div className="mt-3 flex items-end gap-4">
                  <div className="relative shrink-0">
                    <MemberAvatar member={currentMember} size="lg" />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadAvatar.isPending}
                      className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-50"
                      style={primaryStyle}
                    >
                      {uploadAvatar.isPending ? (
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <Camera size={15} strokeWidth={2.5} />
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                  <h2
                    className="m-0 min-w-0 flex-1 break-words font-calendar font-black leading-[0.9] tracking-tighter"
                    style={{ color: theme.base, fontSize: 'clamp(2.2rem, 9vw, 3.25rem)' }}
                  >
                    {currentMember.display_name}
                  </h2>
                </div>
                {uploadError && (
                  <p className="mt-2 text-sm text-destructive">{uploadError}</p>
                )}
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('profile.avatarHint')}
                </p>
                <div className="mt-3 h-px w-full" style={{ backgroundColor: withAlpha(theme.base, 0.55) }} />
              </section>

              <section className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t('profile.accountHint')}
                </p>

                <AppLocaleSettings />

                {!showCreate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(true);
                      setShowJoin(false);
                      setCreateError('');
                      setCreateKind('work');
                      setCreateName('Jobb');
                    }}
                    className="w-full rounded-lg border bg-transparent py-3 text-base font-medium text-foreground"
                    style={fieldStyle}
                  >
                    {t('profile.createCalendar')}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {CALENDAR_KINDS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setCreateKind(opt.value);
                            setCreateName(opt.defaultName);
                          }}
                          className="rounded-lg p-2.5 text-base font-semibold"
                          style={
                            createKind === opt.value
                              ? { backgroundColor: withAlpha(theme.base, 0.16), boxShadow: `inset 0 0 0 2px ${theme.base}`, color: theme.base }
                              : { boxShadow: `inset 0 0 0 1px ${rule}` }
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <input
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder={t('profile.calendarName')}
                      className="w-full rounded-lg border bg-transparent px-4 py-3 text-base focus:outline-none"
                      style={fieldStyle}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowCreate(false); setCreateError(''); }}
                        className="rounded-lg border bg-transparent py-2.5 text-base font-medium"
                        style={fieldStyle}
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => createCalendar.mutate()}
                        disabled={createCalendar.isPending}
                        className="rounded-lg py-2.5 text-base font-semibold disabled:opacity-50"
                        style={primaryStyle}
                      >
                        {createCalendar.isPending ? t('onboarding.creating') : t('profile.create')}
                      </button>
                    </div>
                    {createError && (
                      <p className="text-destructive text-base text-center">{createError}</p>
                    )}
                  </div>
                )}

                {!showJoin ? (
                  <button
                    type="button"
                    onClick={() => { setShowJoin(true); setShowCreate(false); setJoinError(''); }}
                    className="w-full rounded-lg border bg-transparent py-3 text-base font-medium text-foreground"
                    style={fieldStyle}
                  >
                    {t('profile.joinCalendar')}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(normalizeInviteCode(e.target.value))}
                      placeholder="AB12-CD34"
                      autoComplete="off"
                      className="w-full rounded-lg border bg-transparent px-4 py-3 font-mono text-base tracking-widest focus:outline-none"
                      style={fieldStyle}
                    />
                    <p className="text-sm text-muted-foreground">{t('onboarding.inviteCodeHint')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowJoin(false); setJoinCode(''); setJoinError(''); }}
                        className="rounded-lg border bg-transparent py-2.5 text-base font-medium"
                        style={fieldStyle}
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setJoinError(''); joinHousehold.mutate(); }}
                        disabled={joinHousehold.isPending}
                        className="rounded-lg py-2.5 text-base font-semibold disabled:opacity-50"
                        style={primaryStyle}
                      >
                        {joinHousehold.isPending ? t('onboarding.joining') : t('onboarding.joinCta')}
                      </button>
                    </div>
                    {joinError && (
                      <p className="text-destructive text-base text-center">{joinError}</p>
                    )}
                  </div>
                )}

                <div className="space-y-3 border-t pt-2" style={{ borderColor: rule }}>
                  <button
                    onClick={handleSignOutClick}
                    disabled={isSigningOut}
                    className="w-full rounded-lg border bg-transparent py-3 text-base font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    style={fieldStyle}
                  >
                    {isSigningOut ? t('profile.signingOut') : t('profile.signOut')}
                  </button>
                  {signOutError && (
                    <p className="text-destructive text-base text-center">{signOutError}</p>
                  )}
                </div>

                <div className="border-t pt-2" style={{ borderColor: rule }}>
                  {!showDeleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => { setDeleteError(''); setShowDeleteConfirm(true); }}
                      className="w-full rounded-xl py-2.5 text-base font-medium text-destructive underline underline-offset-2"
                    >
                      {t('profile.deleteAccount')}
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-base font-medium text-center">
                        {t('profile.deleteAccountConfirm')}
                      </p>
                      <p className="text-sm text-muted-foreground text-center">
                        {t('profile.deleteAccountHint')}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowDeleteConfirm(false); setDeleteError(''); }}
                          disabled={deleteAccountMutation.isPending}
                          className="rounded-lg border bg-transparent py-2.5 text-base font-medium disabled:opacity-50"
                          style={fieldStyle}
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAccountMutation.mutate()}
                          disabled={deleteAccountMutation.isPending}
                          className="rounded-xl bg-destructive py-2.5 text-base font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {deleteAccountMutation.isPending
                            ? t('profile.deletingAccount')
                            : t('profile.deleteAccountYes')}
                        </button>
                      </div>
                      {deleteError && (
                        <p className="text-destructive text-base text-center">{deleteError}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-1 space-y-3 text-center text-sm text-muted-foreground">
                  <a
                    href="https://pastelly.no/personvern"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {t('profile.privacy')}
                  </a>
                  <p>Pastelly v{import.meta.env.VITE_APP_VERSION ?? '1.0.0'}</p>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {cropImageSrc && (
          <AvatarCropModal
            imageSrc={cropImageSrc}
            onCropDone={handleCropDone}
            onCancel={() => setCropImageSrc(null)}
          />
        )}
      </AnimatePresence>
    </CenteredPopup>
    </>
  );
};

export default ProfileSheet;
