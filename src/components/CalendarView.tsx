import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, startOfMonth, endOfMonth, startOfWeek, eachDayOfInterval, isToday, isSameMonth, getISOWeek, addDays, type Locale } from 'date-fns';
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
import CalendarDaySheet from '@/components/CalendarDaySheet';
import YearMonthPicker from '@/components/YearMonthPicker';
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

/** Vertical stack switch thresholds (calendar ↔ calendar) */
const STACK_COMMIT_PX = 64;
/** Months mounted around the live scroll index */
const WINDOW = 2;
/** Absolute month index origin — scrollLeft = monthIndex * pageWidth */
const MONTH_INDEX_BASE = 1970 * 12;
/** Virtual strip length in months (100 years) */
const MONTH_STRIP_COUNT = 100 * 12;
/** Fallback when scrollend is missing (older Safari) */
const SCROLL_END_DEBOUNCE_MS = 120;

function toMonthIndex(d: Date) {
  return d.getFullYear() * 12 + d.getMonth() - MONTH_INDEX_BASE;
}

function fromMonthIndex(index: number) {
  const clamped = Math.max(0, Math.min(MONTH_STRIP_COUNT - 1, index));
  const abs = clamped + MONTH_INDEX_BASE;
  const year = Math.floor(abs / 12);
  const month = ((abs % 12) + 12) % 12;
  return startOfMonth(new Date(year, month, 1));
}

