import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useCreateCountdown } from '@/hooks/useCountdowns';
import { COUNTDOWN_THEME_IDS, getCountdownTheme, type CountdownThemeId } from '@/lib/countdownThemes';
import { zonedDateAndTimeToIso, VACATION_TIME_ZONES, resolveTimeZone, DEFAULT_TIME_ZONE } from '@/lib/timeZone';
import { persistCountdownVacationLocal } from '@/hooks/useVacationMode';
import type { HouseholdMember } from '@/hooks/useHousehold';
import { useLocale } from '@/hooks/useLocale';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { getMemberColor } from '@/lib/colors';
import CenteredPopup from '@/components/CenteredPopup';
import PopupStickyFooter from '@/components/PopupStickyFooter';
import CountdownCelebrateDialog from '@/components/CountdownCelebrateDialog';
import { focusSheetField } from '@/lib/focusSheetField';
import { stepForward, stepSpring } from '@/lib/motion';
import { scrollElementIntoContainer } from '@/lib/scrollFocusIntoView';

const FIELD =
  'min-w-0 box-border appearance-none rounded-xl border border-border bg-muted/50 px-4 py-3.5 text-base leading-normal text-center caret-foreground focus:outline-none focus:border-foreground/25 focus:ring-1 focus:ring-foreground/15 w-full';

const EMOJI_SUGGESTIONS = ['✨', '❤️', '🌴', '✈️', '🕯️', '🎉', '🏖️', '🍷'];

interface NewCountdownFlowProps {
  householdId: string;
  members: HouseholdMember[];
  currentMemberId: string;
  initialDate?: Date;
  onClose: () => void;
  onCreated?: (countdownId: string) => void;
}

const STEPS = 4;

