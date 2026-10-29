import type { ReactNode } from 'react';
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
import { BriefcaseBusiness, ImageIcon, Plus, type LucideIcon } from 'lucide-react';
import { formatEventStayLabel } from '@/lib/eventStay';
import { addressDisplayLabel } from '@/lib/eventLocation';
import { getMonthTheme, withAlpha } from '@/lib/monthTheme';

function dayPartLabel(ev: Event, locale: Parameters<typeof translateDayPart>[0]): string {
  const dps = (ev as { day_part_start?: string | null }).day_part_start;
  const key = dps || ev.day_part;
  return translateDayPart(locale, key) || DAY_PART_LABELS[key] || '';
}

/** Clock on two lines, or the existing day-part / all-day label. */
function sheetTimeLines(ev: Event, locale: Parameters<typeof translateDayPart>[0]): {
  primary: string;
  secondary: string | null;
  clock: boolean;
} {
  if (ev.start_time) {
    return {
      primary: ev.start_time.slice(0, 5),
      secondary: ev.end_time ? ev.end_time.slice(0, 5) : null,
      clock: true,
    };
  }
  return { primary: dayPartLabel(ev, locale), secondary: null, clock: false };
}

function SheetMark({ icon: Icon, color }: { icon?: LucideIcon; color: string }) {
  if (!Icon) return null;
  return (
    <Icon
      size={16}
      strokeWidth={2.25}
      className="mt-0.5 shrink-0"
      style={{ color }}
      aria-hidden
    />
  );
}

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
  /** Sticky date header, rendered inside the sheet scroller. */
  header?: ReactNode;
  onPickEvent: (event: DisplayEvent) => void;
  onCreateForDate: (date: Date) => void;
  onImportForDate?: (date: Date) => void;
  onSeedWeek?: () => void;
}

const DayOverview = ({
  date,
  events,
  members,
  canSeedWeek = false,
  layout = 'panel',
  header,
  onPickEvent,
  onCreateForDate,
  onImportForDate,
  onSeedWeek,
}: DayOverviewProps) => {
  const { t, locale, dateLocale } = useLocale();
  const getMember = (id: string) => members.find((m) => m.id === id);
  const isAgenda = layout === 'agenda';
  const isSheet = layout === 'sheet';
  const monthTheme = getMonthTheme(date);
  const programEvents = events;
  const programEmpty = programEvents.length === 0;
  const rowRule = withAlpha(monthTheme.base, 0.4);

  const addButton = isSheet ? (
    <button
      type="button"
      onClick={() => {
        void hapticLight();
        onCreateForDate(date);
      }}
      className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg text-base font-semibold active:opacity-90"
      style={{ backgroundColor: monthTheme.base, color: monthTheme.textOnStrong }}
    >
      <span aria-hidden className="text-lg leading-none">+</span>
      {t('event.newActivity')}
    </button>
  ) : (
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

  const importButton = onImportForDate ? (
    <button
      type="button"
      onClick={() => onImportForDate(date)}
      aria-label={t('import.fromImage')}
      className={
        isSheet
          ? 'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-foreground/20 bg-transparent text-foreground active:bg-foreground/5'
          : 'flex h-12 w-12 items-center justify-center rounded-full border border-foreground/30 bg-transparent text-foreground active:bg-muted'
      }
    >
      <ImageIcon size={isSheet ? 18 : 22} strokeWidth={2.2} />
    </button>
  ) : null;

  const actions = (
    <>
      {canSeedWeek && events.length === 0 && onSeedWeek && (
        <button
          type="button"
          onClick={onSeedWeek}
          className="w-full rounded-lg bg-primary py-3.5 font-semibold text-primary-foreground"
        >
          {t('event.fillWeek')}
        </button>
      )}
      <div className={isSheet ? 'flex w-full items-center gap-2' : 'flex items-center justify-center gap-3'}>
        {isSheet ? importButton : null}
        {addButton}
        {isSheet ? null : importButton}
      </div>
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
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-touch px-5 ${
          isSheet ? 'pb-2' : 'space-y-2 pb-3'
        }`}
        style={isAgenda ? { touchAction: 'pan-y' } : undefined}
        data-sheet-scroll
      >
        {header}
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

              if (isSheet) {
                const time = sheetTimeLines(ev, locale);
                const detailLines: string[] = [];
                if (multiLabel) detailLines.push(multiLabel);
                if (ev.isWorkBlock) detailLines.push(t('event.workBlockHint'));
                else if (ev.isOverlay) detailLines.push(t('event.overlayHint'));
                if (ev.location) detailLines.push(addressDisplayLabel(ev.location));

                let mark: ReactNode = null;
                if (ev.isWorkBlock) {
                  mark = <SheetMark icon={BriefcaseBusiness} color={WORK_BLOCK_MARK.ink} />;
                } else if (ev.isOverlay) {
                  const fromWork = (ev.sourceHouseholdKind || '').toLowerCase() === 'work';
                  if (fromWork) mark = <SheetMark icon={BriefcaseBusiness} color={OVERLAY_MARK.ink} />;
                } else {
                  const member = getMember(ev.owner_member_id);
                  const meta = EVENT_CATEGORY_META[(ev.category as keyof typeof EVENT_CATEGORY_META) || 'other'];
                  const visuals = resolveCategoryVisuals(ev.category, getMemberColorMap(member));
                  mark = <SheetMark icon={meta?.Icon} color={visuals.ink} />;
                }

                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onPickEvent(ev)}
                    className="flex w-full items-stretch gap-3 border-b py-3.5 text-left last:border-b-0"
                    style={{ borderColor: rowRule }}
                  >
                    <span
                      className={`flex w-[4.6rem] shrink-0 flex-col justify-start break-words pt-0.5 leading-tight text-foreground ${
                        time.clock ? 'text-[15px] font-semibold tabular-nums' : 'text-[13px] font-semibold'
                      }`}
                    >
                      <span>{time.primary || ' '}</span>
                      {time.secondary && (
                        <span className="font-medium text-foreground/75">{time.secondary}</span>
                      )}
                    </span>
                    <span
                      className="my-0.5 w-px shrink-0 self-stretch"
                      style={{ backgroundColor: rowRule }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        {mark}
                        <span className="min-w-0 flex-1 break-words text-[1.05rem] font-semibold leading-snug text-foreground">
                          {ev.title}
                        </span>
                      </span>
                      {detailLines.map((line, index) => (
                        <span
                          key={`${index}-${line}`}
                          className={`mt-0.5 block break-words text-base leading-snug text-muted-foreground ${
                            mark ? 'pl-6' : ''
                          }`}
                        >
                          {line}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              }

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
      ) : isSheet ? (
        <SheetActionDock surface={monthTheme.paper}>{actions}</SheetActionDock>
      ) : (
        <div className="flex shrink-0 flex-col items-center gap-2 px-5 py-3">
          {actions}
        </div>
      )}
    </div>
  );
};

export default DayOverview;
