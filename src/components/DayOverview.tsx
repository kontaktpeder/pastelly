import { DAY_PART_LABELS } from '@/lib/colors';
import { EVENT_CATEGORY_META } from '@/lib/eventCategories';
import { resolveCategoryVisuals, getMemberColorMap } from '@/lib/categoryPresentation';
import { formatMultiDayLabel } from '@/lib/multiDaySpans';
import { translateDayPart } from '@/lib/i18n';
import { useLocale } from '@/hooks/useLocale';
import type { Event } from '@/hooks/useEvents';
import { OVERLAY_MARK, type DisplayEvent } from '@/hooks/useOverlayEvents';
import { WORK_BLOCK_MARK } from '@/hooks/useWorkSchedule';
import type { HouseholdMember } from '@/hooks/useHousehold';
import SheetActionDock from '@/components/SheetActionDock';
import { hapticLight } from '@/lib/native/haptics';
import { BriefcaseBusiness, Plus } from 'lucide-react';
import { formatEventStayLabel } from '@/lib/eventStay';
import { addressDisplayLabel } from '@/lib/eventLocation';

export interface DayOverviewProps {
  date: Date;
  events: DisplayEvent[];
  members: HouseholdMember[];
  householdId?: string;
  currentMemberId?: string;
  calendarKind?: string;
  canSeedWeek?: boolean;
  /** sheet = planted bottom dock; panel = desktop aside; agenda = inline week program */
  layout?: 'sheet' | 'panel' | 'agenda';
  onPickEvent: (event: DisplayEvent) => void;
  onCreateForDate: (date: Date) => void;
  onSeedWeek?: () => void;
}

const DayOverview = ({
  date,
  events,
  members,
  canSeedWeek = false,
  layout = 'panel',
  onPickEvent,
  onCreateForDate,
  onSeedWeek,
}: DayOverviewProps) => {
  const { t, locale, dateLocale } = useLocale();
  const getMember = (id: string) => members.find((m) => m.id === id);
  const isAgenda = layout === 'agenda';
  const programEvents = events;
  const programEmpty = programEvents.length === 0;

  const addButton = (
    <button
      type="button"
      onClick={() => {
        void hapticLight();
        onCreateForDate(date);
      }}
      aria-label={t('event.newActivity')}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-green-200 text-green-900 active:bg-green-300"
    >
      <Plus size={22} strokeWidth={2.5} />
    </button>
  );

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
      <div className="flex justify-center">{addButton}</div>
    </>
  );

  const stayOpts = {
    dateLocale,
    firstDay: t('event.firstDay'),
    lastDay: t('event.lastDay'),
    checkIn: t('event.checkIn'),
    checkOut: t('event.checkOut'),
  };

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
        className={`min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain scroll-touch px-5 ${
          layout === 'sheet' ? 'pb-4' : 'pb-3'
        }`}
        style={isAgenda ? { touchAction: 'pan-y' } : undefined}
        data-sheet-scroll
      >
        {programEmpty ? (
          <div className={`flex flex-col items-center justify-center px-2 text-center ${
            isAgenda ? 'min-h-[4.5rem] py-6' : layout === 'sheet' ? 'py-8' : 'h-full min-h-[8rem]'
          }`}>
            <p className="text-lg font-medium text-foreground">
              {t('event.emptyDay')}
            </p>
            <p className="mt-1 text-base text-muted-foreground">
              {canSeedWeek
                ? t('event.emptyWeekHint')
                : t('event.emptyDayHint')}
            </p>
          </div>
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

              if (ev.isWorkBlock) {
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onPickEvent(ev)}
                    className="w-full rounded-xl p-3 text-left"
                    style={{ backgroundColor: WORK_BLOCK_MARK.soft }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px]"
                        style={{ backgroundColor: WORK_BLOCK_MARK.rail }}
                      >
                        <BriefcaseBusiness size={12} strokeWidth={2} style={{ color: WORK_BLOCK_MARK.ink }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-semibold">{ev.title}</span>
                        {timeLabel && (
                          <p className="mt-0.5 text-base text-muted-foreground">{timeLabel}</p>
                        )}
                        <p className="mt-1 text-base text-muted-foreground">{t('event.workBlockHint')}</p>
                      </span>
                    </div>
                    {ev.location && (
                      <p className="mt-1 text-base text-muted-foreground">{addressDisplayLabel(ev.location)}</p>
                    )}
                  </button>
                );
              }

              if (ev.isOverlay) {
                const fromWork = (ev.sourceHouseholdKind || '').toLowerCase() === 'work';
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onPickEvent(ev)}
                    className="w-full rounded-xl p-3 text-left"
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
                        <span className="block truncate text-lg font-semibold">{ev.title}</span>
                        {timeLabel && (
                          <p className="mt-0.5 text-base text-muted-foreground">{timeLabel}</p>
                        )}
                        <p className="mt-1 text-base text-muted-foreground">
                          {t('event.overlayHint')}
                        </p>
                      </span>
                    </div>
                    {ev.location && (
                      <p className="mt-1 text-base text-muted-foreground">{addressDisplayLabel(ev.location)}</p>
                    )}
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
                  className="w-full rounded-xl p-3 text-left"
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
                    <span className="truncate text-lg font-semibold">{ev.title}</span>
                  </div>
                  {multiLabel && (
                    <p className="mt-0.5 text-base font-medium text-foreground/70">{multiLabel}</p>
                  )}
                  {!(ev.category === 'hotel' && stayLabel) && timeLabel && (
                    <p className="mt-0.5 text-base text-muted-foreground">{timeLabel}</p>
                  )}
                  {ev.location && (
                    <p className="mt-1 text-base text-muted-foreground">{addressDisplayLabel(ev.location)}</p>
                  )}
                </button>
              );
            })
        )}

      </div>

      {isAgenda ? (
        <div className="shrink-0 px-5 pb-1">{actions}</div>
      ) : layout === 'sheet' ? (
        <SheetActionDock>{actions}</SheetActionDock>
      ) : (
        <div className="flex shrink-0 flex-col items-center gap-2 px-5 py-3">
          {actions}
        </div>
      )}
    </div>
  );
};

export default DayOverview;
