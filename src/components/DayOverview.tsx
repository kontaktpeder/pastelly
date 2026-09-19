import { DAY_PART_LABELS } from '@/lib/colors';
import { EVENT_CATEGORY_META } from '@/lib/eventCategories';
import { resolveCategoryVisuals, getMemberColorMap } from '@/lib/categoryPresentation';
import { formatMultiDayLabel } from '@/lib/multiDaySpans';
import { translateDayPart } from '@/lib/i18n';
import { useLocale } from '@/hooks/useLocale';
import type { Event } from '@/hooks/useEvents';
import { OVERLAY_MARK, type DisplayEvent } from '@/hooks/useOverlayEvents';
import type { HouseholdMember } from '@/hooks/useHousehold';
import type { CountdownWithParticipants } from '@/hooks/useCountdowns';
import { calendarDaysUntil } from '@/lib/countdownTime';
import { getCountdownTheme } from '@/lib/countdownThemes';
import PopupStickyFooter from '@/components/PopupStickyFooter';
import { BriefcaseBusiness } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useCreateEvent } from '@/hooks/useEvents';
import { useVacationMode } from '@/hooks/useVacationMode';
import { eventIsWorkdayLayer, eventMirrorsVacationPeriod, itineraryLabels, VACATION_EMPTY_DAY_SUGGESTIONS } from '@/lib/vacationMode';
import { vacationQuickAddPayload } from '@/lib/vacationSchedule';
import { formatEventStayLabel } from '@/lib/eventStay';
import { resolveCategoryLabel } from '@/lib/categoryPresentation';
import type { EventCategory } from '@/lib/eventCategories';
import VacationQuickAdd from '@/components/VacationQuickAdd';
import VacationModeToggle from '@/components/VacationModeToggle';
import DayListItems from '@/components/DayListItems';
import CenteredPopup from '@/components/CenteredPopup';
import { tryOpenSheet } from '@/lib/sheetGate';

export interface DayOverviewProps {
  date: Date;
  events: DisplayEvent[];
  countdowns?: CountdownWithParticipants[];
  members: HouseholdMember[];
  householdId?: string;
  currentMemberId?: string;
  calendarKind?: string;
  canSeedWeek?: boolean;
  /** sheet = PopupStickyFooter; panel = bordered stack in desktop aside; agenda = inline week program */
  layout?: 'sheet' | 'panel' | 'agenda';
  onPickEvent: (event: DisplayEvent) => void;
  onPickCountdown?: (countdown: CountdownWithParticipants) => void;
  onCreateForDate: (date: Date) => void;
  onCreateCountdown?: (date: Date) => void;
  onSeedWeek?: () => void;
}

