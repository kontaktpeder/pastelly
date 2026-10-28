import { useState, useMemo, useCallback, useRef, useEffect, type Dispatch, type SetStateAction } from 'react';
import { motion, AnimatePresence, useMotionValue, animate, type PanInfo } from 'framer-motion';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isToday, isSameMonth, addMonths, getISOWeek, addDays } from 'date-fns';
import { useEventsForMonth, type Event } from '@/hooks/useEvents';
import {
  mergeEventsWithOverlays,
  useOverlayEventsForRange,
  OVERLAY_MARK,
  type DisplayEvent,
} from '@/hooks/useOverlayEvents';
import { mergeWorkBlocks, useWorkScheduleBlocks, WORK_BLOCK_MARK } from '@/hooks/useWorkSchedule';
import { resolveCategoryVisuals, getMemberColorMap, categoryMarkFill } from '@/lib/categoryPresentation';
import { EVENT_CATEGORY_META } from '@/lib/eventCategories';
import { getMonthTheme, PASTEL, sundayAccentForDate, sundayAccentForMonth, withAlpha } from '@/lib/monthTheme';
import {
  buildSpanSegmentsByDate,
  isMultiDayEvent,
  maxSpanLane,
  MAX_SPAN_LANES,
  type SpanSegment,
} from '@/lib/multiDaySpans';
import type { HouseholdMember } from '@/hooks/useHousehold';
import type { Highlight } from '@/pages/Index';
import { useLocale } from '@/hooks/useLocale';
import type { CalendarKind } from '@/lib/calendarKinds';
import ViewHeader from '@/components/ViewHeader';
import CalendarDaySheet from '@/components/CalendarDaySheet';
import EventDetailSheet from '@/components/EventDetailSheet';
import OverlayEventSheet from '@/components/OverlayEventSheet';
import WorkBlockSheet from '@/components/WorkBlockSheet';
import { useLongPress } from '@/hooks/useLongPress';
import { useIsMobile } from '@/hooks/use-mobile';
import { fadeQuick } from '@/lib/motion';
import { tryOpenSheet } from '@/lib/sheetGate';
import { consumePendingOpenDay, peekPendingOpenDay, subscribePendingOpenDay } from '@/lib/native/pendingOpenDay';
import { BriefcaseBusiness, type LucideIcon } from 'lucide-react';

interface CalendarViewProps {
  householdId: string;
  members: HouseholdMember[];
  currentMemberId: string;
  calendarKind?: CalendarKind | string;
  currentDate?: Date;
  selectedDate?: Date;
  onCurrentDateChange?: Dispatch<SetStateAction<Date>>;
  onSelectDate: (date: Date) => void;
  onCreateEvent: (date: Date) => void;
  onImportForDate?: (date: Date) => void;
  onEditEvent?: (event: Event) => void;
  onQuickEditEvent?: (event: Event) => void;
  onSwitchCalendar?: (householdId: string) => void;
  /** Vertical stack: +1 = swipe up (next), -1 = swipe down (previous) */
  onSwipeCalendarStack?: (direction: 1 | -1) => void;
  canSwipeCalendarStack?: boolean;
  highlight?: Highlight;
  canSeedWeek?: boolean;
  onSeedWeek?: () => void;
  /** Fires once current-month (+overlay) data is ready for a controlled cold start. */
  onReady?: () => void;
  showInOtherCalendars?: boolean;
}

const CATEGORY_ORDER: Record<string, number> = {
  important: 0,
  deadline: 1,
  work: 2,
  meeting: 3,
  school: 4,
  client: 5,
  focus: 6,
  admin: 7,
  couple: 8,
  celebration: 9,
  social: 10,
  travel: 11,
  beach: 12,
  breakfast: 13,
  lunch: 14,
  dinner: 15,
  hotel: 16,
  outing: 17,
  activity: 18,
  relaxation: 19,
  shopping: 20,
  practical: 21,
  other: 22,
};

/** Commit when dragged past this fraction of width, or with enough velocity */
const COMMIT_RATIO = 0.18;
const COMMIT_VELOCITY = 380;
/** Vertical stack switch thresholds */
const STACK_COMMIT_PX = 64;
const STACK_COMMIT_VELOCITY = 420;
/** Months rendered on each side of the center (5 panels total) */
const WINDOW = 2;
/** One gesture = at most one month */
const MAX_HOPS_PER_SWIPE = 1;
/** Soft resistance past one page (rubber-band) — avoids hard edge blink */
const RUBBER = 0.28;
/** Ignore strip movement until finger travels this far (px) */
const PAN_ACTIVATE_PX = 14;
/** Treat gesture as vertical (stack) when |dy| exceeds |dx| by this factor */
const AXIS_LOCK_RATIO = 1.15;

/** Diminishing travel past ±limit so the strip never hard-stops / blinks at the edge */
function rubberBand(offset: number, limit: number): number {
  const sign = offset < 0 ? -1 : 1;
  const abs = Math.abs(offset);
  if (abs <= limit) return offset;
  return sign * (limit + (abs - limit) * RUBBER);
}

function addCalendarDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function buildEventsByDate(events: DisplayEvent[]): Record<string, DisplayEvent[]> {
  const map: Record<string, DisplayEvent[]> = {};
  events.forEach((e) => {
    const start = e.event_date;
    const end = e.end_date || e.event_date;
    let current = start;
    let guard = 0;
    while (current <= end && guard < 400) {
      if (!map[current]) map[current] = [];
      map[current].push(e);
      current = addCalendarDaysYmd(current, 1);
      guard += 1;
    }
  });
  return map;
}

