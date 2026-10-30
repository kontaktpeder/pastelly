import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect, type Dispatch, type SetStateAction } from 'react';
import { motion, AnimatePresence, useMotionValue, animate, type PanInfo } from 'framer-motion';
import { format, startOfMonth, endOfMonth, startOfWeek, eachDayOfInterval, isToday, isSameMonth, addMonths, getISOWeek, addDays, type Locale } from 'date-fns';
import { useEventsForMonth, type Event } from '@/hooks/useEvents';
import {
  mergeEventsWithOverlays,
  useOverlayEventsForRange,
  OVERLAY_MARK,
  type DisplayEvent,
} from '@/hooks/useOverlayEvents';
import { mergeWorkBlocks, useWorkScheduleBlocks, WORK_BLOCK_MARK } from '@/hooks/useWorkSchedule';
import { resolveCategoryVisuals, getMemberColorMap } from '@/lib/categoryPresentation';
import { EVENT_CATEGORY_META } from '@/lib/eventCategories';
import { getMonthTheme, PASTEL, sundayAccentForMonth, withAlpha } from '@/lib/monthTheme';
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
const COMMIT_RATIO = 0.14;
const COMMIT_VELOCITY = 220;
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
const PAN_ACTIVATE_PX = 6;
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
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  // Always 6 week rows so grid lines align when swiping between months.
  const calEnd = addDays(calStart, 6 * 7 - 1);
  return eachDayOfInterval({ start: calStart, end: calEnd });
}

/**
 * Optical gap before the custom period, keyed by abbreviated stem (nb/en).
 * Tuned for Montserrat Black + tracking-tighter so the dot sits close without colliding.
 */
const MONTH_DOT_GAP_EM: Record<string, number> = {
  jan: 0.08,
  feb: 0.1,
  aug: 0.04,
  sep: 0.07,
  sept: 0.07,
  okt: 0.1,
  oct: 0.1,
  nov: 0.08,
  des: 0.1,
  dec: 0.1,
};

function monthDotGapEm(label: string): number {
  const key = label.replace(/\.+$/u, '').trim().toLowerCase();
  return MONTH_DOT_GAP_EM[key] ?? 0.1;
}