function clampMonthIndex(index: number) {
  return Math.max(0, Math.min(MONTH_STRIP_COUNT - 1, index));
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
  /** Picker start date — local only; opening must not write Index/strip state. */
  const [pickerAt, setPickerAt] = useState({ year: 0, month: 0 });
  const [daySheetDate, setDaySheetDate] = useState<Date | null>(null);
  const [detailEvent, setDetailEvent] = useState<Event | null>(null);
  const [overlayEvent, setOverlayEvent] = useState<DisplayEvent | null>(null);
  const [workBlock, setWorkBlock] = useState<DisplayEvent | null>(null);

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

  /**
   * Live month under the viewport (updates at snap midpoints). Drives which ±WINDOW
   * panels are mounted — not parent currentDate (that updates only on scrollend).
   */
  const [liveIndex, setLiveIndex] = useState(() => clampMonthIndex(toMonthIndex(currentDate)));
  const liveIndexRef = useRef(liveIndex);

  /**
   * Unique month indices only — never clamp into duplicates (that put 3× Jan 1970
   * in the same grid column and broke React keys).
   */
  const stripIndices = useMemo(() => {
    const start = Math.max(0, liveIndex - WINDOW);
    const end = Math.min(MONTH_STRIP_COUNT - 1, liveIndex + WINDOW);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [liveIndex]);
  const stripDates = useMemo(() => stripIndices.map((i) => fromMonthIndex(i)), [stripIndices]);

  /** Fixed ±WINDOW fetch slots around live (may repeat near strip edges — OK for queries). */
  const fetchSlots = useMemo(
    () =>
      Array.from({ length: WINDOW * 2 + 1 }, (_, i) => {
        const index = clampMonthIndex(liveIndex - WINDOW + i);
        return { index, date: fromMonthIndex(index) };
      }),
    [liveIndex],
  );

  // Prefetch ±WINDOW so continuous swipe never peeks empty
  const { data: eventsM2 = [] } = useEventsForMonth(householdId, fetchSlots[0].date.getFullYear(), fetchSlots[0].date.getMonth());
  const { data: eventsM1 = [] } = useEventsForMonth(householdId, fetchSlots[1].date.getFullYear(), fetchSlots[1].date.getMonth());
  const liveDate = fromMonthIndex(liveIndex);
  const {
    data: eventsRaw,
    isFetched: monthFetched,
    isError: monthError,
  } = useEventsForMonth(householdId, liveDate.getFullYear(), liveDate.getMonth());
  const { data: eventsP1 = [] } = useEventsForMonth(householdId, fetchSlots[3].date.getFullYear(), fetchSlots[3].date.getMonth());
  const { data: eventsP2 = [] } = useEventsForMonth(householdId, fetchSlots[4].date.getFullYear(), fetchSlots[4].date.getMonth());

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

  /** Chrome follows the live viewport month (updates at snap midpoints, not only scrollend). */
  const chromeTheme = useMemo(() => getMonthTheme(liveDate), [liveDate]);
  const monthTheme = chromeTheme;

  const eventsByIndex = useMemo(() => {
    const locals = [eventsM2, eventsM1, events, eventsP1, eventsP2];
    const map = new Map<number, Record<string, DisplayEvent[]>>();
    fetchSlots.forEach((slot, i) => {
      const local = locals[i] ?? [];
      const y = slot.date.getFullYear();
      const m = slot.date.getMonth();
      const monthOverlays = eventsForMonth(overlayEvents, y, m);
      const monthWork = eventsForMonth(workBlocks, y, m);
      const merged = mergeWorkBlocks(mergeEventsWithOverlays(local, monthOverlays), monthWork);
      map.set(slot.index, buildEventsByDate(merged));
    });
    return map;
  }, [eventsM2, eventsM1, events, eventsP1, eventsP2, overlayEvents, workBlocks, fetchSlots]);

  const eventsByDate = eventsByIndex.get(liveIndex) ?? {};

  const daysByIndex = useMemo(() => {
    const map = new Map<number, Date[]>();
    stripIndices.forEach((index, i) => {
      map.set(index, buildMonthDays(stripDates[i]));
    });
    return map;
  }, [stripIndices, stripDates]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const calendarShellRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(0);
  /** Ignore scroll events while we programmatically jump (year picker / resize). */
  const suppressScrollRef = useRef(false);
  /** True for the whole verified jump — blocks scroll handler from writing old month back. */
  const jumpingRef = useRef(false);
  const scrollEndTimerRef = useRef<number | null>(null);
  const stackPointerRef = useRef<{ x: number; y: number } | null>(null);
  /** Tap-vs-pan on the header band (no <button> inside the scroll strip). */
  const headerTapRef = useRef<{ x: number; y: number } | null>(null);

  const readNearestIndex = useCallback(
    (el: HTMLDivElement) => {
      if (pageWidth <= 0) return null;
      const raw = el.scrollLeft / pageWidth;
      if (!Number.isFinite(raw)) return null;
      return clampMonthIndex(Math.round(raw));
    },
    [pageWidth],
  );

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = 'instant') => {
    const el = scrollerRef.current;
    if (!el || pageWidth <= 0) return;
    const i = clampMonthIndex(index);
    suppressScrollRef.current = true;
    el.scrollTo({ left: i * pageWidth, behavior });
    liveIndexRef.current = i;
    setLiveIndex(i);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressScrollRef.current = false;
      });
    });
  }, [pageWidth]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      // Never collapse the strip to pageWidth 0 — that stacks months vertically
      // and clamps scrollLeft → false Jan 1970.
      if (w <= 0) return;
      setPageWidth((prev) => (prev === w ? prev : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Initial + resize: pin scrollLeft to the live/parent month without animation.
  useLayoutEffect(() => {
    if (pageWidth <= 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    const target = clampMonthIndex(toMonthIndex(currentDate));
    liveIndexRef.current = target;
    setLiveIndex(target);
    suppressScrollRef.current = true;
    el.scrollTo({ left: target * pageWidth, behavior: 'instant' });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressScrollRef.current = false;
      });
    });
  }, [pageWidth]); // eslint-disable-line react-hooks/exhaustive-deps -- only when width appears/changes

  // External month jump (year overview / today) while width is stable.
  useLayoutEffect(() => {
    if (pageWidth <= 0) return;
    const target = clampMonthIndex(toMonthIndex(currentDate));
    if (target === liveIndexRef.current) return;
    scrollToIndex(target, 'instant');
  }, [currentDate, pageWidth, scrollToIndex]);

  const commitLiveToParent = useCallback(() => {
    const next = fromMonthIndex(liveIndexRef.current);
    setCurrentDate(next);
  }, [setCurrentDate]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || pageWidth <= 0) return;

    const onScroll = () => {
      if (suppressScrollRef.current || jumpingRef.current) return;
      const i = readNearestIndex(el);
      if (i === null) return;
      if (i !== liveIndexRef.current) {
        liveIndexRef.current = i;
        setLiveIndex(i);
      }
      if (scrollEndTimerRef.current) window.clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = window.setTimeout(() => {
        scrollEndTimerRef.current = null;
        if (jumpingRef.current || suppressScrollRef.current) return;
        commitLiveToParent();
      }, SCROLL_END_DEBOUNCE_MS);
    };

    const onScrollEnd = () => {
      if (scrollEndTimerRef.current) {
        window.clearTimeout(scrollEndTimerRef.current);
        scrollEndTimerRef.current = null;
      }
      if (suppressScrollRef.current || jumpingRef.current) return;
      const i = readNearestIndex(el);
      if (i !== null && i !== liveIndexRef.current) {
        liveIndexRef.current = i;
        setLiveIndex(i);
      }
      commitLiveToParent();
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', onScrollEnd);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', onScrollEnd);
      if (scrollEndTimerRef.current) window.clearTimeout(scrollEndTimerRef.current);
    };
  }, [pageWidth, commitLiveToParent, readNearestIndex]);

  /**
   * Verified jump: scroll, confirm scrollLeft, then parent onChange.
   * Scroll handler stays blocked until verify finishes so old scrollLeft cannot win.
   */
  const jumpToMonth = useCallback(
    (date: Date): Promise<void> => {
      const next = startOfMonth(date);
      const target = clampMonthIndex(toMonthIndex(next));
      const el = scrollerRef.current;
      if (scrollEndTimerRef.current) {
        window.clearTimeout(scrollEndTimerRef.current);
        scrollEndTimerRef.current = null;
      }
      jumpingRef.current = true;
      suppressScrollRef.current = true;
      liveIndexRef.current = target;
      setLiveIndex(target);

      return new Promise((resolve) => {
        let tries = 0;
        const finish = () => {
          jumpingRef.current = false;
          suppressScrollRef.current = false;
          setCurrentDate(next);
          resolve();
        };
        const step = () => {
          if (!el || pageWidth <= 0) {
            finish();
            return;
          }
          const want = target * pageWidth;
          if (Math.abs(el.scrollLeft - want) < 1) {
            finish();
            return;
          }
          if (tries++ > 8) {
            el.scrollLeft = want;
            finish();
            return;
          }
          el.scrollTo({ left: want, behavior: 'instant' });
          requestAnimationFrame(step);
        };
        step();
      });
    },
    [pageWidth, setCurrentDate],
  );

  // Long-press no longer freezes the strip — native scroll only starts if the finger moves.
  const lockStripForPress = useCallback(() => {}, []);
  const unlockStripForPress = useCallback(() => {}, []);

  /** Open picker only — pass start month via pickerAt; do not write Index/strip. */
  const openYearView = useCallback(() => {
    const el = scrollerRef.current;
    const i = el && pageWidth > 0 ? readNearestIndex(el) : null;
    const d = fromMonthIndex(i ?? liveIndexRef.current);
    setPickerAt({ year: d.getFullYear(), month: d.getMonth() });
    setShowYear(true);
  }, [pageWidth, readNearestIndex]);

  const closeYearView = () => {
    setShowYear(false);
  };

  // Cover strip (measurable) instead of visibility:hidden while picker is open.
  useEffect(() => {
    const shell = calendarShellRef.current;
    if (!shell) return;
    if (showYear) {
      shell.setAttribute('inert', '');
      shell.setAttribute('aria-hidden', 'true');
    } else {
      shell.removeAttribute('inert');
      shell.removeAttribute('aria-hidden');
    }
  }, [showYear]);

  const handleStackPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = scrollerRef.current;
    if (el) {
      const top = el.getBoundingClientRect().top;
      // Header band — tap opens picker; no <button> inside the scroll track.
      if (e.clientY - top <= HEADER_BAND_PX + 8) {
        headerTapRef.current = { x: e.clientX, y: e.clientY };
      } else {
        headerTapRef.current = null;
      }
    }
    if (!canSwipeCalendarStack || !onSwipeCalendarStack) return;
    stackPointerRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleStackPointerUp = (e: ReactPointerEvent) => {
    const headerTap = headerTapRef.current;
    headerTapRef.current = null;
    if (headerTap) {
      const dx = Math.abs(e.clientX - headerTap.x);
      const dy = Math.abs(e.clientY - headerTap.y);
      if (dx < 12 && dy < 12) {
        stackPointerRef.current = null;
        openYearView();
        return;
      }
    }
    if (!canSwipeCalendarStack || !onSwipeCalendarStack || !stackPointerRef.current) return;
    const dx = e.clientX - stackPointerRef.current.x;
    const dy = e.clientY - stackPointerRef.current.y;
    stackPointerRef.current = null;
    if (Math.abs(dy) < STACK_COMMIT_PX) return;
    if (Math.abs(dy) <= Math.abs(dx) * 1.1) return;
    // Finger up → next calendar; finger down → previous
    onSwipeCalendarStack(dy < 0 ? 1 : -1);
  };

  const handleDayTap = (day: Date) => {
    requestAnimationFrame(() => onSelectDate(day));
    // iPhone uses a sheet; iPad updates the persistent day inspector.
    if (isMobile) tryOpenSheet(() => setDaySheetDate(day));
  };

  const getMemberForEvent = (event: Event) => {
    return members.find((m) => m.id === event.owner_member_id);
  };

  const daySheetEvents = daySheetDate
    ? eventsByDate[format(daySheetDate, 'yyyy-MM-dd')] || []
    : [];
  const selectedDateStr = format(focusedDay, 'yyyy-MM-dd');

  return (
    <>
      <div className="relative flex flex-col h-full min-h-0">
        <div
          ref={calendarShellRef}
          className={`flex flex-col h-full min-h-0 ${showYear ? 'pointer-events-none' : ''}`}
        >
        {/* Native horizontal scroll-snap — browser owns gesture (snappy, interruptible). */}
        <div
          ref={scrollerRef}
          className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden select-none calendar-month-snap no-scrollbar"
          style={{ backgroundColor: chromeTheme.paper }}
          onPointerDown={showYear ? undefined : handleStackPointerDown}
          onPointerUp={showYear ? undefined : handleStackPointerUp}
          onPointerCancel={() => {
            stackPointerRef.current = null;
            headerTapRef.current = null;
          }}
        >
          {/*
            Grid with N month tracks keeps scroll extent + snap points stable while only
            ±WINDOW panels are mounted (grid-column places them without recentering).
          */}
          {pageWidth > 0 ? (
          <div
            className="h-full"
            style={{
              display: 'grid',
              width: MONTH_STRIP_COUNT * pageWidth,
              gridTemplateColumns: `repeat(${MONTH_STRIP_COUNT}, ${pageWidth}px)`,
            }}
          >
            {stripIndices.map((monthIndex, i) => {
              const date = stripDates[i];
              const theme = getMonthTheme(date);
              const monthHeader = formatMonthHeaderLabel(date, dateLocale);
              const sunday = sundayAccentForMonth(date.getMonth());
              const byDate = eventsByIndex.get(monthIndex) ?? {};
              const neighbour = {
                ...(eventsByIndex.get(monthIndex - 1) || {}),
                ...(eventsByIndex.get(monthIndex + 1) || {}),
              };
              const isLive = monthIndex === liveIndex;
              return (
                <div
                  key={monthIndex}
                  className="flex h-full min-h-0 flex-col"
                  style={{
                    gridColumn: monthIndex + 1,
                    scrollSnapAlign: 'start',
                    scrollSnapStop: 'always',
                    backgroundColor: theme.paper,
                  }}
                >
                  <div className="relative h-[7.75rem] shrink-0 overflow-hidden pt-[max(0.35rem,env(safe-area-inset-top))]">
                    <MonthHeaderPanel
                      width={pageWidth}
                      monthLabel={monthHeader.label}
                      monthDot={monthHeader.showDot}
                      monthDotGapEm={monthHeader.dotGapEm}
                      yearLabel={format(date, 'yyyy')}
                      textColor={theme.base}
                      paperColor={theme.paper}
                    />
                  </div>
                  <div className="grid h-8 shrink-0 grid-cols-7 items-center" style={{ backgroundColor: theme.paper }}>
                    {weekdayLabels.map((d, di) => (
                      <div
                        key={`${d}-${di}`}
                        className="text-center font-calendar text-sm font-semibold uppercase tracking-wide"
                        style={{ color: di === 6 ? sunday : theme.base }}
                      >
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="relative min-h-0 flex-1">
                    <MonthPanel
                      width={pageWidth}
                      monthDate={date}
                      days={daysByIndex.get(monthIndex) ?? []}
                      eventsByDate={byDate}
                      neighbourEventsByDate={neighbour}
                      monthTheme={isLive ? monthTheme : theme}
                      members={members}
                      highlight={highlight}
                      interactive={isLive}
                      onTap={handleDayTap}
                      onLongPress={onCreateEvent}
                      onPressLock={lockStripForPress}
                      onPressUnlock={unlockStripForPress}
                      getMemberForEvent={getMemberForEvent}
                      marksVisible={marksVisible && !eventsHidden}
                      selectedDateStr={selectedDateStr}
                      showSelection={!isMobile}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          ) : null}
        </div>

        <div
          className="shrink-0 flex justify-center px-4 pt-2.5 pb-[max(0.85rem,env(safe-area-inset-bottom))]"
          style={{ backgroundColor: chromeTheme.paper }}
        >
          <button
            type="button"
            onClick={() => setEventsHidden((v) => !v)}
            className="min-h-9 px-4 rounded-full text-sm font-semibold active:opacity-80"
            style={{
              color: chromeTheme.base,
              backgroundColor: withAlpha(chromeTheme.base, 0.16),
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fadeQuick}
              className="absolute inset-0 z-30 flex flex-col"
              style={{ backgroundColor: PASTEL.calendarPaper }}
            >
              <YearMonthPicker
                year={pickerAt.year}
                month={pickerAt.month}
                onJumpToMonth={jumpToMonth}
                onClose={closeYearView}
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

/** Fixed trailing column for divider + vertical year (house uses pr-14 outside). */
const HEADER_YEAR_COL_PX = 36;
/** Vertical year stack vs month letter height (em) — equal air via flex center. */
const HEADER_YEAR_STACK_RATIO = 0.96;
/** Header band height (matches h-[7.75rem]). */
const HEADER_BAND_PX = 7.75 * 16;
/**
 * Approx advance width of Montserrat Black + tracking-tighter as fraction of em.
 * Pure math — no runtime measure, so year never jumps when fonts settle.
 */
const MONTH_CHAR_EM = 0.58;
/** Horizontal chrome inside the panel (px-3 + pr-14 + year col + gap). */
const HEADER_H_CHROME_PX = 12 + 56 + HEADER_YEAR_COL_PX + 10;

function monthHeaderFontPx(label: string, showDot: boolean, pageWidth: number) {
  const availW = Math.max((pageWidth || 320) - HEADER_H_CHROME_PX, 80);
  const availH = HEADER_BAND_PX - 16;
  const units = label.length + (showDot ? 0.4 : 0);
  let px = (availW * 0.96) / (units * MONTH_CHAR_EM);
  px = Math.min(px, availH * 0.92);
  return Math.max(22, Math.min(px, 88));
}

const MonthHeaderPanel = ({
  width,
  monthLabel,
  monthDot = false,
  monthDotGapEm = 0.1,
  yearLabel,
  textColor,
  paperColor,
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
}) => {
  const monthPx = monthHeaderFontPx(monthLabel, monthDot, width);
  const yearEm = HEADER_YEAR_STACK_RATIO / Math.max(yearLabel.length, 1);

  return (
    <div
      className="relative flex h-full w-full items-stretch px-3 pb-2 pr-14"
      style={{ backgroundColor: paperColor }}
    >
      <div
        className="flex h-full w-full min-w-0 items-end gap-2.5"
        style={{ fontSize: monthPx }}
      >
        <div className="flex min-h-0 min-w-0 flex-1 items-end overflow-visible">
          <h2
            className="m-0 whitespace-nowrap font-calendar font-black capitalize leading-none tracking-tighter"
            style={{ color: textColor, fontSize: '1em' }}
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
        <div
          className="flex shrink-0 items-center justify-center gap-2"
          style={{
            width: HEADER_YEAR_COL_PX,
            height: '1em',
            lineHeight: 1,
          }}
        >
          <span
            className="w-px shrink-0 self-stretch"
            style={{ backgroundColor: textColor, opacity: 0.9 }}
            aria-hidden
          />
          <span
            className="flex items-center justify-center font-calendar font-black tabular-nums tracking-tight"
            style={{
              color: textColor,
              fontSize: `${yearEm}em`,
              lineHeight: 1,
              height: '1em',
              width: '1em',
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
            }}
          >
            {yearLabel}
          </span>
        </div>
      </div>
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
      className={`flex flex-col h-full min-h-0 w-full pt-0 pb-[max(0.25rem,env(safe-area-inset-bottom))] ${
        interactive ? '' : 'pointer-events-none'
      }`}
      style={{ backgroundColor: monthTheme.paper }}
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

export default CalendarView;
