import { useState, useMemo, useCallback, useRef, useEffect, type Dispatch, type SetStateAction } from 'react';
import { motion, AnimatePresence, useMotionValue, animate, type PanInfo } from 'framer-motion';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isToday, isWeekend, isSameMonth, isSameWeek, addMonths, subMonths, addWeeks, getISOWeek, addDays, differenceInCalendarDays } from 'date-fns';
import {
  resolveVacationFocusDate,
  weekOverlapsYmd,
} from '@/lib/calendarStrip';
import { useEventsForMonth, type Event } from '@/hooks/useEvents';
import {
  mergeEventsWithOverlays,
  useOverlayEventsForRange,
  OVERLAY_MARK,
  type DisplayEvent,
} from '@/hooks/useOverlayEvents';
import { useActiveCountdowns, type CountdownWithParticipants } from '@/hooks/useCountdowns';
import { resolveCategoryVisuals, getMemberColorMap, silverMarkRim, categoryMarkFill } from '@/lib/categoryPresentation';
import { EVENT_CATEGORY_META } from '@/lib/eventCategories';
import { getMonthTheme, PASTEL } from '@/lib/monthTheme';
import {
  buildSpanSegmentsByDate,
  isMultiDayEvent,
  maxSpanLane,
  MAX_SPAN_LANES,
  type SpanSegment,
} from '@/lib/multiDaySpans';
import { targetDateStr } from '@/lib/countdownTime';
import type { HouseholdMember } from '@/hooks/useHousehold';
import type { Highlight } from '@/pages/Index';
import { useLocale } from '@/hooks/useLocale';
import type { CalendarKind } from '@/lib/calendarKinds';
import ViewHeader from '@/components/ViewHeader';
import CalendarDaySheet from '@/components/CalendarDaySheet';
import EventDetailSheet from '@/components/EventDetailSheet';
import OverlayEventSheet from '@/components/OverlayEventSheet';
import CountdownDetailSheet from '@/components/CountdownDetailSheet';
import { useLongPress } from '@/hooks/useLongPress';
import { useIsMobile } from '@/hooks/use-mobile';
import { fadeQuick } from '@/lib/motion';
import { tryOpenSheet } from '@/lib/sheetGate';
import { consumePendingOpenDay, peekPendingOpenDay, subscribePendingOpenDay } from '@/lib/native/pendingOpenDay';
import {
  consumePendingOpenCountdown,
  peekPendingOpenCountdown,
  subscribePendingOpenCountdown,
} from '@/lib/native/pendingOpenCountdown';
import { BriefcaseBusiness, type LucideIcon } from 'lucide-react';
import { useVacationMode } from '@/hooks/useVacationMode';
import DayOverview from '@/components/DayOverview';
import { VacationWeekStrip } from '@/components/VacationWeekStrip';
import { eventIsWorkdayLayer, formatVacationRange } from '@/lib/vacationMode';
import { getIntlLocale } from '@/lib/i18n';

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
  onCreateCountdown?: (date: Date) => void;
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

function uniqueEventsById(events: DisplayEvent[]): DisplayEvent[] {
  const seen = new Set<string>();
  const out: DisplayEvent[] = [];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    out.push(event);
  }
  return out;
}

function eventsForWeek(all: DisplayEvent[], weekStart: Date): DisplayEvent[] {
  const start = format(weekStart, 'yyyy-MM-dd');
  const end = format(addDays(weekStart, 6), 'yyyy-MM-dd');
  return all.filter((e) => {
    const evEnd = e.end_date || e.event_date;
    return e.event_date <= end && evEnd >= start;
  });
}

function buildWeekDays(weekStart: Date): Date[] {
  return eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
}

function buildMonthDays(monthDate: Date): Date[] {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  return eachDayOfInterval({ start: calStart, end: calEnd });
}