function eventsForMonth(
  all: DisplayEvent[],
  year: number,
  month: number,
): DisplayEvent[] {
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return all.filter((e) => {
    const end = e.end_date || e.event_date;
    return e.event_date <= monthEnd && end >= monthStart;
  });
}

function buildMonthDays(monthDate: Date): Date[] {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  return eachDayOfInterval({ start: calStart, end: calEnd });
}

const CalendarView = ({ householdId, members, currentMemberId, calendarKind = 'home', currentDate: controlledDate, selectedDate, onCurrentDateChange, onSelectDate, onCreateEvent, onImportForDate, onEditEvent, onQuickEditEvent, onSwitchCalendar, onSwipeCalendarStack, canSwipeCalendarStack = false, highlight, canSeedWeek = false, onSeedWeek, onReady, showInOtherCalendars = false }: CalendarViewProps) => {
  const { dateLocale, t } = useLocale();
  const weekdayLabels = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) =>
      format(addDays(monday, i), 'EEEEEE', { locale: dateLocale }),
    );
  }, [dateLocale]);
  const isMobile = useIsMobile();
  const [internalDate, setInternalDate] = useState(new Date());
  const currentDate = controlledDate ?? internalDate;
  const focusedDay = selectedDate ?? currentDate;
  const setCurrentDate = useCallback(
    (updater: SetStateAction<Date>) => {
      if (onCurrentDateChange) onCurrentDateChange(updater);
      else setInternalDate(updater);
    },
    [onCurrentDateChange],
  );

  const [showYear, setShowYear] = useState(false);
  const [daySheetDate, setDaySheetDate] = useState<Date | null>(null);
  const [detailEvent, setDetailEvent] = useState<Event | null>(null);
  const [overlayEvent, setOverlayEvent] = useState<DisplayEvent | null>(null);
  const [workBlock, setWorkBlock] = useState<DisplayEvent | null>(null);
  const [paging, setPaging] = useState(false);

  const openDayFromPush = useCallback(
    (dateStr: string) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      if (!y || !m || !d) return;
      const day = new Date(y, m - 1, d);
      setCurrentDate(startOfMonth(day));
      onSelectDate?.(day);
      tryOpenSheet(() => setDaySheetDate(day));
    },
    [onSelectDate, setCurrentDate],
  );

  useEffect(() => {
    const tryOpen = () => {
      const pending = peekPendingOpenDay();
      if (!pending?.dateStr) return;
      if (pending.householdId && pending.householdId !== householdId) return;
      const consumed = consumePendingOpenDay();
      if (consumed?.dateStr) openDayFromPush(consumed.dateStr);
    };
    tryOpen();
    return subscribePendingOpenDay(() => tryOpen());
  }, [openDayFromPush, householdId]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const stripOffsets = useMemo(() => Array.from({ length: WINDOW * 2 + 1 }, (_, i) => i - WINDOW), []);
  const stripDates = useMemo(
    () => stripOffsets.map((off) => startOfMonth(addMonths(currentDate, off))),
    [currentDate, stripOffsets],
  );

  const eventFetchDates = stripDates;

  // Prefetch ±WINDOW so continuous swipe never peeks empty
  const { data: eventsM2 = [] } = useEventsForMonth(householdId, eventFetchDates[0].getFullYear(), eventFetchDates[0].getMonth());
  const { data: eventsM1 = [] } = useEventsForMonth(householdId, eventFetchDates[1].getFullYear(), eventFetchDates[1].getMonth());
  const {
    data: eventsRaw,
    isFetched: monthFetched,
    isError: monthError,
  } = useEventsForMonth(householdId, year, month);
  const { data: eventsP1 = [] } = useEventsForMonth(householdId, eventFetchDates[3].getFullYear(), eventFetchDates[3].getMonth());
  const { data: eventsP2 = [] } = useEventsForMonth(householdId, eventFetchDates[4].getFullYear(), eventFetchDates[4].getMonth());

  const overlayRange = useMemo(() => {
    const start = format(startOfMonth(stripDates[0]), 'yyyy-MM-dd');
    const end = format(endOfMonth(stripDates[stripDates.length - 1]), 'yyyy-MM-dd');
    return { start, end };
  }, [stripDates]);

  const {
    data: overlayRaw,
    isFetched: overlayFetched,
    isError: overlayError,
  } = useOverlayEventsForRange(
    householdId,
    overlayRange.start,
    overlayRange.end,
  );

  // Hold marks empty only until first ready paint — avoid blanking on month swipe when cache hits.
  const [marksVisible, setMarksVisible] = useState(false);
  /** Temporary design toggle — hide bars and day marks while polishing the grid. */
  const [eventsHidden, setEventsHidden] = useState(true);
  const events = monthFetched || monthError ? (eventsRaw ?? []) : [];
  const overlayEvents = overlayFetched || overlayError ? (overlayRaw ?? []) : [];
  const {
    data: workRaw,
    isFetched: workFetched,
    isError: workError,
  } = useWorkScheduleBlocks(householdId, overlayRange.start, overlayRange.end);
  const workBlocks = workFetched || workError ? (workRaw ?? []) : [];

  useEffect(() => {
    setMarksVisible(false);
  }, [householdId]);

  // Reveal marks + signal ready together (after month + overlay, or short wait).
  useEffect(() => {
    if (!monthFetched && !monthError) return;
    if (marksVisible) {
      // Already showing — month swipe with cached data; keep marks, still notify ready.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => onReady?.());
      });
      return;
    }

    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      setMarksVisible(true);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => onReady?.());
      });
    };

    if (overlayFetched || overlayError) {
      finish();
      return;
    }
    const t = window.setTimeout(finish, 650);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [
    onReady,
    monthFetched,
    monthError,
    overlayFetched,
    overlayError,
    householdId,
    year,
    month,
    marksVisible,
  ]);

  const monthTheme = useMemo(() => getMonthTheme(currentDate), [currentDate]);

  const mergedByOffset = useMemo(() => {
    const locals = [eventsM2, eventsM1, events, eventsP1, eventsP2];
    return locals.map((local, i) => {
      const y = stripDates[i].getFullYear();
      const m = stripDates[i].getMonth();
      const monthOverlays = eventsForMonth(overlayEvents, y, m);
      const monthWork = eventsForMonth(workBlocks, y, m);
      return mergeWorkBlocks(mergeEventsWithOverlays(local, monthOverlays), monthWork);
    });
  }, [eventsM2, eventsM1, events, eventsP1, eventsP2, overlayEvents, workBlocks, stripDates]);

  const eventsByOffset = useMemo(
    () => mergedByOffset.map((list) => buildEventsByDate(list)),
    [mergedByOffset],
  );
  const eventsByDate = eventsByOffset[WINDOW];

  const daysByOffset = useMemo(
    () => stripDates.map((date) => buildMonthDays(date)),
    [stripDates],
  );

  const trackRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const x = useMotionValue(0);
  const animatingRef = useRef(false);
  const animationControlsRef = useRef<{ stop: () => void } | null>(null);
  const panStartXRef = useRef(0);
  /** pending = undecided, pan = horizontal month, stack = vertical calendar switch, blocked = press lock */
  const panModeRef = useRef<'pending' | 'pan' | 'stack' | 'blocked'>('pending');
  /** Set while a day long-press is active — keeps strip frozen */
  const pressLockRef = useRef(false);
  /** Track vertical intent for calendar-stack swipe */
  const panOffsetYRef = useRef(0);
  const panVelocityYRef = useRef(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setPageWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stopPagingAnim = useCallback(() => {
    animationControlsRef.current?.stop();
    animationControlsRef.current = null;
    if (animatingRef.current) {
      animatingRef.current = false;
      setPaging(false);
    }
  }, []);

  /** Jump without strip animation (today / year picker) */
  const jumpToMonth = useCallback(
    (date: Date) => {
      stopPagingAnim();
      x.set(0);
      setCurrentDate(startOfMonth(date));
    },
    [setCurrentDate, stopPagingAnim, x],
  );

  const lockStripForPress = useCallback(() => {
    pressLockRef.current = true;
    panModeRef.current = 'blocked';
    x.set(panStartXRef.current);
  }, [x]);

  const unlockStripForPress = useCallback(() => {
    pressLockRef.current = false;
  }, []);

  const flingToHops = useCallback(
    (hops: number) => {
      if (!pageWidth) return;

      const clamped = Math.max(-MAX_HOPS_PER_SWIPE, Math.min(MAX_HOPS_PER_SWIPE, hops));
      animatingRef.current = true;
      // Don't flip pointer-events mid-settle — that remounts cells and blinks at the edge
      setPaging(true);

      const settle = {
        type: 'tween' as const,
        duration: 0.28,
        ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
      };

      if (clamped === 0) {
        animationControlsRef.current = animate(x, 0, {
          ...settle,
          onComplete: () => {
            animatingRef.current = false;
            setPaging(false);
            animationControlsRef.current = null;
          },
        });
        return;
      }

      // Animate to exact one page, then recenter instantly (new center == old neighbor)
      animationControlsRef.current = animate(x, -clamped * pageWidth, {
        ...settle,
        onComplete: () => {
          setCurrentDate((d) => addMonths(d, clamped));
          x.set(0);
          animatingRef.current = false;
          setPaging(false);
          animationControlsRef.current = null;
        },
      });
    },
    [pageWidth, setCurrentDate, x],
  );

  const handlePanStart = () => {
    stopPagingAnim();
    panStartXRef.current = x.get();
    panModeRef.current = pressLockRef.current ? 'blocked' : 'pending';
    panOffsetYRef.current = 0;
    panVelocityYRef.current = 0;
  };

  const handlePan = (_: unknown, info: PanInfo) => {
    if (!pageWidth) return;

    panOffsetYRef.current = info.offset.y;
    panVelocityYRef.current = info.velocity.y;

    if (pressLockRef.current || panModeRef.current === 'blocked') {
      x.set(panStartXRef.current);
      return;
    }

    if (panModeRef.current === 'stack') {
      x.set(panStartXRef.current);
      return;
    }

    const dx = info.offset.x;
    const dy = info.offset.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (panModeRef.current === 'pending') {
      if (adx < PAN_ACTIVATE_PX && ady < PAN_ACTIVATE_PX) {
        x.set(panStartXRef.current);
        return;
      }
      // Vertical: week agenda scrolls natively; month view can switch calendars.
      if (ady >= PAN_ACTIVATE_PX && ady > adx * AXIS_LOCK_RATIO) {
        panModeRef.current = canSwipeCalendarStack ? 'stack' : 'blocked';
        x.set(panStartXRef.current);
        return;
      }
      if (adx < PAN_ACTIVATE_PX) {
        x.set(panStartXRef.current);
        return;
      }
      panModeRef.current = 'pan';
    }

    // Follow finger within ±1 page; soft rubber past that (no hard blink wall)
    const raw = panStartXRef.current + dx;
    x.set(rubberBand(raw, pageWidth));
  };

  const handlePanEnd = (_: unknown, info: PanInfo) => {
    if (!pageWidth) return;

    const wasPanning = panModeRef.current === 'pan' && !pressLockRef.current;
    const wasVerticalStack = panModeRef.current === 'stack' && !pressLockRef.current;
    const dy = info.offset.y || panOffsetYRef.current;
    const vy = info.velocity.y || panVelocityYRef.current;
    panModeRef.current = 'pending';

    if (wasVerticalStack && onSwipeCalendarStack) {
      const flicked = Math.abs(vy) > STACK_COMMIT_VELOCITY;
      const dragged = Math.abs(dy) > STACK_COMMIT_PX;
      if (flicked || dragged) {
        // Finger up → content moves up → next calendar below
        if (dy < 0 || (flicked && vy < 0)) onSwipeCalendarStack(1);
        else onSwipeCalendarStack(-1);
      }
      x.set(0);
      return;
    }

    if (!wasPanning) {
      if (Math.abs(x.get()) > 0.5) flingToHops(0);
      else x.set(0);
      return;
    }

    const px = x.get();
    const vx = info.velocity.x;
    let hops = 0;

    const flicked = Math.abs(vx) > COMMIT_VELOCITY;
    const dragged = Math.abs(px) > pageWidth * COMMIT_RATIO;
    if (flicked || dragged) {
      if (Math.abs(px) > pageWidth * 0.06) {
        hops = px < 0 ? 1 : -1;
      } else {
        hops = vx < 0 ? 1 : -1;
      }
    }

    flingToHops(hops);
  };

  const handleDayTap = (day: Date) => {
    requestAnimationFrame(() => onSelectDate(day));
    // iPhone uses a sheet; iPad updates the persistent day inspector.
    if (isMobile) tryOpenSheet(() => setDaySheetDate(day));
  };

  const getMemberForEvent = (event: Event) => {
    return members.find((m) => m.id === event.owner_member_id);
  };

  const openYearView = () => {
    stopPagingAnim();
    x.set(0);
    setShowYear(true);
  };

  const closeYearView = () => {
    stopPagingAnim();
    x.set(0);
    setShowYear(false);
  };

  const daySheetEvents = daySheetDate
    ? eventsByDate[format(daySheetDate, 'yyyy-MM-dd')] || []
    : [];
  const selectedDateStr = format(focusedDay, 'yyyy-MM-dd');

  return (
    <>
      <div className="relative flex flex-col h-full min-h-0">
        <div className={`flex flex-col h-full min-h-0 ${showYear ? 'invisible pointer-events-none' : ''}`}>
        {/* Month title + year strip — peeks with the day grid */}
        <div
          className="relative shrink-0 overflow-hidden"
          style={{ backgroundColor: monthTheme.paper }}
        >
          <div className="relative h-[5.75rem] overflow-hidden">
            <motion.div
              className="absolute top-0 bottom-0 flex will-change-transform"
              style={{
                x,
                width: pageWidth ? pageWidth * (WINDOW * 2 + 1) : '500%',
                left: pageWidth ? -pageWidth * WINDOW : '-200%',
              }}
            >
              {stripDates.map((date, i) => {
                const theme = i === WINDOW ? monthTheme : getMonthTheme(date);
                return (
                  <MonthHeaderPanel
                    key={`${date.getFullYear()}-${date.getMonth()}`}
                    width={pageWidth}
                    monthLabel={format(date, 'MMMM', { locale: dateLocale })}
                    yearLabel={format(date, 'yyyy')}
                    textColor={theme.base}
                    lineColor={theme.base}
                    paperColor={theme.paper}
                    textShadow={theme.chromeShadow}
                    onTitleClick={i === WINDOW ? openYearView : undefined}
                  />
                );
              })}
            </motion.div>
          </div>
        </div>

        <div className="relative shrink-0" style={{ backgroundColor: monthTheme.paper }}>
          <div className="grid grid-cols-7 w-full pb-1.5 pt-1">
              {weekdayLabels.map((d, i) => {
              const isSunday = i === 6;
              return (
              <div
                key={`${d}-${i}`}
                className="text-center font-calendar text-sm font-semibold uppercase tracking-wide"
                style={{
                  color: isSunday
                    ? sundayAccentForMonth(currentDate.getMonth())
                    : monthTheme.base,
                  textShadow: isSunday ? undefined : monthTheme.chromeShadow,
                }}
              >
                {d}
              </div>
            );
            })}
          </div>
        </div>

        {/* Continuous infinite-feel month strip — touch-action:none so Android gets H+V gestures */}
        <div
          ref={trackRef}
          className="relative flex-1 min-h-0 overflow-hidden select-none calendar-gesture-surface"
          style={{ backgroundColor: monthTheme.paper }}
        >
          <motion.div
            className="absolute top-0 bottom-0 flex will-change-transform"
            style={{
              x,
              width: pageWidth ? pageWidth * (WINDOW * 2 + 1) : '500%',
              left: pageWidth ? -pageWidth * WINDOW : '-200%',
              touchAction: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
            }}
            onPanStart={showYear ? undefined : handlePanStart}
            onPan={showYear ? undefined : handlePan}
            onPanEnd={showYear ? undefined : handlePanEnd}
          >
            {stripDates.map((date, i) => {
              const byDate = eventsByOffset[i];
              const neighbour = {
                ...(eventsByOffset[i - 1] || {}),
                ...(eventsByOffset[i + 1] || {}),
              };
              return (
                <MonthPanel
                  key={`${date.getFullYear()}-${date.getMonth()}`}
                  width={pageWidth}
                  monthDate={date}
                  days={daysByOffset[i]}
                  eventsByDate={byDate}
                  neighbourEventsByDate={neighbour}
                  monthTheme={i === WINDOW ? monthTheme : getMonthTheme(date)}
                  members={members}
                  highlight={highlight}
                  interactive={i === WINDOW}
                  onTap={handleDayTap}
                  onLongPress={onCreateEvent}
                  onPressLock={lockStripForPress}
                  onPressUnlock={unlockStripForPress}
                  getMemberForEvent={getMemberForEvent}
                  marksVisible={marksVisible && !eventsHidden}
                  selectedDateStr={selectedDateStr}
                  showSelection={!isMobile}
                />
              );
            })}
          </motion.div>
        </div>

        <div
          className="shrink-0 flex justify-center px-4 pt-2.5 pb-[max(0.85rem,env(safe-area-inset-bottom))]"
          style={{ backgroundColor: monthTheme.paper }}
        >
          <button
            type="button"
            onClick={() => setEventsHidden((v) => !v)}
            className="min-h-9 px-4 rounded-full text-sm font-semibold active:opacity-80"
            style={{
              color: monthTheme.base,
              backgroundColor: withAlpha(monthTheme.base, 0.16),
              textShadow: monthTheme.chromeShadow,
            }}
          >
            {eventsHidden ? t('common.showEvents') : t('common.hideEvents')}
          </button>
        </div>

        </div>


        <AnimatePresence>
          {showYear && (
            <motion.div
              key="year-overlay"
              initial={{ y: 6 }}
              animate={{ y: 0 }}
              exit={{ opacity: 0 }}
              transition={fadeQuick}
              className="absolute inset-0 z-30 flex flex-col"
              style={{ backgroundColor: PASTEL.calendarPaper }}
            >
              <YearView
                year={year}
                onSelectMonth={(m) => {
                  jumpToMonth(new Date(year, m, 1));
                  closeYearView();
                }}
                onBack={closeYearView}
                onChangeYear={(y) => jumpToMonth(new Date(y, month, 1))}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {daySheetDate && (
        <CalendarDaySheet
          date={daySheetDate}
          events={daySheetEvents}
          members={members}
          householdId={householdId}
          currentMemberId={currentMemberId}
          onClose={() => setDaySheetDate(null)}
          onPickEvent={(ev) => {
            const display = ev as DisplayEvent;
            if (display.isWorkBlock) {
              setWorkBlock(display);
              return;
            }
            if (display.isOverlay) {
              setOverlayEvent(display);
              return;
            }
            setDetailEvent(ev);
          }}
          onCreateForDate={(d) => {
            onCreateEvent(d);
          }}
          onImportForDate={onImportForDate}
          calendarKind={calendarKind}
          canSeedWeek={canSeedWeek}
          onSeedWeek={() => {
            setDaySheetDate(null);
            onSeedWeek?.();
          }}
        />
      )}

      {workBlock && (
        <WorkBlockSheet event={workBlock} onClose={() => setWorkBlock(null)} />
      )}

      {overlayEvent && (
        <OverlayEventSheet
          event={overlayEvent}
          viewerHouseholdId={householdId}
          onClose={() => setOverlayEvent(null)}
          onOpenSourceCalendar={(id) => {
            setOverlayEvent(null);
            setDaySheetDate(null);
            onSwitchCalendar?.(id);
          }}
        />
      )}

      {detailEvent && (
        <EventDetailSheet
          event={detailEvent}
          members={members}
          currentMemberId={currentMemberId}
          calendarKind={calendarKind}
          showInOtherCalendars={showInOtherCalendars}
          onClose={() => setDetailEvent(null)}
          onEdit={onEditEvent ? (ev) => { onEditEvent(ev); } : undefined}
          onQuickEdit={onQuickEditEvent ? (ev) => { onQuickEditEvent(ev); } : undefined}
        />
      )}
    </>
  );
};

/* ---------- Peeking month header panel ---------- */

const MonthHeaderPanel = ({
  width,
  monthLabel,
  yearLabel,
  textColor,
  lineColor,
  paperColor,
  textShadow,
  onTitleClick,
}: {
  width: number;
  monthLabel: string;
  yearLabel: string;
  textColor: string;
  lineColor: string;
  paperColor: string;
  textShadow?: string;
  onTitleClick?: () => void;
}) => {
  const title = (
    <div className="flex w-full min-w-0 items-center gap-3">
      <h2
        className="font-calendar min-w-0 flex-1 text-[clamp(2.85rem,12.5vw,3.75rem)] font-black capitalize leading-none tracking-wide"
        style={{ color: textColor, textShadow }}
      >
        {monthLabel}
      </h2>
      <span
        className="h-11 w-px shrink-0"
        style={{ backgroundColor: lineColor }}
        aria-hidden
      />
      <span
        className="font-calendar shrink-0 text-lg font-black tabular-nums leading-none tracking-wide"
        style={{
          color: textColor,
          textShadow,
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
        }}
      >
        {yearLabel}
      </span>
    </div>
  );

  return (
    <div
      className="relative flex h-full shrink-0 items-center px-2.5 py-2"
      style={{ width: width || '33.333%', backgroundColor: paperColor }}
    >
      {onTitleClick ? (
        <button type="button" onClick={onTitleClick} className="w-full min-w-0 text-left active:opacity-80">
          {title}
        </button>
      ) : (
        title
      )}
    </div>
  );
};

/* ---------- Month panel ---------- */

interface MonthPanelProps {
  width: number;
  monthDate: Date;
  days: Date[];
  eventsByDate: Record<string, DisplayEvent[]>;
  /** Events from adjacent months so padding days stay filled */
  neighbourEventsByDate?: Record<string, DisplayEvent[]>;
  monthTheme: ReturnType<typeof getMonthTheme>;
  members: HouseholdMember[];
  highlight: Highlight;
  interactive: boolean;
  onTap: (day: Date) => void;
  onLongPress: (day: Date) => void;
  onPressLock: () => void;
  onPressUnlock: () => void;
  getMemberForEvent: (event: Event) => HouseholdMember | undefined;
  marksVisible?: boolean;
  /** Selected day on iPad/desktop. Today keeps its own circle. */
  selectedDateStr?: string;
  showSelection?: boolean;
}

const MonthPanel = ({
  width,
  monthDate,
  days,
  eventsByDate,
  neighbourEventsByDate,
  monthTheme,
  members,
  highlight,
  interactive,
  onTap,
  onLongPress,
  onPressLock,
  onPressUnlock,
  getMemberForEvent,
  marksVisible = true,
  selectedDateStr,
  showSelection = false,
}: MonthPanelProps) => {
  const spanByDate = useMemo(
    () => buildSpanSegmentsByDate(days, eventsByDate, neighbourEventsByDate),
    [days, eventsByDate, neighbourEventsByDate],
  );

  const weeks = useMemo(() => {
    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7));
    }
    return rows;
  }, [days]);

  const gridLine = withAlpha(monthTheme.base, 0.82);
  const weekInk = withAlpha(monthTheme.base, 0.88);

  return (
    <div
      className={`flex flex-col h-full min-h-0 shrink-0 pt-0 pb-[max(0.25rem,env(safe-area-inset-bottom))] ${
        interactive ? '' : 'pointer-events-none'
      }`}
      style={{ width: width || '33.333%', backgroundColor: monthTheme.paper }}
    >
      <div className="flex flex-col flex-1 min-h-0">
        {weeks.map((weekDays) => {
          const weekNum = getISOWeek(weekDays[0]);
          const weekLaneCount = Math.min(
            MAX_SPAN_LANES,
            weekDays.reduce((max, day) => {
              const segs = spanByDate.get(format(day, 'yyyy-MM-dd')) || [];
              return Math.max(max, maxSpanLane(segs) + 1);
            }, 0),
          );
          return (
            <div
              key={format(weekDays[0], 'yyyy-MM-dd')}
              className="grid grid-cols-7 flex-1 min-h-0 auto-rows-[minmax(0,1fr)] content-stretch"
              style={{
                borderTop: `1.5px solid ${gridLine}`,
              }}
            >
              {weekDays.map((day, dayIndex) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const inMonth = isSameMonth(day, monthDate);
                const allDayEvents = eventsByDate[dateStr] || neighbourEventsByDate?.[dateStr] || [];
                const dayEvents = allDayEvents.filter((ev) => !isMultiDayEvent(ev));
                const spanSegments = spanByDate.get(dateStr) || [];
                return (
                  <DayCell
                    key={dateStr}
                    day={day}
                    dateStr={dateStr}
                    dayEvents={dayEvents}
                    spanSegments={spanSegments}
                    inMonth={inMonth}
                    today={isToday(day)}
                    isSunday={day.getDay() === 0}
                    isHighlighted={!!(highlight && highlight.dateStr === dateStr)}
                    monthTheme={monthTheme}
                    members={members}
                    highlight={highlight}
                    onTap={onTap}
                    onLongPress={onLongPress}
                    onPressLock={onPressLock}
                    onPressUnlock={onPressUnlock}
                    getMemberForEvent={getMemberForEvent}
                    marksVisible={marksVisible}
                    selected={!!showSelection && selectedDateStr === dateStr}
                    gridLine={gridLine}
                    showRightBorder={dayIndex < 6}
                    weekNumber={dayIndex === 0 ? weekNum : undefined}
                    weekNumberColor={weekInk}
                    weekLaneCount={weekLaneCount}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ---------- DayCell with long-press ---------- */

interface DayCellProps {
  day: Date;
  dateStr: string;
  dayEvents: DisplayEvent[];
  spanSegments: SpanSegment[];
  inMonth: boolean;
  today: boolean;
  isSunday: boolean;
  isHighlighted: boolean;
  monthTheme: ReturnType<typeof getMonthTheme>;
  members: HouseholdMember[];
  highlight: Highlight;
  onTap: (day: Date) => void;
  onLongPress: (day: Date) => void;
  onPressLock: () => void;
  onPressUnlock: () => void;
  getMemberForEvent: (event: Event) => HouseholdMember | undefined;
  marksVisible?: boolean;
  /** Soft fill on the day number. Does not replace today's ring. */
  selected?: boolean;
  gridLine?: string;
  showRightBorder?: boolean;
  /** ISO week number drawn tiny above Monday so it takes no column */
  weekNumber?: number;
  weekNumberColor?: string;
  /** Shared span-lane count for the week so bars stay on one level */
  weekLaneCount?: number;
}

/** Max single-day marks shown before +N overflow */
const MAX_VISIBLE_MARKS = 3;
/** Icon sits optically centered in the chip */
const CAL_ICON_SIZE = 11;
const CAL_ICON_STROKE = 2.2;
/** Single-day mark: round chip; flex box centers the SVG */
const DAY_PILL =
  'h-[1.15rem] w-[1.15rem] rounded-full inline-flex items-center justify-center shrink-0 leading-none overflow-hidden';
const SPAN_ROW_H = 'h-[0.55rem]';
/** Multi-day rail ends — soft round like the reference calendar */
const SPAN_ROUND_START = 'rounded-l-full';
const SPAN_ROUND_END = 'rounded-r-full';

function MarkGlyph({
  Icon,
  color,
}: {
  Icon: LucideIcon;
  color: string;
}) {
  return (
    <span className="pointer-events-none flex h-full w-full items-center justify-center leading-none">
      <Icon
        size={CAL_ICON_SIZE}
        strokeWidth={CAL_ICON_STROKE}
        className="block shrink-0"
        style={{ color, display: 'block' }}
      />
    </span>
  );
}

/** Pack single-day marks: one mini-rail per row (same language as multi-day spans). */
function packEventRows(events: DisplayEvent[], maxMarks: number): { rows: DisplayEvent[][]; overflow: number } {
  const sorted = [...events].sort((a, b) => {
    const aRank = CATEGORY_ORDER[a.category ?? 'other'] ?? 999;
    const bRank = CATEGORY_ORDER[b.category ?? 'other'] ?? 999;
    if (aRank !== bRank) return aRank - bRank;
    return (a.start_time || '').localeCompare(b.start_time || '');
  });

  const rows: DisplayEvent[][] = [];
  let shown = 0;

  for (const ev of sorted) {
    if (shown >= maxMarks) break;
    rows.push([ev]);
    shown += 1;
  }

  return { rows, overflow: events.length - shown };
}

const DayCell = ({
  day,
  dateStr,
  dayEvents,
  spanSegments,
  inMonth,
  today,
  isSunday,
  isHighlighted,
  monthTheme,
  members: _members,
  highlight,
  onTap,
  onLongPress,
  onPressLock,
  onPressUnlock,
  getMemberForEvent,
  marksVisible = true,
  selected = false,
  gridLine,
  showRightBorder = false,
  weekNumber,
  weekNumberColor,
  weekLaneCount = 0,
}: DayCellProps) => {
  const { dateLocale } = useLocale();
  const dayAriaLabel = format(day, 'EEEE d. MMMM yyyy', { locale: dateLocale });
  const { longPressHandlers, didFire } = useLongPress({
    onRecognize: onPressLock,
    onLongPress: () => {
      onLongPress(day);
    },
    onDisarm: onPressUnlock,
  });

  const handleClick = () => {
    if (didFire()) return;
    onTap(day);
  };

  const { rows, overflow } = packEventRows(dayEvents, MAX_VISIBLE_MARKS);
  const spanByLane = new Map(spanSegments.map((s) => [s.lane, s]));
  const reservedLanes = Math.max(weekLaneCount, 0);
  const accent = isSunday ? sundayAccentForDate(day) : monthTheme.base;
  const dateInk = !inMonth ? withAlpha(accent, 0.32) : accent;
  const dateShadow = !isSunday && inMonth ? monthTheme.chromeShadow : undefined;

  const renderEventMark = (ev: DisplayEvent) => {
    const evHighlighted = highlight && highlight.eventId === ev.id;

    if (ev.isWorkBlock) {
      return (
        <div
          key={ev.id}
          title={ev.title}
          className={`${DAY_PILL} ${evHighlighted ? 'ring-1 ring-primary/40' : ''}`}
          style={{
            background: categoryMarkFill(WORK_BLOCK_MARK.soft, WORK_BLOCK_MARK.rail),
          }}
        >
          <MarkGlyph Icon={BriefcaseBusiness} color={WORK_BLOCK_MARK.ink} />
        </div>
      );
    }

    if (ev.isOverlay) {
      const fromWork = (ev.sourceHouseholdKind || '').toLowerCase() === 'work';
      return (
        <div
          key={ev.id}
          title={ev.title}
          className={`${DAY_PILL} ${evHighlighted ? 'ring-1 ring-primary/40' : ''}`}
          style={{
            background: categoryMarkFill(OVERLAY_MARK.soft, OVERLAY_MARK.rail),
          }}
        >
          {fromWork ? (
            <MarkGlyph Icon={BriefcaseBusiness} color={OVERLAY_MARK.ink} />
          ) : null}
        </div>
      );
    }

    const member = getMemberForEvent(ev);
    const meta = EVENT_CATEGORY_META[(ev.category as keyof typeof EVENT_CATEGORY_META) || 'other'];
    const visuals = resolveCategoryVisuals(ev.category, getMemberColorMap(member));
    const Icon = meta?.Icon;

    return (
      <div
        key={ev.id}
        title={ev.title}
        className={`${DAY_PILL} ${evHighlighted ? 'ring-1 ring-primary/40' : ''}`}
        style={{
          background: categoryMarkFill(visuals.soft, visuals.rail),
        }}
      >
        {Icon ? (
          <MarkGlyph Icon={Icon} color={visuals.ink} />
        ) : (
          <span
            className="block w-1 h-1 rounded-full shrink-0"
            style={{ backgroundColor: visuals.ink }}
          />
        )}
      </div>
    );
  };

  return (
    <button
      {...longPressHandlers}
      onClick={handleClick}
      aria-label={dayAriaLabel}
      className={`relative flex flex-col items-stretch justify-start pt-0.5 pb-0 px-0.5 min-h-0 h-full overflow-hidden ${
        isHighlighted ? 'ring-2 ring-inset ring-primary/40' : ''
      }`}
      style={{
        borderRight: showRightBorder && gridLine ? `1.5px solid ${gridLine}` : undefined,
      }}
    >
      {weekNumber != null && (
        <span
          className="pointer-events-none absolute left-1 top-0.5 z-[2] select-none font-digits text-[10px] font-semibold tabular-nums leading-none"
          style={{ color: weekNumberColor, textShadow: monthTheme.chromeShadow }}
          aria-hidden
        >
          {weekNumber}
        </span>
      )}
      <span
        className={`mx-auto w-9 h-9 shrink-0 flex items-center justify-center rounded-full font-digits text-xl font-bold tabular-nums leading-none ${
          today ? 'border-[1.5px] border-primary text-primary font-extrabold' : ''
        } ${selected && !today ? 'bg-primary/15' : ''}`}
        style={{ color: today ? undefined : dateInk, textShadow: today ? undefined : dateShadow }}
      >
        {format(day, 'd')}
      </span>

      <div
        className="mt-0 w-full flex flex-col gap-px min-h-0 flex-1 px-0 z-[1] transition-opacity duration-500 ease-out"
        style={{ opacity: marksVisible ? 1 : 0 }}
      >
        {reservedLanes > 0 && (
          <div className="w-full flex flex-col gap-[3px] shrink-0">
            {Array.from({ length: reservedLanes }, (_, lane) => {
              const seg = spanByLane.get(lane);
              if (!seg) {
                return <div key={`lane-${lane}`} className={`${SPAN_ROW_H} w-full`} aria-hidden />;
              }
              const segEvent = seg.event as DisplayEvent;
              const isOverlay = !!segEvent.isOverlay;
              const isWorkBlock = !!segEvent.isWorkBlock;
              const member = isOverlay || isWorkBlock ? undefined : getMemberForEvent(seg.event);
              const visuals = isWorkBlock
                ? WORK_BLOCK_MARK
                : isOverlay
                  ? OVERLAY_MARK
                  : resolveCategoryVisuals(seg.event.category, getMemberColorMap(member));
              const evHighlighted = highlight && highlight.eventId === seg.event.id;

              return (
                <div
                  key={seg.event.id}
                  title={seg.event.title}
                  className={`relative ${SPAN_ROW_H} w-full`}
                >
                  <div
                    aria-hidden
                    className={`absolute inset-y-0 left-0 right-0 ${
                      seg.isStart ? SPAN_ROUND_START : ''
                    } ${seg.isEnd ? SPAN_ROUND_END : ''} ${
                      evHighlighted ? 'ring-1 ring-primary/40' : ''
                    }`}
                    style={{
                      backgroundColor: visuals.soft,
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
        {(rows.length > 0 || overflow > 0) && (
          <div className="w-full flex flex-col items-center gap-0.5 mt-auto">
            {rows.map((row, i) => (
              <div
                key={row.map((e) => e.id).join('-') || i}
                className="w-full flex flex-col items-center"
              >
                {row.map((ev) => renderEventMark(ev))}
              </div>
            ))}
            {overflow > 0 && (
              <div className="font-digits text-sm text-muted-foreground text-center font-medium tabular-nums leading-none shrink-0">
                +{overflow}
              </div>
            )}
          </div>
        )}
      </div>
    </button>
  );
};

const YearView = ({ year, onSelectMonth, onBack, onChangeYear }: { year: number; onSelectMonth: (m: number) => void; onBack: () => void; onChangeYear: (y: number) => void }) => {
  const { dateLocale } = useLocale();
  const months = Array.from({ length: 12 }, (_, i) => i);
  const now = new Date();
  const theme = getMonthTheme(new Date(year, 0, 1));

  return (
    <div className="flex flex-col h-full min-h-0">
      <ViewHeader
        variant="calendar"
        onPrev={() => onChangeYear(year - 1)}
        onNext={() => onChangeYear(year + 1)}
        onTitleClick={onBack}
        calendarStyle={{ backgroundColor: theme.light, color: theme.textOnLight }}
      >
        {year}
      </ViewHeader>

      <div className="grid grid-cols-3 gap-2.5 px-2.5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex-1 content-start overflow-y-auto scroll-touch overscroll-contain">
        {months.map((m) => {
          const theme = getMonthTheme(new Date(year, m, 1));
          const isCurrentMonth = now.getFullYear() === year && now.getMonth() === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onSelectMonth(m)}
              className={`rounded-2xl py-5 text-center transition-all duration-200 ${
                isCurrentMonth ? 'ring-2 ring-offset-2' : ''
              }`}
              style={{
                backgroundColor:
                  theme.paper !== PASTEL.calendarPaper ? theme.paper : theme.base,
                ...(isCurrentMonth ? { ringColor: theme.dark, borderColor: theme.dark } : {}),
              }}
            >
              <span
                className="font-calendar text-3xl font-black capitalize tracking-wide"
                style={{
                  color:
                    theme.paper !== PASTEL.calendarPaper ? theme.base : PASTEL.calendarPaper,
                }}
              >
                {format(new Date(year, m, 1), 'MMM', { locale: dateLocale })}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarView;
