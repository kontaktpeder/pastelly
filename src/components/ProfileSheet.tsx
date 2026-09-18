import { useState, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getMemberColor } from '@/lib/colors';
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
import { CountdownDigits } from '@/components/CountdownDigits';
import CountdownDetailSheet from '@/components/CountdownDetailSheet';
import NewCountdownFlow from '@/components/NewCountdownFlow';
import { useActiveCountdowns, type CountdownWithParticipants } from '@/hooks/useCountdowns';
import { useLocale } from '@/hooks/useLocale';
import { defaultLocaleForKind } from '@/lib/i18n/types';
import VacationModeToggle from '@/components/VacationModeToggle';
import { loadLocalJson, mergeCountdownVacation, parseStoredCountdownVacation, periodStorageKey } from '@/lib/vacationMode';

export type ProfileSheetMode = 'calendar' | 'account';

interface ProfileSheetProps {
  mode: ProfileSheetMode;
  household: Household;
  members: HouseholdMember[];
  currentMember: HouseholdMember;
  memberships: CalendarMembership[];
  onSelectCalendar: (householdId: string) => void;
  onClose: () => void;
  onSignOut: () => Promise<void>;
}

const MemberAvatar = ({ member, size = 'md' }: { member: HouseholdMember; size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = { sm: 'w-10 h-10 text-sm', md: 'w-16 h-16 text-2xl', lg: 'w-20 h-20 text-3xl' };
  const color = getMemberColor(member.color_token);

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
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold ${color.bg}`}
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
  onSelectCalendar,
  onClose,
  onSignOut,
}: ProfileSheetProps) => {
  const { t, intlLocale } = useLocale();
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
  const [showNewCountdown, setShowNewCountdown] = useState(false);
  const [selectedCountdown, setSelectedCountdown] = useState<CountdownWithParticipants | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { data: activeCountdowns = [] } = useActiveCountdowns(household.id);
  const isHomeCalendar = resolveCalendarKind(household) === 'home';

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

  const countdownSection = isHomeCalendar ? (
    <section className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
        {t('countdown.profileSection')}
      </p>
      {activeCountdowns.length === 0 ? (
        <p className="text-sm text-muted-foreground px-0.5">
          {t('countdown.profileEmpty')}
        </p>
      ) : (
        activeCountdowns.map((cd) => {
          const merged = mergeCountdownVacation(
            cd,
            parseStoredCountdownVacation(loadLocalJson(periodStorageKey(cd.id))),
          );
          return (
          <button
            key={cd.id}
            type="button"
            onClick={() => setSelectedCountdown(cd)}
            className="w-full text-left"
          >
            <CountdownDigits
              targetAt={merged.target_at}
              themeId={cd.theme}
              emoji={cd.emoji}
              title={cd.title}
              compact
              endsAt={merged.ends_at}
              useVacationMode={!!merged.use_vacation_mode}
              timeZone={merged.timezone}
            />
          </button>
          );
        })
      )}
      <button
        type="button"
        onClick={() => setShowNewCountdown(true)}
        className="w-full rounded-2xl bg-pink-100 text-pink-900 py-3.5 text-sm font-semibold"
      >
        {t('countdown.new')}
      </button>
    </section>
  ) : null;

  return (
    <>
    <CenteredPopup
      onClose={onClose}
      onExit={onClose}
      size="sheet"
      zClassName="z-[60]"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          data-sheet-scroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-touch px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        >
          {mode === 'calendar' ? (
            <div className="space-y-4 pt-2 pb-2">
              <header className="text-center pb-1">
                <h2 className="text-xl font-bold tracking-tight">{household.name}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {calendarKindLabelLocalized(household, t)}
                </p>
                <p className="text-xs text-muted-foreground/80 mt-1.5">
                  {t('profile.thisCalendarHint', { name: household.name })}
                </p>
              </header>

              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
                  {t('profile.members')}
                </p>
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                    <MemberAvatar member={m} size="sm" />
                    <div>
                      <p className="font-medium text-sm">{m.display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.role === 'owner' ? t('common.owner') : t('common.member')}
                      </p>
                    </div>
                  </div>
                ))}
              </section>

              {countdownSection}

              {isHomeCalendar && (
                <section className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
                    {t('vacation.mode')}
                  </p>
                  <VacationModeToggle />
                </section>
              )}

              <section className="space-y-3">
                <label className="flex items-start gap-3 rounded-xl bg-muted/40 p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-border"
                    checked={!!currentMember.show_in_other_calendars}
                    disabled={toggleShowInOther.isPending}
                    onChange={(e) => toggleShowInOther.mutate(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium">{t('profile.showInOther')}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
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
                        className="w-full rounded-xl bg-calendar-accent/60 py-3 text-sm font-medium transition-colors hover:bg-calendar-accent/80 disabled:opacity-50"
                      >
                        {createInvite.isPending ? t('onboarding.creating') : t('profile.invite')}
                      </button>
                    ) : (
                      <div className="rounded-xl bg-muted/40 p-4 space-y-3">
                        <p className="text-sm font-medium text-center">{t('profile.inviteCode')}</p>
                        <p className="text-2xl font-bold text-center tracking-widest select-all">{inviteCode}</p>
                        {inviteExpiry && (
                          <p className="text-xs text-muted-foreground text-center">
                            {new Date(inviteExpiry).toLocaleDateString(intlLocale)}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground text-center break-all">
                          {buildInviteUrl(inviteCode)}
                        </p>
                        <button
                          onClick={() => void handleCopyCode()}
                          className="w-full rounded-xl bg-calendar-accent/60 py-2.5 text-sm font-medium transition-colors hover:bg-calendar-accent/80"
                        >
                          {copied ? t('profile.copied') : t('welcome.copyCode')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleShareCode()}
                          className="w-full rounded-xl bg-muted py-2.5 text-sm font-medium transition-colors hover:bg-muted/80"
                        >
                          {t('welcome.shareCode')}
                        </button>
                      </div>
                    )}
                    {createInvite.isError && (
                      <p className="text-destructive text-sm text-center">
                        {(createInvite.error as any)?.message || t('common.error')}
                      </p>
                    )}
                  </div>
                )}
              </section>

              <section className="space-y-3 pt-1 border-t border-border/50">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
                  {t('profile.settingsThis')}
                </p>
                <DailyDigestSettings member={currentMember} />
                <CategoryColorSettings member={currentMember} calendarKind={household.kind} />
              </section>

              <section className="pt-1">
                {!showLeaveConfirm ? (
                  <button
                    onClick={() => { setLeaveError(''); setShowLeaveConfirm(true); }}
                    className="w-full rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                  >
                    {t('profile.leave')}
                  </button>
                ) : (
                  <div className="rounded-xl bg-muted p-4 space-y-3">
                    <p className="text-sm font-medium text-center">
                      {t('profile.leaveConfirm', { name: household.name })}
                    </p>
                    <p className="text-xs text-muted-foreground text-center">
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
                        className="rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-background transition-colors disabled:opacity-50"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={() => leaveHousehold.mutate()}
                        disabled={leaveHousehold.isPending}
                        className="rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {leaveHousehold.isPending ? t('profile.leaving') : t('profile.leaveYes')}
                      </button>
                    </div>
                    {leaveError && (
                      <p className="text-destructive text-sm text-center">{leaveError}</p>
                    )}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="space-y-4 pt-2 pb-2">
              <section className="shrink-0 text-center pb-2">
                <div className="relative w-20 h-20 mx-auto mb-3">
                  <MemberAvatar member={currentMember} size="lg" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadAvatar.isPending}
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md transition-transform hover:scale-110 disabled:opacity-50"
                  >
                    {uploadAvatar.isPending ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
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
                {uploadError && (
                  <p className="text-destructive text-xs mb-2">{uploadError}</p>
                )}
                <h2 className="text-2xl font-bold">{currentMember.display_name}</h2>
                <p className="text-xs text-muted-foreground/80 mt-1.5">
                  {t('profile.avatarHint')}
                </p>
              </section>

              {countdownSection}

              <section className="space-y-3 rounded-2xl bg-muted/40 px-4 py-4">
                <p className="text-xs text-muted-foreground px-0.5 -mt-1">
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
                    className="w-full rounded-xl border border-border bg-background py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                  >
                    {t('profile.createCalendar')}
                  </button>
                ) : (
                  <div className="rounded-xl bg-background p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {CALENDAR_KINDS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setCreateKind(opt.value);
                            setCreateName(opt.defaultName);
                          }}
                          className={`rounded-xl p-2.5 text-sm font-semibold ${
                            createKind === opt.value ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <input
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder={t('profile.calendarName')}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowCreate(false); setCreateError(''); }}
                        className="rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => createCalendar.mutate()}
                        disabled={createCalendar.isPending}
                        className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {createCalendar.isPending ? t('onboarding.creating') : t('profile.create')}
                      </button>
                    </div>
                    {createError && (
                      <p className="text-destructive text-sm text-center">{createError}</p>
                    )}
                  </div>
                )}

                {!showJoin ? (
                  <button
                    type="button"
                    onClick={() => { setShowJoin(true); setShowCreate(false); setJoinError(''); }}
                    className="w-full rounded-xl border border-border bg-background py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                  >
                    {t('profile.joinCalendar')}
                  </button>
                ) : (
                  <div className="rounded-xl bg-background p-4 space-y-3">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(normalizeInviteCode(e.target.value))}
                      placeholder="AB12-CD34"
                      autoComplete="off"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-xs text-muted-foreground">{t('onboarding.inviteCodeHint')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowJoin(false); setJoinCode(''); setJoinError(''); }}
                        className="rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setJoinError(''); joinHousehold.mutate(); }}
                        disabled={joinHousehold.isPending}
                        className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {joinHousehold.isPending ? t('onboarding.joining') : t('onboarding.joinCta')}
                      </button>
                    </div>
                    {joinError && (
                      <p className="text-destructive text-sm text-center">{joinError}</p>
                    )}
                  </div>
                )}

                <div className="pt-2 space-y-3 border-t border-border/50">
                  <button
                    onClick={handleSignOutClick}
                    disabled={isSigningOut}
                    className="w-full rounded-xl border border-border bg-background py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSigningOut ? t('profile.signingOut') : t('profile.signOut')}
                  </button>
                  {signOutError && (
                    <p className="text-destructive text-sm text-center">{signOutError}</p>
                  )}
                </div>

                <div className="pt-2 border-t border-border/50">
                  {!showDeleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => { setDeleteError(''); setShowDeleteConfirm(true); }}
                      className="w-full rounded-xl py-2.5 text-sm font-medium text-destructive underline underline-offset-2"
                    >
                      {t('profile.deleteAccount')}
                    </button>
                  ) : (
                    <div className="rounded-xl bg-muted p-4 space-y-3">
                      <p className="text-sm font-medium text-center">
                        {t('profile.deleteAccountConfirm')}
                      </p>
                      <p className="text-xs text-muted-foreground text-center">
                        {t('profile.deleteAccountHint')}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowDeleteConfirm(false); setDeleteError(''); }}
                          disabled={deleteAccountMutation.isPending}
                          className="rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-background transition-colors disabled:opacity-50"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAccountMutation.mutate()}
                          disabled={deleteAccountMutation.isPending}
                          className="rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {deleteAccountMutation.isPending
                            ? t('profile.deletingAccount')
                            : t('profile.deleteAccountYes')}
                        </button>
                      </div>
                      {deleteError && (
                        <p className="text-destructive text-sm text-center">{deleteError}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-1 space-y-3 text-center text-xs text-muted-foreground">
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

    <AnimatePresence>
      {showNewCountdown && (
        <NewCountdownFlow
          householdId={household.id}
          members={members}
          currentMemberId={currentMember.id}
          onClose={() => setShowNewCountdown(false)}
        />
      )}
    </AnimatePresence>

    <AnimatePresence>
      {selectedCountdown && (
        <CountdownDetailSheet
          countdown={
            activeCountdowns.find((c) => c.id === selectedCountdown.id) ?? selectedCountdown
          }
          members={members}
          currentMemberId={currentMember.id}
          onClose={() => setSelectedCountdown(null)}
        />
      )}
    </AnimatePresence>
    </>
  );
};

export default ProfileSheet;