const DayOverview = ({
  date,
  events,
  countdowns = [],
  members,
  householdId,
  currentMemberId: _currentMemberId,
  calendarKind = 'home',
  canSeedWeek = false,
  layout = 'panel',
  onPickEvent,
  onPickCountdown,
  onCreateForDate,
  onCreateCountdown,
  onSeedWeek,
}: DayOverviewProps) => {
  const { t, locale, dateLocale } = useLocale();
  const getMember = (id: string) => members.find((m) => m.id === id);
  const showCountdownCta = calendarKind === 'home' && !!onCreateCountdown;
  const vacation = useVacationMode();
  const createEvent = useCreateEvent();
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const visibleEvents = vacation.filterEvents(events);
  const vacationOn = vacation.enabledForCalendar && vacation.snapshot.active;
  const isAgenda = layout === 'agenda';
  const periodEvents = vacation.snapshot.activePeriods;
  const programEvents = isAgenda
    ? visibleEvents.filter((ev) => !eventMirrorsVacationPeriod(ev, periodEvents))
    : visibleEvents;
  const periodIds = new Set(periodEvents.map((p) => p.id));
  const programCountdowns = isAgenda
    ? countdowns.filter((cd) => !periodIds.has(cd.id))
    : countdowns;
  const programEmpty = programEvents.length === 0 && programCountdowns.length === 0;

  const actions = isAgenda ? (
    <button
      type="button"
      onClick={() => tryOpenSheet(() => setShowAddMenu(true))}
      className="w-full py-3 text-sm font-normal text-[#0B4A5C]"
    >
      {t('event.addDiscreet')}
    </button>
  ) : (
    <>
      {canSeedWeek && events.length === 0 && onSeedWeek && (
        <button
          type="button"
          onClick={onSeedWeek}
          className="w-full rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground"
        >
          {t('event.fillWeek')}
        </button>
      )}
      {showCountdownCta && (
        <button
          type="button"
          onClick={() => onCreateCountdown?.(date)}
          className="w-full rounded-2xl bg-pink-100 py-3.5 font-semibold text-pink-900"
        >
          {t('countdown.new')}
        </button>
      )}
      {vacation.enabledForCalendar && !vacationOn && <VacationModeToggle />}
      <button
        type="button"
        onClick={() => onCreateForDate(date)}
        className={`w-full rounded-2xl py-3.5 font-semibold ${
          vacationOn
            ? 'bg-cyan-200 text-cyan-950'
            : 'bg-green-200 text-green-900'
        }`}
      >
        {t('event.newActivity')}
      </button>
    </>
  );

  const suggestionTitle = (key: (typeof VACATION_EMPTY_DAY_SUGGESTIONS)[number]) => {
    if (key === 'breakfast') return t('vacation.suggestBreakfast');
    if (key === 'beach') return t('vacation.suggestBeach');
    return t('vacation.suggestDinner');
  };

  const handleQuickAdd = async (category: EventCategory, title?: string) => {
    if (!householdId) {
      onCreateForDate(date);
      return;
    }
    setPendingCategory(category);
    try {
      await createEvent.mutateAsync({
        household_id: householdId,
        title: title ?? resolveCategoryLabel(category, null, locale),
        category,
        ...vacationQuickAddPayload(category, date),
      });
      toast.success(t('vacation.added'));
      setShowAddMenu(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPendingCategory(null);
    }
  };

  const stayOpts = {
    dateLocale,
    firstDay: t('event.firstDay'),
    lastDay: t('event.lastDay'),
    checkIn: t('event.checkIn'),
    checkOut: t('event.checkOut'),
  };

  const itinerary = itineraryLabels(
    [...programEvents]
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
      .map((ev) => ev.title),
  );

  const formatEventTime = (ev: Event) => {
    const dps = (ev as { day_part_start?: string | null }).day_part_start;
    const parts: string[] = [];
    if (ev.start_time) {
      parts.push(ev.start_time.slice(0, 5));
      if (ev.end_time) parts[0] += `–${ev.end_time.slice(0, 5)}`;
    } else {
      const label = translateDayPart(locale, dps || ev.day_part) || DAY_PART_LABELS[dps || ev.day_part] || ev.day_part;
      if (label) parts.push(label);
    }
    return parts.join(' · ') || null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain scroll-touch px-5 pb-3"
        data-sheet-scroll
      >
        {vacationOn && !isAgenda && itinerary && (
          <div className="rounded-2xl bg-cyan-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-900/70">
              {t('vacation.itinerary')}
            </p>
            <p className="mt-0.5 text-sm font-bold text-cyan-950 break-words">{itinerary}</p>
          </div>
        )}

        {programCountdowns.map((cd) => {
          const theme = getCountdownTheme(cd.theme);
          const daysFromNow = calendarDaysUntil(cd.target_at);
          const label =
            daysFromNow <= 0
              ? t('countdown.itsTime')
              : daysFromNow === 1
                ? `1 ${t('countdown.dayLeft')}`
                : `${daysFromNow} ${t('countdown.daysLeft')}`;
          return (
            <button
              key={cd.id}
              type="button"
              onClick={() => onPickCountdown?.(cd)}
              className="w-full rounded-xl p-3 text-left"
              style={{ background: theme.gradient }}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{cd.emoji || '✨'}</span>
                <span className="truncate text-sm font-semibold">{cd.title}</span>
              </div>
              <p className={`mt-0.5 text-xs font-medium ${theme.accentText}`}>
                {t('countdown.onDay')} · {label}
              </p>
            </button>
          );
        })}

        {programEmpty ? (
          isAgenda && vacationOn && householdId ? (
            <div className="py-2">
              {VACATION_EMPTY_DAY_SUGGESTIONS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={pendingCategory === key}
                  onClick={() => void handleQuickAdd(key, suggestionTitle(key))}
                  className="w-full py-2 text-left text-sm font-normal text-foreground disabled:opacity-50"
                >
                  {suggestionTitle(key)}
                </button>
              ))}
            </div>
          ) : (
          <div className={`flex flex-col items-center justify-center px-2 text-center ${
            isAgenda ? 'min-h-[4.5rem] py-6' : 'h-full min-h-[8rem]'
          }`}>
            <p className="font-medium text-foreground">
              {vacationOn ? t('vacation.emptyDay') : t('event.emptyDay')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {vacationOn
                ? t('vacation.layerHint')
                : canSeedWeek
                  ? t('event.emptyWeekHint')
                  : t('event.emptyDayHint')}
            </p>
          </div>
          )
        ) : (
          [...programEvents]
            .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
            .map((ev) => {
              const stayLabel = formatEventStayLabel(ev, stayOpts);
              const multiLabel = stayLabel || formatMultiDayLabel(ev, {
                dateLocale,
                daysLabel: (() => {
                  const end = (ev as { end_date?: string }).end_date;
                  if (!end) return '';
                  const start = new Date(ev.event_date + 'T12:00:00');
                  const endD = new Date(end + 'T12:00:00');
                  const days = Math.round((endD.getTime() - start.getTime()) / 86400000) + 1;
                  return t('event.daysCount', { count: days });
                })(),
              });

              const timeLabel = formatEventTime(ev);

              if (ev.isOverlay) {
                const fromWork = (ev.sourceHouseholdKind || '').toLowerCase() === 'work';
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onPickEvent(ev)}
                    className={`w-full rounded-xl p-3 text-left ${
                      vacationOn && vacation.revealHidden && eventIsWorkdayLayer(ev) ? 'opacity-40' : ''
                    }`}
                    style={{ backgroundColor: OVERLAY_MARK.soft }}
                  >
                    <div className="flex items-center gap-2">
                      {fromWork && (
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px]"
                          style={{ backgroundColor: OVERLAY_MARK.rail }}
                        >
                          <BriefcaseBusiness size={12} strokeWidth={2} style={{ color: OVERLAY_MARK.ink }} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{ev.title}</span>
                        {timeLabel && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{timeLabel}</p>
                        )}
                        {ev.location && (
                          <p className="mt-0.5 text-xs text-foreground/80 truncate">📍 {ev.location}</p>
                        )}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t('event.overlayHint')}
                        </p>
                      </span>
                    </div>
                  </button>
                );
              }

              const member = getMember(ev.owner_member_id);
              const meta = EVENT_CATEGORY_META[(ev.category as keyof typeof EVENT_CATEGORY_META) || 'other'];
              const visuals = resolveCategoryVisuals(ev.category, getMemberColorMap(member));
              const Icon = meta?.Icon;

              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onPickEvent(ev)}
                  className={`w-full rounded-xl p-3 text-left ${
                    vacationOn && vacation.revealHidden && eventIsWorkdayLayer(ev) ? 'opacity-40' : ''
                  }`}
                  style={{ backgroundColor: visuals.soft || undefined }}
                >
                  <div className="flex items-center gap-2">
                    {Icon && (
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: visuals.rail }}
                      >
                        <Icon size={12} strokeWidth={2} style={{ color: visuals.ink }} />
                      </span>
                    )}
                    <span className="truncate text-sm font-semibold">{ev.title}</span>
                  </div>
                  {multiLabel && (
                    <p className="mt-0.5 text-xs font-medium text-foreground/70">{multiLabel}</p>
                  )}
                  {!(ev.category === 'hotel' && stayLabel) && timeLabel && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{timeLabel}</p>
                  )}
                  {ev.location && (
                    <p className="mt-0.5 text-xs text-foreground/80 truncate">📍 {ev.location}</p>
                  )}
                </button>
              );
            })
        )}

        {householdId && _currentMemberId && (
          <DayListItems
            date={date}
            householdId={householdId}
            currentMemberId={_currentMemberId}
            heading={isAgenda ? t('vacation.checklist') : undefined}
          />
        )}
      </div>

      {isAgenda ? (
        <div className="shrink-0 px-5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">{actions}</div>
      ) : layout === 'sheet' ? (
        <PopupStickyFooter className="space-y-2">{actions}</PopupStickyFooter>
      ) : (
        <div className="shrink-0 space-y-2 border-t border-border/60 bg-card/90 px-5 py-3">
          {actions}
        </div>
      )}

      {showAddMenu && (
        <CenteredPopup
          onClose={() => setShowAddMenu(false)}
          onExit={() => setShowAddMenu(false)}
          size="hug"
          zClassName="z-[80]"
        >
          <div className="px-4 py-2">
            <VacationQuickAdd onPick={(cat) => void handleQuickAdd(cat)} pendingCategory={pendingCategory} />
          </div>
        </CenteredPopup>
      )}
    </div>
  );
};

export default DayOverview;
