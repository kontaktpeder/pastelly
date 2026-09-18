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
import { format } from 'date-fns';
import { useCreateEvent } from '@/hooks/useEvents';
import { useVacationMode } from '@/hooks/useVacationMode';
import { eventIsWorkdayLayer, itineraryLabels } from '@/lib/vacationMode';
import { resolveCategoryLabel } from '@/lib/categoryPresentation';
import type { EventCategory } from '@/lib/eventCategories';
import VacationQuickAdd from '@/components/VacationQuickAdd';
import VacationModeToggle from '@/components/VacationModeToggle';
import DayListItems from '@/components/DayListItems';

export interface DayOverviewProps {
  date: Date;
  events: DisplayEvent[];
  countdowns?: CountdownWithParticipants[];
  members: HouseholdMember[];
  householdId?: string;
  currentMemberId?: string;
  calendarKind?: string;
  canSeedWeek?: boolean;
  /** sheet = PopupStickyFooter; panel = bordered stack in desktop aside */
  layout?: 'sheet' | 'panel';
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
  const visibleEvents = vacation.filterEvents(events);
  const vacationOn = vacation.enabledForCalendar && vacation.snapshot.active;

  const actions = (
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
      {vacation.enabledForCalendar && <VacationModeToggle />}
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

  const handleQuickAdd = async (category: EventCategory) => {
    if (!householdId) {
      onCreateForDate(date);
      return;
    }
    setPendingCategory(category);
    try {
      await createEvent.mutateAsync({
        household_id: householdId,
        title: resolveCategoryLabel(category, null, locale),
        event_date: format(date, 'yyyy-MM-dd'),
        day_part: 'afternoon',
        day_part_start: 'afternoon',
        day_part_end: 'afternoon',
        start_time: '12:00',
        end_time: '13:00',
        category,
      });
      toast.success(t('vacation.added'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPendingCategory(null);
    }
  };

  const itinerary = itineraryLabels(
    [...visibleEvents]
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
      .map((ev) => ev.title),
  );

  const formatEventTime = (ev: Event) => {
    const dps = (ev as any).day_part_start as string | null;
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
        {vacationOn && itinerary && (
          <div className="rounded-2xl bg-cyan-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-900/70">
              {t('vacation.itinerary')}
            </p>
            <p className="mt-0.5 text-sm font-bold text-cyan-950 break-words">{itinerary}</p>
          </div>
        )}

        {countdowns.map((cd) => {
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

        {visibleEvents.length === 0 && countdowns.length === 0 ? (
          <div className="flex h-full min-h-[8rem] flex-col items-center justify-center px-2 text-center">
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
        ) : (
          [...visibleEvents]
            .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
            .map((ev) => {
              const timeLabel = formatEventTime(ev);
              const multiLabel = formatMultiDayLabel(ev, {
                dateLocale,
                daysLabel: (() => {
                  const end = (ev as any).end_date as string | undefined;
                  if (!end) return '';
                  const start = new Date(ev.event_date + 'T12:00:00');
                  const endD = new Date(end + 'T12:00:00');
                  const days = Math.round((endD.getTime() - start.getTime()) / 86400000) + 1;
                  return t('event.daysCount', { count: days });
                })(),
              });

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
                  {timeLabel && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{timeLabel}</p>
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
          />
        )}

        {vacationOn && householdId && (
          <div className="pt-2">
            <VacationQuickAdd onPick={(cat) => void handleQuickAdd(cat)} pendingCategory={pendingCategory} />
          </div>
        )}
      </div>

      {layout === 'sheet' ? (
        <PopupStickyFooter className="space-y-2">{actions}</PopupStickyFooter>
      ) : (
        <div className="shrink-0 space-y-2 border-t border-border/60 bg-card/90 px-5 py-3">
          {actions}
        </div>
      )}
    </div>
  );
};

export default DayOverview;