/** Short months stay full; long names use MMM so header type can stay large. */
function formatMonthHeaderLabel(
  date: Date,
  locale: Locale,
): { label: string; showDot: boolean; dotGapEm: number } {
  const full = format(date, 'MMMM', { locale });
  if (full.length <= 5) return { label: full, showDot: false, dotGapEm: 0 };
  // Strip locale periods; render a smaller custom dot in the header.
  const label = format(date, 'MMM', { locale }).replace(/\.+$/u, '');
  return {
    label,
    showDot: true,
    dotGapEm: monthDotGapEm(label),
  };
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
    (hops: number, velocity = 0) => {
      if (!pageWidth) return;

      const clamped = Math.max(-MAX_HOPS_PER_SWIPE, Math.min(MAX_HOPS_PER_SWIPE, hops));
      animatingRef.current = true;
      // Don't flip pointer-events mid-settle — that remounts cells and blinks at the edge
      setPaging(true);

      // Overdamped spring: keeps the release speed, then lands without bounce.
      const maxV = pageWidth * 5.5;
      const snap = {
        type: 'spring' as const,
        stiffness: 780,
        damping: 42,
        mass: 0.42,
        velocity: Math.max(-maxV, Math.min(maxV, velocity)),
        restDelta: 0.4,
        restSpeed: 50,
      };

      if (clamped === 0) {
        animationControlsRef.current = animate(x, 0, {
          ...snap,
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
        ...snap,
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

    const vx = info.velocity.x;

    if (!wasPanning) {
      if (Math.abs(x.get()) > 0.5) flingToHops(0, vx);
      else x.set(0);
      return;
    }

    const px = x.get();
    let hops = 0;

    const flicked = Math.abs(vx) > COMMIT_VELOCITY;
    const dragged = Math.abs(px) > pageWidth * COMMIT_RATIO;
    if (flicked || dragged) {
      if (Math.abs(px) > pageWidth * 0.04) {
        hops = px < 0 ? 1 : -1;
      } else {
        hops = vx < 0 ? 1 : -1;
      }
    }

    flingToHops(hops, vx);
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
          className="relative shrink-0 overflow-hidden pt-[max(0.35rem,env(safe-area-inset-top))]"
          style={{ backgroundColor: monthTheme.paper }}
        >
          <div className="relative h-[7.75rem] overflow-hidden">
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
                const monthHeader = formatMonthHeaderLabel(date, dateLocale);
                return (
                  <MonthHeaderPanel
                    key={`${date.getFullYear()}-${date.getMonth()}`}
                    width={pageWidth}
                    monthLabel={monthHeader.label}
                    monthDot={monthHeader.showDot}
                    monthDotGapEm={monthHeader.dotGapEm}
                    yearLabel={format(date, 'yyyy')}
                    textColor={theme.base}
                    paperColor={theme.paper}
                    onTitleClick={i === WINDOW ? openYearView : undefined}
                  />
                );
              })}
            </motion.div>
          </div>
        </div>

        <div className="relative h-8 shrink-0 overflow-hidden" style={{ backgroundColor: monthTheme.paper }}>
          <motion.div
            className="absolute top-0 bottom-0 flex will-change-transform"
            style={{
              x,
              width: pageWidth ? pageWidth * (WINDOW * 2 + 1) : '500%',
              left: pageWidth ? -pageWidth * WINDOW : '-200%',
            }}
          >
            {stripDates.map((date) => {
              const theme = getMonthTheme(date);
              const sunday = sundayAccentForMonth(date.getMonth());
              return (
                <div
                  key={`${date.getFullYear()}-${date.getMonth()}-wd`}
                  className="grid h-full shrink-0 grid-cols-7 items-center"
                  style={{ width: pageWidth || '20%' }}
                >
                  {weekdayLabels.map((d, i) => (
                    <div
                      key={`${d}-${i}`}
                      className="text-center font-calendar text-sm font-semibold uppercase tracking-wide"
                      style={{ color: i === 6 ? sunday : theme.base }}
                    >
                      {d}
                    </div>
                  ))}
                </div>
              );
            })}
          </motion.div>
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

/** Probe size for offscreen month/year measuring only — never applied to live DOM. */
const HEADER_FIT_PROBE_PX = 100;
/** Fixed trailing column for divider + vertical year (house uses pr-14 outside). */
const HEADER_YEAR_COL_PX = 36;
/** Ignore sub-pixel jitter so ResizeObserver / fonts.ready don't thrash state. */
const HEADER_FIT_EPSILON_PX = 0.35;

type HeaderFitSizes = { monthPx: number; yearPx: number };

/** Survive strip remounts (swipe recenter / year jump) so first paint is already sized. */
const headerFitCache = new Map<string, HeaderFitSizes>();
/** Bump when fit math changes so stale entries are ignored. */
const HEADER_FIT_CACHE_VER = 'y4';
/** Vertical year stack vs month letter height — leftover is equal air via items-center. */
const HEADER_YEAR_STACK_RATIO = 0.96;

function headerFitCacheKey(
  monthLabel: string,
  monthDot: boolean,
  monthDotGapEm: number,
  yearLabel: string,
  availW: number,
  availH: number,
) {
  return `${HEADER_FIT_CACHE_VER}|${monthLabel}|${monthDot ? 1 : 0}|${monthDotGapEm}|${yearLabel}|${Math.round(availW)}|${Math.round(availH)}`;
}

let headerMeasureHost: HTMLDivElement | null = null;

function getHeaderMeasureHost() {
  if (typeof document === 'undefined') return null;
  if (headerMeasureHost?.isConnected) return headerMeasureHost;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  // Avoid contain/visibility tricks — they skew writing-mode metrics offscreen.
  host.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;';
  document.body.appendChild(host);
  headerMeasureHost = host;
  return host;
}

/** Measure fit sizes on a detached clone — never mutates the visible header. */
function measureHeaderFit(opts: {
  monthLabel: string;
  monthDot: boolean;
  monthDotGapEm: number;
  yearLabel: string;
  monthAvailW: number;
  monthAvailH: number;
}): HeaderFitSizes | null {
  const { monthLabel, monthDot, monthDotGapEm, yearLabel, monthAvailW, monthAvailH } = opts;
  if (monthAvailW <= 0 || monthAvailH <= 0) return null;

  const host = getHeaderMeasureHost();
  if (!host) return null;

  host.replaceChildren();

  const monthEl = document.createElement('h2');
  monthEl.className =
    'm-0 whitespace-nowrap font-calendar font-black capitalize leading-none tracking-tighter';
  monthEl.style.cssText = `font-size:${HEADER_FIT_PROBE_PX}px;margin:0;white-space:nowrap;display:inline-block;`;
  monthEl.textContent = monthLabel;
  if (monthDot) {
    const dot = document.createElement('span');
    dot.className = 'font-[inherit] font-bold leading-none';
    dot.style.cssText = `font-size:0.62em;margin-left:${monthDotGapEm}em;vertical-align:baseline;`;
    dot.textContent = '.';
    monthEl.appendChild(dot);
  }
  host.appendChild(monthEl);

  const monthNeedW = monthEl.scrollWidth;
  if (monthNeedW <= 0) {
    host.replaceChildren();
    return null;
  }

  let nextMonth = HEADER_FIT_PROBE_PX * (monthAvailW / monthNeedW) * 0.96;
  nextMonth = Math.min(nextMonth, monthAvailH * 0.92);
  nextMonth = Math.max(20, nextMonth);

  // Year size is analytic (month / digits) — offscreen vertical-rl measure was unstable
  // and caused swipe jumps + off-center seating on the divider.
  const digitCount = Math.max(yearLabel.length, 1);
  const nextYear = (nextMonth * HEADER_YEAR_STACK_RATIO) / digitCount;

  host.replaceChildren();
  return {
    monthPx: Math.round(nextMonth * 100) / 100,
    yearPx: Math.round(nextYear * 100) / 100,
  };
}

const MonthHeaderPanel = ({
  width,
  monthLabel,
  monthDot = false,
  monthDotGapEm = 0.1,
  yearLabel,
  textColor,
  paperColor,
  onTitleClick,
}: {
  width: number;
  monthLabel: string;
  /** Smaller custom period for abbreviated month names. */
  monthDot?: boolean;
  /** Per-abbreviation optical gap before the period (em). */
  monthDotGapEm?: number;
  yearLabel: string;
  textColor: string;
  paperColor: string;
  onTitleClick?: () => void;
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const sizesRef = useRef<HeaderFitSizes>({ monthPx: 48, yearPx: 16 });
  const labelCachePrefix = `${HEADER_FIT_CACHE_VER}|${monthLabel}|${monthDot ? 1 : 0}|${monthDotGapEm}|${yearLabel}|`;
  const [sizes, setSizes] = useState<HeaderFitSizes>(() => {
    // Best-effort first paint from any prior measure for this label (width may refine later).
    for (const [key, value] of headerFitCache) {
      if (key.startsWith(labelCachePrefix)) {
        sizesRef.current = value;
        return value;
      }
    }
    return { monthPx: 48, yearPx: 16 };
  });
  const [fitted, setFitted] = useState(() => {
    for (const key of headerFitCache.keys()) {
      if (key.startsWith(labelCachePrefix)) return true;
    }
    return false;
  });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const slot = slotRef.current;
    if (!panel || !slot) return;
    let cancelled = false;

    const apply = (next: HeaderFitSizes) => {
      if (cancelled) return;
      const prev = sizesRef.current;
      if (
        Math.abs(prev.monthPx - next.monthPx) < HEADER_FIT_EPSILON_PX &&
        Math.abs(prev.yearPx - next.yearPx) < HEADER_FIT_EPSILON_PX
      ) {
        setFitted(true);
        return;
      }
      sizesRef.current = next;
      setSizes(next);
      setFitted(true);
    };

    const fit = () => {
      const monthAvailW = slot.clientWidth;
      const monthAvailH = Math.max(panel.clientHeight - 10, 1);
      if (monthAvailW <= 0) return;

      const key = headerFitCacheKey(
        monthLabel,
        monthDot,
        monthDotGapEm,
        yearLabel,
        monthAvailW,
        monthAvailH,
      );
      const cached = headerFitCache.get(key);
      if (cached) {
        apply(cached);
        return;
      }

      const measured = measureHeaderFit({
        monthLabel,
        monthDot,
        monthDotGapEm,
        yearLabel,
        monthAvailW,
        monthAvailH,
      });
      if (!measured) return;
      headerFitCache.set(key, measured);
      apply(measured);
    };

    fit();
    void document.fonts?.ready?.then(() => {
      if (cancelled) return;
      // Fonts can change metrics — clear this label's cache entries and remeasure offscreen.
      for (const key of [...headerFitCache.keys()]) {
        if (key.startsWith(labelCachePrefix)) {
          headerFitCache.delete(key);
        }
      }
      fit();
    });
    const ro = new ResizeObserver(() => fit());
    ro.observe(panel);
    ro.observe(slot);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [monthLabel, monthDot, monthDotGapEm, yearLabel, width]);

  const { monthPx, yearPx } = sizes;

  const title = (
    <div className="flex h-full w-full min-w-0 items-end gap-2.5">
      <div ref={slotRef} className="flex min-h-0 min-w-0 flex-1 items-end overflow-visible">
        <h2
          className="m-0 whitespace-nowrap font-calendar font-black capitalize leading-none tracking-tighter"
          style={{ color: textColor, fontSize: monthPx }}
        >
          {monthLabel}
          {monthDot ? (
            <span
              aria-hidden
              className="font-[inherit] font-bold leading-none"
              style={{
                fontSize: '0.62em',
                marginLeft: `${monthDotGapEm}em`,
                verticalAlign: 'baseline',
              }}
            >
              .
            </span>
          ) : null}
        </h2>
      </div>
      {/* Column matches month letter height; year is centered on the divider. */}
      <div
        className="flex shrink-0 items-center gap-2"
        style={{ width: HEADER_YEAR_COL_PX, height: monthPx }}
      >
        <span
          className="w-px shrink-0 self-stretch"
          style={{ backgroundColor: textColor, opacity: 0.9 }}
          aria-hidden
        />
        <span
          className="font-calendar font-black tabular-nums leading-none tracking-tight"
          style={{
            color: textColor,
            fontSize: yearPx,
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
          }}
        >
          {yearLabel}
        </span>
      </div>
    </div>
  );

  return (
    <div
      ref={panelRef}
      className="relative flex h-full shrink-0 items-stretch px-3 pb-2 pr-14"
      style={{
        width: width || '33.333%',
        backgroundColor: paperColor,
        // Hold first cold paint until offscreen fit lands — avoids 48→probe flash.
        opacity: fitted ? 1 : 0,
      }}
    >
      {onTitleClick ? (
        <button type="button" onClick={onTitleClick} className="h-full w-full min-w-0 text-left active:opacity-80">
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
/** Stroke icon only — no filled chip behind it */
const CAL_ICON_SIZE = 12;
const CAL_ICON_STROKE = 2.2;
const DAY_MARK =
  'h-[1.15rem] w-[1.15rem] inline-flex items-center justify-center shrink-0 leading-none';
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
    <span className="pointer-events-none flex items-center justify-center leading-none">
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
  const accent = monthTheme.base;
  const dateInk = !inMonth ? withAlpha(accent, 0.32) : accent;

  const renderEventMark = (ev: DisplayEvent) => {
    const evHighlighted = highlight && highlight.eventId === ev.id;

    if (ev.isWorkBlock) {
      return (
        <div
          key={ev.id}
          title={ev.title}
          className={`${DAY_MARK} ${evHighlighted ? 'ring-1 ring-primary/40 rounded-sm' : ''}`}
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
          className={`${DAY_MARK} ${evHighlighted ? 'ring-1 ring-primary/40 rounded-sm' : ''}`}
        >
          {fromWork ? (
            <MarkGlyph Icon={BriefcaseBusiness} color={OVERLAY_MARK.ink} />
          ) : (
            <span
              className="block h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: OVERLAY_MARK.ink }}
            />
          )}
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
        className={`${DAY_MARK} ${evHighlighted ? 'ring-1 ring-primary/40 rounded-sm' : ''}`}
      >
        {Icon ? (
          <MarkGlyph Icon={Icon} color={visuals.ink} />
        ) : (
          <span
            className="block h-1.5 w-1.5 rounded-full shrink-0"
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
          style={{ color: weekNumberColor }}
          aria-hidden
        >
          {weekNumber}
        </span>
      )}
      <span
        className={`mx-auto w-9 h-9 shrink-0 flex items-center justify-center rounded-full font-digits text-xl font-bold tabular-nums leading-none ${
          today ? 'border-[1.5px] border-primary text-primary font-extrabold' : ''
        } ${selected && !today ? 'bg-primary/15' : ''}`}
        style={{ color: today ? undefined : dateInk }}
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
                      backgroundColor: visuals.rail,
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
              className="rounded-2xl py-5 text-center transition-all duration-200"
              style={
                isCurrentMonth
                  ? { boxShadow: `0 0 0 2px ${theme.base}` }
                  : undefined
              }
            >
              <span
                className="font-calendar text-3xl font-black capitalize tracking-wide"
                style={{ color: theme.base }}
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