const CalendarView = ({ householdId, members, currentMemberId, calendarKind = 'home', currentDate: controlledDate, selectedDate, onCurrentDateChange, onSelectDate, onCreateEvent, onCreateCountdown, onEditEvent, onQuickEditEvent, onSwitchCalendar, onSwipeCalendarStack, canSwipeCalendarStack = false, highlight, canSeedWeek = false, onSeedWeek, onReady, showInOtherCalendars = false }: CalendarViewProps) => {
  const { dateLocale, locale } = useLocale();
  const vacation = useVacationMode();
  const weekMode = vacation.enabledForCalendar && vacation.snapshot.active;
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

  const visibleRangeStart = vacation.visibleDateRange?.start ?? null;
  const visibleRangeEnd = vacation.visibleDateRange?.end ?? null;

  useEffect(() => {
    if (!weekMode) return;
    const range =
      visibleRangeStart && visibleRangeEnd
        ? { start: visibleRangeStart, end: visibleRangeEnd }
        : null;
    const next = resolveVacationFocusDate(currentDate, range);
    if (next.getTime() === currentDate.getTime()) return;
    setCurrentDate(next);
  }, [weekMode, visibleRangeStart, visibleRangeEnd, currentDate, setCurrentDate]);
  const [showYear, setShowYear] = useState(false);
  useEffect(() => {
    if (weekMode) setShowYear(false);
  }, [weekMode]);
  const [daySheetDate, setDaySheetDate] = useState<Date | null>(null);
  const [detailEvent, setDetailEvent] = useState<Event | null>(null);
  const [overlayEvent, setOverlayEvent] = useState<DisplayEvent | null>(null);
  const [detailCountdown, setDetailCountdown] = useState<CountdownWithParticipants | null>(null);
  const [paging, setPaging] = useState(false);
  const { data: activeCountdowns = [] } = useActiveCountdowns(householdId);

  const countdownsByDate = useMemo(() => {
    const map: Record<string, CountdownWithParticipants[]> = {};
    for (const cd of activeCountdowns) {
      const key = targetDateStr(cd.target_at);
      (map[key] ??= []).push(cd);
    }
    return map;
  }, [activeCountdowns]);

  const countdownEmojiByDate = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [key, list] of Object.entries(countdownsByDate)) {
      map[key] = list[0]?.emoji || '✨';
    }
    return map;
  }, [countdownsByDate]);

  const openDayFromPush = useCallback(
    (dateStr: string) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      if (!y || !m || !d) return;
      const day = new Date(y, m - 1, d);
      setCurrentDate(weekMode ? startOfWeek(day, { weekStartsOn: 1 }) : startOfMonth(day));
      onSelectDate?.(day);
      tryOpenSheet(() => setDaySheetDate(day));
    },
    [onSelectDate, setCurrentDate, weekMode],
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

  const openCountdownFromPush = useCallback(
    (countdownId: string) => {
      const cd = activeCountdowns.find((c) => c.id === countdownId);
      if (!cd) return false;
      consumePendingOpenCountdown();
      openDayFromPush(targetDateStr(cd.target_at));
      setDetailCountdown(cd);
      return true;
    },
    [activeCountdowns, openDayFromPush],
  );

  useEffect(() => {
    const pending = peekPendingOpenCountdown();
    if (pending) openCountdownFromPush(pending);
    return subscribePendingOpenCountdown((id) => {
      openCountdownFromPush(id);
    });
  }, [openCountdownFromPush]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const stripOffsets = useMemo(() => Array.from({ length: WINDOW * 2 + 1 }, (_, i) => i - WINDOW), []);
  const stripDates = useMemo(
    () =>
      stripOffsets.map((off) =>
        weekMode
          ? startOfWeek(addWeeks(currentDate, off), { weekStartsOn: 1 })
          : startOfMonth(addMonths(currentDate, off)),
      ),
    [currentDate, stripOffsets, weekMode],
  );

  const eventFetchDates = useMemo(() => {
    if (!weekMode) return stripDates;
    const first = stripDates[0];
    const last = stripDates[stripDates.length - 1];
    return [first, addDays(first, 6), currentDate, last, addDays(last, 6)];
  }, [stripDates, weekMode, currentDate]);

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
    if (weekMode) {
      return {
        start: format(stripDates[0], 'yyyy-MM-dd'),
        end: format(addDays(stripDates[stripDates.length - 1], 6), 'yyyy-MM-dd'),
      };
    }
    const start = format(startOfMonth(stripDates[0]), 'yyyy-MM-dd');
    const end = format(endOfMonth(stripDates[stripDates.length - 1]), 'yyyy-MM-dd');
    return { start, end };
  }, [stripDates, weekMode]);

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
  const events = monthFetched || monthError ? (eventsRaw ?? []) : [];
  const overlayEvents = overlayFetched || overlayError ? (overlayRaw ?? []) : [];

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
    if (weekMode) {
      const locals = uniqueEventsById([...eventsM2, ...eventsM1, ...events, ...eventsP1, ...eventsP2]);
      const merged = mergeEventsWithOverlays(locals, overlayEvents);
      return stripDates.map((weekStart) => eventsForWeek(merged, weekStart));
    }
    const locals = [eventsM2, eventsM1, events, eventsP1, eventsP2];
    return locals.map((local, i) => {
      const y = stripDates[i].getFullYear();
      const m = stripDates[i].getMonth();
      const monthOverlays = eventsForMonth(overlayEvents, y, m);
      return mergeEventsWithOverlays(local, monthOverlays);
    });
  }, [eventsM2, eventsM1, events, eventsP1, eventsP2, overlayEvents, stripDates, weekMode]);

  const eventsByOffset = useMemo(
    () => mergedByOffset.map((list) => buildEventsByDate(vacation.filterEvents(list))),
    [mergedByOffset, vacation.filterEvents, vacation.snapshot.active, vacation.revealHidden, vacation.visibleDateRange],
  );
  const eventsByDate = eventsByOffset[WINDOW];

  const daysByOffset = useMemo(
    () => stripDates.map((date) => (weekMode ? buildWeekDays(date) : buildMonthDays(date))),
    [stripDates, weekMode],
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
  }, [weekMode]);

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
      if (weekMode) {
        setCurrentDate(resolveVacationFocusDate(date, vacation.visibleDateRange));
      } else {
        setCurrentDate(startOfMonth(date));
      }
    },
    [setCurrentDate, stopPagingAnim, x, weekMode, vacation.visibleDateRange],
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

      const clamped0 = Math.max(-MAX_HOPS_PER_SWIPE, Math.min(MAX_HOPS_PER_SWIPE, hops));
      let clamped = clamped0;
      if (weekMode && vacation.visibleDateRange && clamped !== 0) {
        const next = startOfWeek(addWeeks(currentDate, clamped), { weekStartsOn: 1 });
        if (!weekOverlapsYmd(next, vacation.visibleDateRange)) clamped = 0;
      }
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
          setCurrentDate((d) =>
            weekMode ? addWeeks(d, clamped) : addMonths(d, clamped),
          );
          x.set(0);
          animatingRef.current = false;
          setPaging(false);
          animationControlsRef.current = null;
        },
      });
    },
    [pageWidth, setCurrentDate, x, weekMode, vacation.visibleDateRange, currentDate],
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
        panModeRef.current = !weekMode && canSwipeCalendarStack ? 'stack' : 'blocked';
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
    if (weekMode) return;
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

  const isOnCurrentMonth = weekMode
    ? isSameWeek(currentDate, new Date(), { weekStartsOn: 1 })
    : isSameMonth(currentDate, new Date());
  const goToToday = () => {
    jumpToMonth(new Date());
  };

  const daySheetEvents = daySheetDate
    ? eventsByDate[format(daySheetDate, 'yyyy-MM-dd')] || []
    : [];
  const weekdayOffset = Math.min(
    6,
    Math.max(0, differenceInCalendarDays(focusedDay, startOfWeek(focusedDay, { weekStartsOn: 1 }))),
  );
  const pickAgendaEvent = (ev: DisplayEvent) => {
    if (ev.isOverlay) setOverlayEvent(ev);
    else setDetailEvent(ev);
  };

  return (
    <>
      <div className="relative flex flex-col h-full min-h-0">
        <div className={`flex flex-col h-full min-h-0 ${showYear ? 'invisible pointer-events-none' : ''}`}>
        {weekMode ? (
          <div
            ref={trackRef}
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden select-none calendar-week-pager"
          >
            {!isOnCurrentMonth && (
              <button
                type="button"
                onClick={goToToday}
                className="absolute right-1.5 top-1.5 z-10 min-h-7 px-2 rounded-full bg-white/80 active:bg-white text-[11px] font-semibold tracking-wide"
                style={{ color: monthTheme.dark }}
              >
                I dag
              </button>
            )}
            <motion.div
              className="flex h-full min-h-0 will-change-transform"
              style={{
                x,
                width: pageWidth ? pageWidth * (WINDOW * 2 + 1) : '500%',
                marginLeft: pageWidth ? -pageWidth * WINDOW : '-200%',
                touchAction: 'pan-y',
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
              onPanStart={showYear ? undefined : handlePanStart}
              onPan={showYear ? undefined : handlePan}
              onPanEnd={showYear ? undefined : handlePanEnd}
            >
              {stripDates.map((date, i) => {
                const agendaDate = addDays(date, weekdayOffset);
                const dateStr = format(agendaDate, 'yyyy-MM-dd');
                const theme = i === WINDOW ? monthTheme : getMonthTheme(date);
                return (
                  <div
                    key={format(date, 'yyyy-MM-dd')}
                    className={`flex h-full min-h-0 shrink-0 flex-col ${
                      i === WINDOW ? '' : 'pointer-events-none'
                    }`}
                    style={{ width: pageWidth || '20%' }}
                  >
                    <div
                      className="flex h-9 shrink-0 items-center justify-center px-5"
                      style={{ backgroundColor: theme.light, color: theme.textOnLight }}
                    >
                      <h2 className="text-base font-extrabold capitalize tracking-wide text-center">
                        {formatVacationRange(date, addDays(date, 6), getIntlLocale(locale))}
                      </h2>
                    </div>
                    <div className="relative shrink-0 bg-transparent">
                      <div className="flex px-1 py-1">
                        <div className="grid min-w-0 flex-1 grid-cols-7">
                          {weekdayLabels.map((d, wi) => (
                            <div
                              key={`${d}-${wi}`}
                              className={`text-center text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                wi >= 5 ? 'text-primary/60' : 'text-foreground/55'
                              }`}
                            >
                              {d}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <VacationWeekStrip
                      width={pageWidth}
                      days={daysByOffset[i]}
                      selectedDate={agendaDate}
                      selectedFill={theme.base}
                      interactive={i === WINDOW}
                      rangeStart={visibleRangeStart}
                      rangeEnd={visibleRangeEnd}
                      onSelectDate={handleDayTap}
                      onLongPress={onCreateEvent}
                      onPressLock={lockStripForPress}
                      onPressUnlock={unlockStripForPress}
                    />
                    <h2 className="shrink-0 px-5 pt-3 pb-1 text-lg font-bold capitalize text-foreground">
                      {format(agendaDate, 'EEEE d. MMMM', { locale: dateLocale })}
                    </h2>
                    <div className="flex min-h-0 flex-1 flex-col">
                      <DayOverview
                        date={agendaDate}
                        events={eventsByOffset[i][dateStr] || []}
                        countdowns={countdownsByDate[dateStr] || []}
                        members={members}
                        householdId={householdId}
                        currentMemberId={currentMemberId}
                        calendarKind={calendarKind}
                        canSeedWeek={canSeedWeek}
                        layout="agenda"
                        onPickEvent={pickAgendaEvent}
                        onPickCountdown={(cd) => setDetailCountdown(cd)}
                        onCreateForDate={onCreateEvent}
                        onCreateCountdown={onCreateCountdown}
                        onSeedWeek={onSeedWeek}
                      />
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </div>
        ) : (
          <>
        {/* Month hint strip — soft wash, peeks with the day grid */}
        <div className="relative rounded-b-xl overflow-hidden shrink-0">
          <div className="relative h-9 overflow-hidden">
            <motion.div
              className="absolute top-0 bottom-0 flex will-change-transform"
              style={{
                x,
                width: pageWidth ? pageWidth * (WINDOW * 2 + 1) : '500%',
                left: pageWidth ? -pageWidth * WINDOW : '-200%',
              }}
            >
              {stripDates.map((date, i) => (
                <MonthHeaderPanel
                  key={`${date.getFullYear()}-${date.getMonth()}`}
                  width={pageWidth}
                  label={format(date, 'MMMM yyyy', { locale: dateLocale })}
                  fill={i === WINDOW ? monthTheme.light : getMonthTheme(date).light}
                  textColor={i === WINDOW ? monthTheme.textOnLight : getMonthTheme(date).textOnLight}
                  onTitleClick={i === WINDOW ? openYearView : undefined}
                />
              ))}
            </motion.div>
          </div>
          {!isOnCurrentMonth && (
            <button
              type="button"
              onClick={goToToday}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 min-h-7 px-2 rounded-full bg-white/80 active:bg-white text-[11px] font-semibold tracking-wide"
              style={{ color: monthTheme.dark }}
            >
              I dag
            </button>
          )}
        </div>

        <div className="bg-transparent relative">
          <div className="flex px-1 py-1">
            <div className="w-3.5 shrink-0" aria-hidden />
            <div className="grid grid-cols-7 flex-1 min-w-0">
              {weekdayLabels.map((d, i) => (
                <div key={`${d}-${i}`} className={`text-center text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  i >= 5 ? 'text-primary/60' : 'text-foreground/55'
                }`}>
                  {d}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Continuous infinite-feel month strip — touch-action:none so Android gets H+V gestures */}
        <div
          ref={trackRef}
          className="relative flex-1 min-h-0 overflow-hidden select-none calendar-gesture-surface"
          style={{ backgroundColor: PASTEL.paper }}
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
                  countdownEmojiByDate={countdownEmojiByDate}
                  marksVisible={marksVisible}
                  vacationActive={vacation.snapshot.active}
                  revealHidden={vacation.revealHidden}
                />
              );
            })}
          </motion.div>
        </div>
          </>
        )}
        </div>

        <AnimatePresence>
          {showYear && (
            <motion.div
              key="year-overlay"
              initial={{ y: 6 }}
              animate={{ y: 0 }}
              exit={{ opacity: 0 }}
              transition={fadeQuick}
              className="absolute inset-0 z-30 bg-background flex flex-col"
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
          countdowns={countdownsByDate[format(daySheetDate, 'yyyy-MM-dd')] || []}
          members={members}
          householdId={householdId}
          currentMemberId={currentMemberId}
          onClose={() => setDaySheetDate(null)}
          onPickEvent={(ev) => {
            const display = ev as DisplayEvent;
            if (display.isOverlay) {
              setOverlayEvent(display);
              return;
            }
            setDetailEvent(ev);
          }}
          onPickCountdown={(cd) => setDetailCountdown(cd)}
          onCreateForDate={(d) => {
            onCreateEvent(d);
          }}
          onCreateCountdown={onCreateCountdown}
          calendarKind={calendarKind}
          canSeedWeek={canSeedWeek}
          onSeedWeek={() => {
            setDaySheetDate(null);
            onSeedWeek?.();
          }}
        />
      )}

      {detailCountdown && (
        <CountdownDetailSheet
          countdown={
            activeCountdowns.find((c) => c.id === detailCountdown.id) ?? detailCountdown
          }
          members={members}
          currentMemberId={currentMemberId}
          onClose={() => setDetailCountdown(null)}
        />
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
  label,
  fill,
  textColor,
  onTitleClick,
}: {
  width: number;
  label: string;
  fill: string;
  textColor: string;
  onTitleClick?: () => void;
}) => (
  <div
    className="h-full shrink-0 flex items-center justify-center px-5 relative"
    style={{
      width: width || '33.333%',
      backgroundColor: fill,
      color: textColor,
    }}
  >
    {onTitleClick ? (
      <button type="button" onClick={onTitleClick} className="relative text-center">
        <h2 className="text-base font-extrabold capitalize text-current tracking-wide">{label}</h2>
      </button>
    ) : (
      <h2 className="relative text-base font-extrabold capitalize text-current tracking-wide text-center">{label}</h2>
    )}
  </div>
);

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
  countdownEmojiByDate?: Record<string, string>;
  marksVisible?: boolean;
  vacationActive?: boolean;
  revealHidden?: boolean;
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
  countdownEmojiByDate,
  marksVisible = true,
  vacationActive = false,
  revealHidden = false,
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

  return (
    <div
      className={`flex flex-col h-full min-h-0 shrink-0 px-1 pt-0.5 pb-[max(0.25rem,env(safe-area-inset-bottom))] ${
        interactive ? '' : 'pointer-events-none'
      }`}
      style={{ width: width || '33.333%' }}
    >
      {weeks.map((weekDays, weekIndex) => {
        const weekNum = getISOWeek(weekDays[0]);
        return (
          <div
            key={format(weekDays[0], 'yyyy-MM-dd')}
            className={`flex flex-1 min-h-0 gap-x-0 ${
              weekIndex > 0 ? (vacationActive ? 'border-t border-transparent' : 'border-t border-border/15') : ''
            }`}
          >
            <div className="w-3.5 shrink-0 flex items-start justify-center pt-1">
              <span className="text-[8px] font-medium tabular-nums leading-none select-none text-muted-foreground/40">
                {weekNum}
              </span>
            </div>
            <div className="grid grid-cols-7 flex-1 min-w-0 min-h-0 auto-rows-[minmax(0,1fr)] gap-x-0 content-stretch">
              {weekDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const inMonth = vacationActive || isSameMonth(day, monthDate);
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
                    weekend={isWeekend(day)}
                    isHighlighted={!!(highlight && highlight.dateStr === dateStr)}
                    monthTheme={monthTheme}
                    members={members}
                    highlight={highlight}
                    onTap={onTap}
                    onLongPress={onLongPress}
                    onPressLock={onPressLock}
                    onPressUnlock={onPressUnlock}
                    getMemberForEvent={getMemberForEvent}
                    countdownEmoji={countdownEmojiByDate?.[dateStr]}
                    marksVisible={marksVisible}
                    dimWorkday={vacationActive && revealHidden}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
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
  weekend: boolean;
  isHighlighted: boolean;
  monthTheme: ReturnType<typeof getMonthTheme>;
  members: HouseholdMember[];
  highlight: Highlight;
  onTap: (day: Date) => void;
  onLongPress: (day: Date) => void;
  onPressLock: () => void;
  onPressUnlock: () => void;
  getMemberForEvent: (event: Event) => HouseholdMember | undefined;
  countdownEmoji?: string;
  marksVisible?: boolean;
  dimWorkday?: boolean;
}

/** Max single-day marks shown before +N overflow */
const MAX_VISIBLE_MARKS = 3;
/** Icon sits optically centered in the chip */
const CAL_ICON_SIZE = 10;
const CAL_ICON_STROKE = 2.25;
/** Single-day mark: round chip; flex box centers the SVG */
const DAY_PILL =
  'h-4 w-4 mx-auto rounded-full inline-flex items-center justify-center shrink-0 leading-none overflow-hidden';
const SPAN_ROW_H = 'h-4';
/** Multi-day rail ends — soft round to match circular chips */
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
  weekend,
  isHighlighted,
  monthTheme: _monthTheme,
  members: _members,
  highlight,
  onTap,
  onLongPress,
  onPressLock,
  onPressUnlock,
  getMemberForEvent,
  countdownEmoji,
  marksVisible = true,
  dimWorkday = false,
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
  const laneCount = Math.max(maxSpanLane(spanSegments) + 1, 0);
  const spanByLane = new Map(spanSegments.map((s) => [s.lane, s]));

  const renderEventMark = (ev: DisplayEvent) => {
    const evHighlighted = highlight && highlight.eventId === ev.id;
    const dim = dimWorkday && eventIsWorkdayLayer(ev);

    if (ev.isOverlay) {
      const fromWork = (ev.sourceHouseholdKind || '').toLowerCase() === 'work';
      return (
        <div
          key={ev.id}
          title={ev.title}
          className={`${DAY_PILL} ${evHighlighted ? 'ring-1 ring-primary/40' : ''} ${dim ? 'opacity-35' : ''}`}
          style={{
            background: categoryMarkFill(OVERLAY_MARK.soft, OVERLAY_MARK.rail),
            boxShadow: silverMarkRim(),
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
        className={`${DAY_PILL} ${evHighlighted ? 'ring-1 ring-primary/40' : ''} ${dim ? 'opacity-35' : ''}`}
        style={{
          background: categoryMarkFill(visuals.soft, visuals.rail),
          boxShadow: silverMarkRim(),
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
      className={`relative flex flex-col items-center justify-start pt-0 pb-0 px-0 rounded-2xl min-h-0 h-full overflow-visible ${
        isHighlighted ? 'ring-2 ring-primary/40' : ''
      }`}
    >
      <span
        className={`w-6 h-6 shrink-0 flex items-center justify-center rounded-full text-[11px] font-semibold tabular-nums leading-none ${
          today
            ? 'border-[1.5px] border-primary text-primary font-bold'
            : !inMonth
              ? 'text-muted-foreground/40'
              : weekend
                ? 'text-foreground/70'
                : 'text-foreground/90'
        }`}
      >
        {format(day, 'd')}
      </span>

      {/* Countdown — show the emoji the user picked */}
      {countdownEmoji && (
        <span
          className="absolute top-0 right-0 pointer-events-none z-[2] transition-opacity duration-500 ease-out flex h-4 w-4 items-center justify-center text-[11px] leading-none"
          style={{ opacity: marksVisible ? 1 : 0 }}
          aria-hidden
          title={countdownEmoji}
        >
          {countdownEmoji}
        </span>
      )}

      {(laneCount > 0 || rows.length > 0) && (
        <div
          className="mt-0.5 w-full flex flex-col items-center gap-0.5 min-h-0 flex-1 px-0 z-[1] transition-opacity duration-500 ease-out"
          style={{ opacity: marksVisible ? 1 : 0 }}
        >
          {laneCount > 0 &&
            Array.from({ length: Math.min(laneCount, MAX_SPAN_LANES) }, (_, lane) => {
              const seg = spanByLane.get(lane);
              if (!seg) {
                return <div key={`lane-${lane}`} className={`${SPAN_ROW_H} w-full`} aria-hidden />;
              }
              const segEvent = seg.event as DisplayEvent;
              const isOverlay = !!segEvent.isOverlay;
              const fromWork = isOverlay && (segEvent.sourceHouseholdKind || '').toLowerCase() === 'work';
              const member = isOverlay ? undefined : getMemberForEvent(seg.event);
              const visuals = isOverlay
                ? OVERLAY_MARK
                : resolveCategoryVisuals(seg.event.category, getMemberColorMap(member));
              const meta = EVENT_CATEGORY_META[(seg.event.category as keyof typeof EVENT_CATEGORY_META) || 'other'];
              const Icon = fromWork ? BriefcaseBusiness : isOverlay ? null : meta?.Icon;
              const evHighlighted = highlight && highlight.eventId === seg.event.id;

              return (
                <div
                  key={seg.event.id}
                  title={seg.event.title}
                  className={`relative ${SPAN_ROW_H} w-full`}
                >
                  {/* Flush rail — same geometry every day so the line never jumps */}
                  <div
                    aria-hidden
                    className={`absolute inset-0 ${
                      seg.isStart ? SPAN_ROUND_START : ''
                    } ${seg.isEnd ? SPAN_ROUND_END : ''} ${
                      evHighlighted ? 'ring-1 ring-primary/40' : ''
                    }`}
                    style={{
                      background: categoryMarkFill(visuals.soft, visuals.rail),
                      boxShadow: silverMarkRim(),
                    }}
                  />
                  {seg.isStart && Icon && (
                    <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center leading-none">
                      <MarkGlyph Icon={Icon} color={visuals.ink} />
                    </span>
                  )}
                </div>
              );
            })}
          {rows.map((row, i) => (
            <div
              key={row.map((e) => e.id).join('-') || i}
              className="w-full flex flex-col items-center"
            >
              {row.map((ev) => renderEventMark(ev))}
            </div>
          ))}
          {overflow > 0 && (
            <div className="text-[8px] text-muted-foreground text-center font-medium leading-none shrink-0">
              +{overflow}
            </div>
          )}
        </div>
      )}
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

      <div className="grid grid-cols-3 gap-4 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex-1 content-start overflow-y-auto scroll-touch overscroll-contain">
        {months.map((m) => {
          const theme = getMonthTheme(new Date(year, m, 1));
          const isCurrentMonth = now.getFullYear() === year && now.getMonth() === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onSelectMonth(m)}
              className={`rounded-2xl py-4 text-center transition-all duration-200 ${
                isCurrentMonth ? 'ring-2 ring-offset-2' : ''
              }`}
              style={{
                backgroundColor: theme.base,
                ...(isCurrentMonth ? { ringColor: theme.dark, borderColor: theme.dark } : {}),
              }}
            >
              <span className="text-sm font-extrabold capitalize" style={{ color: theme.textOnStrong }}>
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
