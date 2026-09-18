import { useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  useRespondToCountdown,
  useInviteToCountdown,
  useCancelCountdown,
  useUpdateCountdown,
  myParticipant,
  type CountdownWithParticipants,
} from '@/hooks/useCountdowns';
import { loadLocalJson, mergeCountdownVacation, parseStoredCountdownVacation, periodStorageKey } from '@/lib/vacationMode';
import { zonedDateAndTimeToIso, VACATION_TIME_ZONES, resolveTimeZone, DEFAULT_TIME_ZONE } from '@/lib/timeZone';
import { getIntlLocale } from '@/lib/i18n';
import { getMemberColor } from '@/lib/colors';
import type { HouseholdMember } from '@/hooks/useHousehold';
import { useLocale } from '@/hooks/useLocale';
import CenteredPopup from '@/components/CenteredPopup';
import PopupStickyFooter from '@/components/PopupStickyFooter';
import { CountdownDigits } from '@/components/CountdownDigits';
import CountdownCelebrateDialog from '@/components/CountdownCelebrateDialog';

interface CountdownDetailSheetProps {
  countdown: CountdownWithParticipants;
  members: HouseholdMember[];
  currentMemberId: string;
  onClose: () => void;
}

const CountdownDetailSheet = ({
  countdown,
  members,
  currentMemberId,
  onClose,
}: CountdownDetailSheetProps) => {
  const { t, dateLocale, locale } = useLocale();
  const respond = useRespondToCountdown();
  const invite = useInviteToCountdown();
  const cancel = useCancelCountdown();
  const updateCountdown = useUpdateCountdown();
  const merged = mergeCountdownVacation(
    countdown,
    parseStoredCountdownVacation(loadLocalJson(periodStorageKey(countdown.id))),
  );
  const [showInvite, setShowInvite] = useState(false);
  const [celebrateJoined, setCelebrateJoined] = useState(false);
  const [editingDates, setEditingDates] = useState(false);
  const start = new Date(merged.target_at);
  const [editDate, setEditDate] = useState(start);
  const [editTime, setEditTime] = useState(
    `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
  );
  const initialEnd = merged.ends_at ? new Date(merged.ends_at) : null;
  const [editEndDate, setEditEndDate] = useState<Date | null>(initialEnd);
  const [editEndTime, setEditEndTime] = useState(
    initialEnd
      ? `${String(initialEnd.getHours()).padStart(2, '0')}:${String(initialEnd.getMinutes()).padStart(2, '0')}`
      : '23:59',
  );
  const [editVacation, setEditVacation] = useState(!!merged.use_vacation_mode);
  const [editTz, setEditTz] = useState(resolveTimeZone(merged.timezone || DEFAULT_TIME_ZONE));

  const mine = myParticipant(countdown, currentMemberId);
  const isCreator = countdown.created_by_member_id === currentMemberId;
  const isJoined = mine?.status === 'joined' || celebrateJoined;
  const isInvited = mine?.status === 'invited' && !celebrateJoined;

  const getMember = (id: string) => members.find((m) => m.id === id);
  const creator = getMember(countdown.created_by_member_id);
  const target = new Date(countdown.target_at);

  const handleAccept = async () => {
    try {
      await respond.mutateAsync({
        countdownId: countdown.id,
        accept: true,
        householdId: countdown.household_id,
        title: countdown.title,
        targetAt: countdown.target_at,
        creatorUserId: creator?.user_id,
      });
      setCelebrateJoined(true);
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'));
    }
  };

  const handleDecline = async () => {
    try {
      await respond.mutateAsync({
        countdownId: countdown.id,
        accept: false,
        householdId: countdown.household_id,
        title: countdown.title,
        targetAt: countdown.target_at,
      });
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'));
    }
  };

  const handleCancel = async () => {
    if (!window.confirm(t('countdown.cancelConfirm'))) return;
    try {
      await cancel.mutateAsync(countdown.id);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'));
    }
  };

  const handleSaveDates = async () => {
    const targetAt = zonedDateAndTimeToIso(editDate, editTime, editTz);
    const endsAt = editEndDate ? zonedDateAndTimeToIso(editEndDate, editEndTime || '23:59', editTz) : null;
    if (endsAt && new Date(endsAt).getTime() <= new Date(targetAt).getTime()) {
      toast.error(t('countdown.futureRequired'));
      return;
    }
    try {
      await updateCountdown.mutateAsync({
        countdownId: countdown.id,
        target_at: targetAt,
        ends_at: endsAt,
        clear_ends_at: !endsAt,
        use_vacation_mode: editVacation,
        timezone: editTz,
      });
      setEditingDates(false);
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'));
    }
  };

  const inviteable = members.filter((m) => {
    if (m.id === currentMemberId) return false;
    const p = countdown.countdown_participants.find((x) => x.member_id === m.id);
    return !p || p.status === 'declined';
  });

  const handleInvite = async (memberId: string) => {
    const m = getMember(memberId);
    if (!m) return;
    try {
      await invite.mutateAsync({
        countdownId: countdown.id,
        memberIds: [memberId],
        householdId: countdown.household_id,
        title: countdown.title,
        targetAt: countdown.target_at,
        inviteUserIds: m.user_id ? [m.user_id] : [],
      });
      setShowInvite(false);
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'));
    }
  };

  if (celebrateJoined) {
    return (
      <CountdownCelebrateDialog
        title={t('countdown.joinedTitle')}
        body={t('countdown.joinedBody', { title: countdown.title })}
        emoji={countdown.emoji}
        themeId={countdown.theme}
        targetAt={countdown.target_at}
        onClose={onClose}
      />
    );
  }

  return (
    <CenteredPopup
      onClose={onClose}
      onExit={onClose}
      size="sheet"
      detents={['half', 'full']}
      initialDetent="half"
      zClassName="z-[70]"
    >
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-touch px-5 pb-4"
        data-sheet-scroll
      >
        <CountdownDigits
          targetAt={merged.target_at}
          themeId={countdown.theme}
          emoji={countdown.emoji}
          title={countdown.title}
          endsAt={merged.ends_at}
          useVacationMode={!!merged.use_vacation_mode}
          timeZone={merged.timezone}
        />

        <p id="countdown-detail-title" className="sr-only">
          {countdown.title}
        </p>

        <p className="text-sm text-muted-foreground mt-4 capitalize text-center">
          {format(target, 'EEEE d. MMMM · HH:mm', { locale: dateLocale })}
          {merged.ends_at
            ? ` – ${format(new Date(merged.ends_at), 'EEEE d. MMMM · HH:mm', { locale: dateLocale })}`
            : ''}
        </p>

        {isCreator && countdown.status === 'active' && (
          <div className="mt-4 space-y-3">
            {!editingDates ? (
              <button
                type="button"
                onClick={() => setEditingDates(true)}
                className="w-full text-sm font-semibold text-foreground underline underline-offset-2"
              >
                {t('countdown.editDates')}
              </button>
            ) : (
              <div className="space-y-2 rounded-2xl bg-muted/60 p-3 text-left">
                <label className="block text-xs font-medium">{t('event.date')}
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={format(editDate, 'yyyy-MM-dd')}
                    onChange={(e) => {
                      const [y, m, d] = e.target.value.split('-').map(Number);
                      if (y && m && d) setEditDate(new Date(y, m - 1, d));
                    }}
                  />
                </label>
                <label className="block text-xs font-medium">{t('event.clock')}
                  <input
                    type="time"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-medium">{t('countdown.endDate')}
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={editEndDate ? format(editEndDate, 'yyyy-MM-dd') : ''}
                    onChange={(e) => {
                      if (!e.target.value) {
                        setEditEndDate(null);
                        return;
                      }
                      const [y, m, d] = e.target.value.split('-').map(Number);
                      if (y && m && d) setEditEndDate(new Date(y, m - 1, d));
                    }}
                  />
                </label>
                {editEndDate && (
                  <label className="block text-xs font-medium">{t('countdown.endTime')}
                    <input
                      type="time"
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)}
                    />
                  </label>
                )}
                <label className="block text-xs font-medium">{t('countdown.timezone')}
                  <select
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={editTz}
                    onChange={(e) => setEditTz(e.target.value)}
                  >
                    {VACATION_TIME_ZONES.map((z) => (
                      <option key={z.value} value={z.value}>
                        {locale === 'en' ? z.labelEn : z.labelNb}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-cyan-700"
                    checked={editVacation}
                    onChange={(e) => setEditVacation(e.target.checked)}
                  />
                  <span>{t('countdown.useVacationMode')}</span>
                </label>
                <button
                  type="button"
                  disabled={updateCountdown.isPending}
                  onClick={() => void handleSaveDates()}
                  className="w-full rounded-xl bg-cyan-200 text-cyan-950 py-2.5 text-sm font-semibold"
                >
                  {t('countdown.saveDates')}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 space-y-2 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center mb-2">
            {t('countdown.participants')}
          </p>
          {countdown.countdown_participants
            .filter((p) => p.status !== 'declined')
            .map((p) => {
              const m = getMember(p.member_id);
              if (!m) return null;
              const color = getMemberColor(m.color_token);
              return (
                <div key={p.id} className={`flex items-center gap-3 rounded-2xl p-3 ${color.bg}`}>
                  <span className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center font-bold text-sm shrink-0 bg-white/50">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      m.display_name.charAt(0)
                    )}
                  </span>
                  <span className="font-medium flex-1 text-sm">{m.display_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.status === 'joined'
                      ? t('countdown.statusJoined')
                      : t('countdown.statusInvited')}
                  </span>
                </div>
              );
            })}
        </div>

        {isJoined && inviteable.length > 0 && (
          <div className="mt-4 space-y-2">
            {!showInvite ? (
              <button
                type="button"
                onClick={() => setShowInvite(true)}
                className="text-sm font-semibold text-foreground underline underline-offset-2"
              >
                {t('countdown.inviteMore')}
              </button>
            ) : (
              inviteable.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void handleInvite(m.id)}
                  className="w-full rounded-2xl bg-muted px-4 py-3 text-sm font-medium"
                >
                  {t('countdown.invitePerson', { name: m.display_name })}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <PopupStickyFooter>
        {isInvited ? (
          <>
            <button
              type="button"
              disabled={respond.isPending}
              onClick={() => void handleAccept()}
              className="w-full rounded-2xl bg-green-200 text-green-900 py-3.5 font-semibold hover:bg-green-300 transition-colors"
            >
              {t('countdown.join')}
            </button>
            <button
              type="button"
              disabled={respond.isPending}
              onClick={() => void handleDecline()}
              className="w-full rounded-2xl bg-muted text-foreground py-3 font-semibold"
            >
              {t('countdown.decline')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-green-200 text-green-900 py-3.5 font-semibold hover:bg-green-300 transition-colors"
          >
            {t('welcome.cta')}
          </button>
        )}

        {isCreator && countdown.status === 'active' && (
          <button
            type="button"
            onClick={() => void handleCancel()}
            className="w-full py-2 text-sm font-medium text-destructive"
          >
            {t('countdown.cancel')}
          </button>
        )}
      </PopupStickyFooter>
    </CenteredPopup>
  );
};

export default CountdownDetailSheet;