const NewCountdownFlow = ({
  householdId,
  members,
  currentMemberId,
  initialDate,
  onClose,
  onCreated,
}: NewCountdownFlowProps) => {
  const { t, locale, dateLocale } = useLocale();
  const createCountdown = useCreateCountdown();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('✨');
  const [date, setDate] = useState(initialDate || new Date());
  const [time, setTime] = useState('08:00');
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState('23:59');
  const [useVacationMode, setUseVacationMode] = useState(false);
  const currentMember = members.find((m) => m.id === currentMemberId);
  const [timeZone, setTimeZone] = useState(() =>
    resolveTimeZone(currentMember?.timezone || DEFAULT_TIME_ZONE),
  );
  const [theme, setTheme] = useState<CountdownThemeId>('rose');
  const [inviteIds, setInviteIds] = useState<string[]>(() => {
    const others = members.filter((m) => m.id !== currentMemberId);
    return others.length === 1 ? [others[0].id] : [];
  });
  const [celebrate, setCelebrate] = useState<{
    id: string;
    title: string;
    targetAt: string;
    theme: string;
    emoji: string | null;
  } | null>(null);

  const others = members.filter((m) => m.id !== currentMemberId);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const keyboardInset = useKeyboardInset();
  const keyboardOpen = keyboardInset > 24;

  // Focus in the open-tap turn so iOS shows the keyboard; keep Next above it.
  useLayoutEffect(() => {
    if (step !== 1) return;
    focusSheetField(titleInputRef.current, { footerReserve: 128 });
  }, [step]);

  useEffect(() => {
    if (step !== 1 || !keyboardOpen) return;
    const el = titleInputRef.current;
    if (!el || document.activeElement !== el) return;
    const a = window.setTimeout(
      () => scrollElementIntoContainer(el, { footerReserve: 128 }),
      60,
    );
    const b = window.setTimeout(
      () => scrollElementIntoContainer(el, { footerReserve: 128 }),
      280,
    );
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [step, keyboardOpen, keyboardInset]);

  const handleBack = () => {
    if (step > 1) setStep((s) => s - 1);
    else onClose();
  };

  const canProceed = step === 1 ? title.trim().length > 0 : true;

  const toggleInvite = (id: string) => {
    setInviteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreate = async () => {
    const targetAt = zonedDateAndTimeToIso(date, time, timeZone);
    if (new Date(targetAt).getTime() <= Date.now()) {
      toast.error(t('countdown.futureRequired'));
      return;
    }
    const endsAt = endDate ? zonedDateAndTimeToIso(endDate, endTime || '23:59', timeZone) : null;
    if (endsAt && new Date(endsAt).getTime() <= new Date(targetAt).getTime()) {
      toast.error(t('countdown.futureRequired'));
      return;
    }
    try {
      const inviteUserIds = others
        .filter((m) => inviteIds.includes(m.id))
        .map((m) => m.user_id)
        .filter(Boolean);

      const created = await createCountdown.mutateAsync({
        household_id: householdId,
        title: title.trim(),
        target_at: targetAt,
        theme,
        emoji: emoji || null,
        invite_member_ids: inviteIds,
        invite_user_ids: inviteUserIds,
        ends_at: endsAt,
        use_vacation_mode: useVacationMode,
        timezone: timeZone,
      });
      persistCountdownVacationLocal(created.id, {
        ends_at: endsAt,
        use_vacation_mode: useVacationMode,
        timezone: timeZone,
      });

      onCreated?.(created.id);
      setCelebrate({
        id: created.id,
        title: created.title,
        targetAt: created.target_at,
        theme: created.theme,
        emoji: created.emoji,
      });
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'));
    }
  };

  if (celebrate) {
    return (
      <CountdownCelebrateDialog
        title={t('countdown.createdTitle')}
        body={
          inviteIds.length > 0
            ? t('countdown.createdBodyInvite')
            : t('countdown.createdBodySolo')
        }
        emoji={celebrate.emoji}
        themeId={celebrate.theme}
        targetAt={celebrate.targetAt}
        onClose={onClose}
      />
    );
  }

  const heading =
    step === 1 ? t('countdown.what') :
    step === 2 ? t('countdown.when') :
    step === 3 ? t('countdown.theme') :
    t('countdown.who');

  const hint =
    step === 1 ? t('countdown.whatHint') :
    step === 2 ? t('countdown.whenHint') :
    step === 3 ? t('countdown.themeHint') :
    t('countdown.whoHint');

  const needsScroll = step >= 2;
  const header = (
    <div className={`text-center shrink-0 ${keyboardOpen && step === 1 ? 'pt-1 pb-3' : 'pt-1 pb-4'}`}>
      <p className="text-xs font-medium text-muted-foreground mb-1">
        {t('countdown.step', { n: String(step), total: String(STEPS) })}
      </p>
      <h2
        id="countdown-new-title"
        className={`font-bold tracking-tight mb-1 ${keyboardOpen && step === 1 ? 'text-xl' : 'text-2xl'}`}
      >
        {heading}
      </h2>
      {!(keyboardOpen && step === 1) && (
        <p className="text-sm text-muted-foreground leading-relaxed">{hint}</p>
      )}
    </div>
  );

  const stepBody = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step}
        initial={stepForward.initial}
        animate={stepForward.animate}
        exit={stepForward.exit}
        transition={stepSpring}
        className="space-y-4 text-left"
      >
        {step === 1 && (
          <input
            ref={titleInputRef}
            className={FIELD}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('countdown.titlePlaceholder')}
            maxLength={80}
            enterKeyHint="next"
            autoComplete="off"
            autoCorrect="off"
          />
        )}

        {step === 2 && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium mb-1.5 block text-center">{t('event.date')}</span>
              <input
                type="date"
                className={FIELD}
                value={format(date, 'yyyy-MM-dd')}
                onChange={(e) => {
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  if (y && m && d) setDate(new Date(y, m - 1, d));
                }}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium mb-1.5 block text-center">{t('event.clock')}</span>
              <input
                type="time"
                className={FIELD}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <p className="text-sm text-muted-foreground text-center capitalize">
              {format(date, 'EEEE d. MMMM', { locale: dateLocale })} · {time}
            </p>
            <p className="text-xs text-muted-foreground text-center">{t('countdown.periodHint')}</p>
            <label className="block">
              <span className="text-sm font-medium mb-1.5 block text-center">{t('countdown.endDate')}</span>
              <input
                type="date"
                className={FIELD}
                value={endDate ? format(endDate, 'yyyy-MM-dd') : ''}
                min={format(date, 'yyyy-MM-dd')}
                onChange={(e) => {
                  if (!e.target.value) {
                    setEndDate(null);
                    return;
                  }
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  if (y && m && d) setEndDate(new Date(y, m - 1, d));
                }}
              />
            </label>
            {endDate && (
              <label className="block">
                <span className="text-sm font-medium mb-1.5 block text-center">{t('countdown.endTime')}</span>
                <input
                  type="time"
                  className={FIELD}
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </label>
            )}
            <label className="block">
              <span className="text-sm font-medium mb-1.5 block text-center">{t('countdown.timezone')}</span>
              <select
                className={FIELD}
                value={timeZone}
                onChange={(e) => setTimeZone(e.target.value)}
              >
                {VACATION_TIME_ZONES.map((z) => (
                  <option key={z.value} value={z.value}>
                    {locale === 'en' ? z.labelEn : z.labelNb}
                  </option>
                ))}
                {!VACATION_TIME_ZONES.some((z) => z.value === timeZone) && (
                  <option value={timeZone}>{timeZone}</option>
                )}
              </select>
              <p className="text-xs text-muted-foreground text-center mt-1">{t('countdown.timezoneHint')}</p>
            </label>
            <label className="flex items-start gap-3 rounded-2xl bg-cyan-50 p-4 cursor-pointer text-left">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-cyan-700"
                checked={useVacationMode}
                onChange={(e) => {
                  setUseVacationMode(e.target.checked);
                  if (e.target.checked && !endDate) {
                    setEndDate(date);
                  }
                }}
              />
              <span>
                <span className="block font-semibold text-sm">{t('countdown.useVacationMode')}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {t('countdown.useVacationModeHint')}
                </span>
              </span>
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium mb-2 text-center">{t('countdown.emojiLabel')}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {EMOJI_SUGGESTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    className={`w-11 h-11 rounded-xl text-xl flex items-center justify-center transition-colors ${
                      emoji === e ? 'bg-green-200 ring-2 ring-green-300/60' : 'bg-muted'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {COUNTDOWN_THEME_IDS.map((id) => {
                const meta = getCountdownTheme(id);
                const selected = theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    className={`rounded-2xl p-4 text-center transition-shadow ${
                      selected ? 'ring-2 ring-foreground/25 shadow-soft' : ''
                    }`}
                    style={{ background: meta.gradient }}
                  >
                    <span className="block text-xl mb-1" aria-hidden>
                      {emoji || '✨'}
                    </span>
                    <span className="font-semibold text-sm text-foreground/90">
                      {locale === 'en' ? meta.labelEn : meta.labelNb}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-2">
            {others.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t('countdown.noMembers')}
              </p>
            ) : (
              others.map((m) => {
                const selected = inviteIds.includes(m.id);
                const color = getMemberColor(m.color_token);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleInvite(m.id)}
                    className={`w-full flex items-center gap-3 rounded-2xl p-3 text-left transition-colors ${
                      selected ? `${color.bg} ring-2 ring-foreground/15` : 'bg-muted/60'
                    }`}
                  >
                    <span
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm overflow-hidden shrink-0"
                      style={
                        !m.avatar_url
                          ? { backgroundColor: `hsl(var(--member-${m.color_token.replace('pastel-', '')}))` }
                          : undefined
                      }
                    >
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        m.display_name.charAt(0)
                      )}
                    </span>
                    <span className="font-semibold flex-1 text-sm">{m.display_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {selected ? t('countdown.willInvite') : t('countdown.tapToInvite')}
                    </span>
                  </button>
                );
              })
            )}
            <p className="text-xs text-muted-foreground pt-1 text-center">{t('countdown.inviteNote')}</p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <CenteredPopup onClose={onClose} onExit={onClose} size="sheet" zClassName="z-[70]">
      {needsScroll ? (
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-touch px-5 pb-4"
          data-sheet-scroll
        >
          {header}
          {stepBody}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-5 pb-2">
          {header}
          <div className="min-h-0 flex-1 flex flex-col justify-start">{stepBody}</div>
        </div>
      )}

      <PopupStickyFooter>
        {step < STEPS ? (
          <button
            type="button"
            disabled={!canProceed}
            onClick={() => setStep((s) => s + 1)}
            className="w-full rounded-2xl bg-green-200 text-green-900 py-3.5 font-semibold hover:bg-green-300 transition-colors disabled:opacity-40"
          >
            {t('common.next')}
          </button>
        ) : (
          <button
            type="button"
            disabled={createCountdown.isPending}
            onClick={() => void handleCreate()}
            className="w-full rounded-2xl bg-green-200 text-green-900 py-3.5 font-semibold hover:bg-green-300 transition-colors disabled:opacity-40"
          >
            {createCountdown.isPending ? t('event.saving') : t('countdown.create')}
          </button>
        )}
        <button
          type="button"
          onClick={handleBack}
          className="w-full py-2 text-sm font-medium text-muted-foreground underline underline-offset-2"
        >
          {step === 1 ? t('common.cancel') : t('common.back')}
        </button>
      </PopupStickyFooter>
    </CenteredPopup>
  );
};

export default NewCountdownFlow;
