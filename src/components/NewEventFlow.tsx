import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays } from 'date-fns';
import { toast } from 'sonner';
import { useCreateEvent, syncEventVisibleMembers } from '@/hooks/useEvents';
import { getCategoryOptionsForKind, EVENT_CATEGORY_META, type EventCategory } from '@/lib/eventCategories';
import { resolveCategoryLabel, resolveCategoryVisuals, getMemberColorMap } from '@/lib/categoryPresentation';
import {
  DAY_PART_ORDER,
  DAY_PART_TIME_RANGES,
  timeRangeToDayParts,
  ALL_DAY_INDEX,
  AFTERNOON_INDEX,
  isAllDayPart,
} from '@/lib/dayParts';
import { translateDayPart } from '@/lib/i18n';
import type { HouseholdMember } from '@/hooks/useHousehold';
import { useLocale } from '@/hooks/useLocale';
import CenteredPopup from '@/components/CenteredPopup';
import PopupStickyFooter from '@/components/PopupStickyFooter';
import { blurSheetField, focusSheetField } from '@/lib/focusSheetField';
import { focusFieldSoftly, scrollFocusIntoView } from '@/lib/scrollFocusIntoView';
import { stepForward, stepSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useVacationMode } from '@/hooks/useVacationMode';

/** Shared size for date/time inputs — equality = simplicity */
const FIELD =
  'min-w-0 box-border appearance-none rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary';
const ADD_BTN =
  'shrink-0 rounded-xl bg-muted active:bg-muted/70 px-3 py-3 text-sm font-medium whitespace-nowrap min-w-[4.75rem] transition-colors';
const CTA_BTN =
  'rounded-xl bg-muted active:bg-muted/70 px-4 py-3 text-sm font-medium transition-colors';

interface NewEventFlowProps {
  householdId: string;
  members: HouseholdMember[];
  currentMemberId: string;
  calendarKind?: string | null;
  showInOtherCalendars?: boolean;
  initialDate?: Date;
  onClose: () => void;
  onCreated?: (eventId: string, dateStr: string) => void;
}

const STEPS = 4;

const NewEventFlow = ({ householdId, members, currentMemberId, calendarKind = 'home', showInOtherCalendars = false, initialDate, onClose, onCreated }: NewEventFlowProps) => {
  const { t, locale, dateLocale } = useLocale();
  const vacation = useVacationMode();
  const categoryOptions = getCategoryOptionsForKind(calendarKind, {
    vacationMode: vacation.enabledForCalendar && vacation.snapshot.active,
  });
  const memberColorMap = getMemberColorMap(members.find((m) => m.id === currentMemberId));
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(initialDate || new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectedDayParts, setSelectedDayParts] = useState<[number, number]>([2, 2]); // default afternoon
  const [dayPartClickCount, setDayPartClickCount] = useState(1);
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState<string | null>('13:00');
  const [showDayParts, setShowDayParts] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  /** Multi-day defaults to all-day; user can opt into start/end times. */
  const [showTimedMultiDay, setShowTimedMultiDay] = useState(false);
  const [category, setCategory] = useState<EventCategory | null>(null);
  const [otherLabel, setOtherLabel] = useState('');
  const [visibility, setVisibility] = useState<'all_members' | 'private' | 'selected_members'>('all_members');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [hideFromOtherCalendars, setHideFromOtherCalendars] = useState(false);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const createEvent = useCreateEvent();
  const locationRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const stepRef = useRef(step);
  stepRef.current = step;
  /** Title UI in-flow only after previous step has finished exiting (avoids stacked glitch). */
  const [whatVisible, setWhatVisible] = useState(false);

  const addOneHour = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const total = ((h * 60 + (m || 0) + 60) % (24 * 60) + 24 * 60) % (24 * 60);
    const nh = Math.floor(total / 60);
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  };

  const handleDismiss = () => {
    if (step > 1) setStep((s) => s - 1);
    else onClose();
  };

  const openLocation = () => setShowLocation(true);
  const openNotes = () => setShowNotes(true);

  useEffect(() => {
    if (!showLocation) return;
    const t = window.setTimeout(() => focusFieldSoftly(locationRef.current), 40);
    return () => window.clearTimeout(t);
  }, [showLocation]);

  useEffect(() => {
    if (!showNotes) return;
    const t = window.setTimeout(() => focusFieldSoftly(notesRef.current), 40);
    return () => window.clearTimeout(t);
  }, [showNotes]);

  useEffect(() => {
    if (step !== 3) setWhatVisible(false);
  }, [step]);

  /**
   * Title input is pre-mounted (offscreen) on step 2 so we can focus it in the
   * same tap as Next/category — iOS only opens the keyboard for a real gesture.
   * Stays offscreen until the previous step’s exit finishes, then reveals in-flow.
   */
  const goToWhatStep = () => {
    setWhatVisible(false);
    focusSheetField(titleRef.current, { footerReserve: 128 });
    setStep(3);
  };

  const goNext = () => {
    if (step >= STEPS) return;
    if (step + 1 === 3) {
      goToWhatStep();
      return;
    }
    // Dismiss date/time keyboard so sticky Neste isn't left floating on Kategori.
    if (step === 1) blurSheetField();
    setStep((s) => s + 1);
  };

  const canProceed =
    step === 2 ? category !== null :
    step === 3 ? title.trim().length > 0 :
    step === 4 ? (visibility !== 'selected_members' || selectedMemberIds.length > 0) :
    true;

  const dayPartStart = DAY_PART_ORDER[selectedDayParts[0]];
  const dayPartEnd = DAY_PART_ORDER[selectedDayParts[1]];
  const dayPartCompat = (!dayPartStart || dayPartStart === 'all_day' || dayPartStart === 'full_diem') ? 'morning' : dayPartStart;
  const isMultiDay = !!endDate;
  const useAllDay = isMultiDay ? !showTimedMultiDay : isAllDayPart(dayPartStart);

  // --- Two-way sync helpers ---

  const syncTimesFromDayPart = (startIdx: number, endIdx: number) => {
    const startPart = DAY_PART_ORDER[startIdx];
    const endPart = DAY_PART_ORDER[endIdx];
    const range = DAY_PART_TIME_RANGES[startPart];
    const rangeEnd = DAY_PART_TIME_RANGES[endPart];
    setStartTime(range.start === '24:00' ? '00:00' : range.start);
    setEndTime(rangeEnd.end === '24:00' ? '00:00' : rangeEnd.end);
  };

  const applyAllDay = () => {
    setSelectedDayParts([ALL_DAY_INDEX, ALL_DAY_INDEX]);
    setDayPartClickCount(1);
    setStartTime(DAY_PART_TIME_RANGES.all_day.start);
    setEndTime(null);
    setShowTimedMultiDay(false);
  };

  const enableTimedMultiDay = () => {
    setShowTimedMultiDay(true);
    const afternoon = AFTERNOON_INDEX;
    setSelectedDayParts([afternoon, afternoon]);
    setDayPartClickCount(1);
    setStartTime('09:00');
    setEndTime('18:00');
    setShowDayParts(false);
  };

  const handleDayPartClick = (idx: number) => {
    const key = DAY_PART_ORDER[idx];
    if (key === 'all_day' || key === 'full_diem') {
      setSelectedDayParts([idx, idx]);
      setDayPartClickCount(1);
      syncTimesFromDayPart(idx, idx);
      if (key === 'all_day') setShowTimedMultiDay(false);
      return;
    }
    if (isMultiDay) setShowTimedMultiDay(true);
    let newRange: [number, number];
    if (dayPartClickCount === 1) {
      const prev = selectedDayParts[0];
      const prevKey = DAY_PART_ORDER[prev];
      if (prev === idx) return;
      // If previous selection was a snap-only part, restart range
      if (prevKey === 'all_day' || prevKey === 'full_diem') {
        newRange = [idx, idx];
        setDayPartClickCount(2);
      } else {
        newRange = [Math.min(prev, idx), Math.max(prev, idx)];
        setDayPartClickCount(2);
      }
    } else {
      newRange = [idx, idx];
      setDayPartClickCount(1);
    }
    setSelectedDayParts(newRange);
    syncTimesFromDayPart(newRange[0], newRange[1]);
  };

  const handleStartTimeChange = (value: string) => {
    if (isMultiDay) setShowTimedMultiDay(true);
    setStartTime(value);
    const nextEnd = value ? addOneHour(value) : null;
    setEndTime(nextEnd);
    if (value && nextEnd) {
      const newRange = timeRangeToDayParts(value, nextEnd);
      setSelectedDayParts(newRange);
      setDayPartClickCount(newRange[0] === newRange[1] ? 1 : 2);
    } else if (value) {
      const [idx] = timeRangeToDayParts(value, value);
      setSelectedDayParts([idx, idx]);
      setDayPartClickCount(1);
    }
  };

  const handleEndTimeChange = (value: string) => {
    if (isMultiDay) setShowTimedMultiDay(true);
    setEndTime(value);
    if (startTime && value) {
      const newRange = timeRangeToDayParts(startTime, value);
      setSelectedDayParts(newRange);
      setDayPartClickCount(newRange[0] === newRange[1] ? 1 : 2);
    }
  };

  const handleAddHour = () => {
    if (isMultiDay) setShowTimedMultiDay(true);
    if (!endTime) {
      setEndTime(addOneHour(startTime || '12:00'));
    } else {
      setEndTime(addOneHour(endTime));
    }
  };

  const isDayPartSelected = (idx: number) => {
    return idx >= selectedDayParts[0] && idx <= selectedDayParts[1];
  };

  const handleAddDay = () => {
    const becomingMulti = !endDate;
    if (!endDate) {
      setEndDate(addDays(startDate, 1));
    } else {
      setEndDate(addDays(endDate, 1));
    }
    if (becomingMulti) applyAllDay();
  };

  const clearEndDate = () => {
    const wasUntimedAllDay = isMultiDay && !showTimedMultiDay;
    setEndDate(null);
    setShowTimedMultiDay(false);
    if (wasUntimedAllDay) {
      setSelectedDayParts([AFTERNOON_INDEX, AFTERNOON_INDEX]);
      setDayPartClickCount(1);
      setStartTime('12:00');
      setEndTime(null);
    }
  };

  const handleSubmit = async () => {
    if (!householdId || !currentMemberId) {
      toast.error('Kunne ikke opprette: mangler husholdning eller medlem');
      return;
    }
    const eventEndDate = endDate ? format(endDate, 'yyyy-MM-dd') : format(startDate, 'yyyy-MM-dd');
    const dateStr = format(startDate, 'yyyy-MM-dd');
    try {
      const result = await createEvent.mutateAsync({
        household_id: householdId,
        title: title.trim(),
        event_date: dateStr,
        end_date: eventEndDate,
        day_part: dayPartCompat,
        day_part_start: useAllDay ? 'all_day' : (dayPartStart || null),
        day_part_end: useAllDay ? 'all_day' : (dayPartEnd || null),
        start_time:
          dayPartStart === 'full_diem' && dayPartEnd === 'full_diem'
            ? '00:00'
            : useAllDay
              ? null
              : (startTime || null),
        end_time:
          dayPartStart === 'full_diem' && dayPartEnd === 'full_diem'
            ? '23:59'
            : useAllDay
              ? null
              : (endTime || null),
        visibility_type: visibility,
        location: location || null,
        notes: notes || null,
        category: category!,
        category_label_override: category === 'other' ? (otherLabel.trim() || null) : null,
        hide_from_other_calendars: hideFromOtherCalendars,
      });
      if (visibility === 'selected_members') {
        try {
          await syncEventVisibleMembers(result.id, selectedMemberIds);
        } catch (syncErr: any) {
          console.error('[NewEventFlow] sync visible members failed', syncErr);
          toast.error('Hendelsen ble opprettet, men delingen feilet.');
        }
      }
      onCreated?.(result.id, dateStr);
      onClose();
    } catch (err: any) {
      console.error('[NewEventFlow] create failed', err);
      toast.error(err?.message || 'Kunne ikke lagre hendelsen');
    }
  };

  const getDayPartRangeLabel = () => {
    const startLabel = translateDayPart(locale, DAY_PART_ORDER[selectedDayParts[0]]);
    const endLabel = translateDayPart(locale, DAY_PART_ORDER[selectedDayParts[1]]);
    if (DAY_PART_ORDER[selectedDayParts[0]] === 'full_diem') return translateDayPart(locale, 'full_diem');
    if (DAY_PART_ORDER[selectedDayParts[0]] === 'all_day') return translateDayPart(locale, 'all_day');
    if (selectedDayParts[0] === selectedDayParts[1]) return startLabel;
    return `${startLabel} – ${endLabel}`;
  };

  return (
    <CenteredPopup onClose={handleDismiss} onExit={onClose} size="sheet" zClassName="z-[70]" backdrop="solid">
      {/* Header: progress only — ✕ + grabber live in CenteredPopup */}
      <div className="flex items-center justify-center px-5 pt-1 pb-3 shrink-0">
        <div className="flex gap-1.5">
          {Array.from({ length: STEPS }).map((_, i) => (
            <div key={i} className={`w-8 h-1.5 rounded-full transition-colors ${i < step ? 'bg-calendar-accent' : 'bg-border'}`} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-1 px-5 overflow-y-auto min-h-0 pb-4 overscroll-contain scroll-touch" data-sheet-scroll>
        {/* Shared title field: offscreen until step-2 exit completes, then in-flow on step 3 */}
        {(step === 2 || step === 3) && (
          <div
            className={cn(
              whatVisible
                ? 'space-y-6'
                : 'pointer-events-none fixed left-0 top-0 z-[-1] w-[min(100vw,28rem)] opacity-0',
            )}
            aria-hidden={!whatVisible}
          >
            {whatVisible && (
              <h2 className="text-2xl font-bold">{t('event.what')}</h2>
            )}
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={category === 'other' && otherLabel.trim() ? otherLabel : 'F.eks. Middag med venner'}
              enterKeyHint="next"
              autoComplete="off"
              autoCorrect="off"
              tabIndex={whatVisible ? 0 : -1}
              className="w-full rounded-2xl border border-border bg-background px-5 py-4 text-lg caret-foreground focus:outline-none focus:border-foreground/25 focus:ring-1 focus:ring-foreground/15"
            />
          </div>
        )}

        <AnimatePresence
          mode="wait"
          initial={false}
          onExitComplete={() => {
            if (stepRef.current === 3) setWhatVisible(true);
          }}
        >
          {step === 1 && (
            <motion.div key="step1" {...stepForward} className="space-y-6">
              <h2 className="text-2xl font-bold">{t('event.when')}</h2>

              {/* Start date + add day button */}
              <div>
                <label className="text-sm font-medium mb-2 block">{t('event.date')}</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={format(startDate, 'yyyy-MM-dd')}
                    onChange={(e) => {
                      const newDate = new Date(e.target.value + 'T12:00:00');
                      setStartDate(newDate);
                      if (endDate && endDate <= newDate) setEndDate(null);
                    }}
                    className={`flex-1 ${FIELD}`}
                  />
                  <button type="button" onClick={handleAddDay} className={ADD_BTN}>
                    {t('event.addDay')}
                  </button>
                </div>
              </div>

              {/* End date (if multi-day) */}
              {endDate && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="text-sm font-medium mb-2 block">{t('event.endDate')}</label>
                    <input
                      type="date"
                      value={format(endDate, 'yyyy-MM-dd')}
                      onChange={(e) => setEndDate(new Date(e.target.value + 'T12:00:00'))}
                      min={format(addDays(startDate, 1), 'yyyy-MM-dd')}
                      className={`w-full ${FIELD}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={clearEndDate}
                    className="mt-7 p-2 rounded-full hover:bg-muted text-muted-foreground"
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  </button>
                </div>
              )}

              {/* Clock / all-day — multi-day defaults to hele dagen */}
              <div className="space-y-3">
                {isMultiDay && !showTimedMultiDay ? (
                  <>
                    <div className="rounded-xl bg-muted/70 px-4 py-3">
                      <p className="text-sm font-medium">{t('event.allDayMulti')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t('event.allDayMultiHint')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={enableTimedMultiDay}
                      className="text-sm text-muted-foreground underline underline-offset-2"
                    >
                      {t('event.hasTimes')}
                    </button>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-2 block">{t('event.clock')}</label>
                      <div className="flex gap-2">
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => handleStartTimeChange(e.target.value)}
                          className={`flex-1 ${FIELD}`}
                        />
                        <button type="button" onClick={handleAddHour} className={ADD_BTN}>
                          {t('event.addHour')}
                        </button>
                      </div>
                    </div>

                    {endTime && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <label className="text-sm font-medium mb-2 block">{t('event.endTime')}</label>
                          <input
                            type="time"
                            value={endTime}
                            onChange={(e) => handleEndTimeChange(e.target.value)}
                            className={`w-full ${FIELD}`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setEndTime(null)}
                          className="mt-7 p-2 rounded-full hover:bg-muted text-muted-foreground"
                        >
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    )}

                    {isMultiDay && (
                      <button
                        type="button"
                        onClick={applyAllDay}
                        className="text-sm text-muted-foreground underline underline-offset-2"
                      >
                        {t('event.useAllDay')}
                      </button>
                    )}

                    {!showDayParts ? (
                      <button
                        type="button"
                        onClick={() => setShowDayParts(true)}
                        className="text-sm text-muted-foreground underline underline-offset-2"
                      >
                        {t('event.pickDayPart')}
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">{t('event.dayPart')}</label>
                          <button
                            type="button"
                            onClick={() => setShowDayParts(false)}
                            className="text-xs text-muted-foreground underline underline-offset-2"
                          >
                            {t('event.hideDayPart')}
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {DAY_PART_ORDER.map((key, idx) => {
                            const selected = isDayPartSelected(idx);
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => handleDayPartClick(idx)}
                                className={`rounded-xl py-3 px-4 text-sm font-medium transition-all ${
                                  selected
                                    ? 'bg-calendar-accent text-foreground ring-2 ring-calendar-accent'
                                    : 'bg-muted hover:bg-muted/80'
                                }`}
                              >
                                {translateDayPart(locale, key)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Optional details — closed by default, expand without layout thrash */}
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {!showLocation && (
                    <button type="button" onClick={openLocation} className={CTA_BTN}>
                      {t('event.pickPlace')}
                    </button>
                  )}
                  {!showNotes && (
                    <button type="button" onClick={openNotes} className={CTA_BTN}>
                      {t('event.writeNote')}
                    </button>
                  )}
                </div>

                {showLocation && (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <label className="text-sm font-medium mb-1 block">{t('event.place')}</label>
                      <input
                        ref={locationRef}
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder={t('common.optional')}
                        onFocus={scrollFocusIntoView}
                        className={`w-full ${FIELD}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowLocation(false); setLocation(''); }}
                      className="mt-7 p-2 rounded-full hover:bg-muted text-muted-foreground"
                    >
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                )}

                {showNotes && (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <label className="text-sm font-medium mb-1 block">{t('event.notes')}</label>
                      <textarea
                        ref={notesRef}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t('common.optional')}
                        rows={2}
                        onFocus={scrollFocusIntoView}
                        className={`w-full ${FIELD} resize-none`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowNotes(false); setNotes(''); }}
                      className="mt-7 p-2 rounded-full hover:bg-muted text-muted-foreground"
                    >
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" {...stepForward} className="space-y-6">
              <h2 className="text-2xl font-bold">{t('event.category')}</h2>
              <div className={vacation.snapshot.active && vacation.enabledForCalendar ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'}>
                {categoryOptions.map((key) => {
                  const meta = EVENT_CATEGORY_META[key];
                  const Icon = meta.Icon;
                  const selected = category === key;
                  const visuals = resolveCategoryVisuals(key, memberColorMap);
                  const vacationGrid = vacation.snapshot.active && vacation.enabledForCalendar;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setCategory(key);
                        if (key !== 'other') {
                          setOtherLabel('');
                          goToWhatStep();
                        }
                      }}
                      className={`rounded-xl py-3 px-4 text-sm font-medium transition-all flex items-center ${
                        vacationGrid ? 'gap-2.5 text-left' : 'justify-between'
                      } ${
                        selected ? 'ring-2 ring-current' : vacationGrid ? '' : 'bg-muted hover:bg-muted/80'
                      }`}
                      style={
                        selected || vacationGrid
                          ? { backgroundColor: visuals.soft, color: visuals.ink }
                          : undefined
                      }
                    >
                      {vacationGrid && (
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: visuals.rail }}
                        >
                          <Icon size={16} strokeWidth={2.4} style={{ color: visuals.ink }} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">{resolveCategoryLabel(key, null, locale)}</span>
                      {!vacationGrid && <Icon size={18} strokeWidth={2.5} style={{ color: visuals.ink }} />}
                    </button>
                  );
                })}
              </div>
              {category === 'other' && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} transition={stepSpring} className="overflow-hidden">
                  <label className="text-sm font-medium mb-2 block">Egen kategori (valgfritt)</label>
                  <input
                    type="text"
                    value={otherLabel}
                    onChange={(e) => setOtherLabel(e.target.value)}
                    placeholder="F.eks. Trening, Lege, Reise..."
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground mt-2">La stå tom hvis du bare vil bruke "Annet".</p>
                </motion.div>
              )}
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" {...stepForward} className="space-y-6">
              <h2 className="text-2xl font-bold">{t('event.who')}</h2>

              <div className="space-y-3">
                {[
                  { value: 'all_members' as const, label: t('event.everyone'), desc: t('event.everyoneHint') },
                  { value: 'private' as const, label: t('event.onlyMe'), desc: t('event.onlyMeHint') },
                  { value: 'selected_members' as const, label: t('event.selected'), desc: t('event.selectedHint') },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setVisibility(opt.value)}
                    className={`w-full text-left rounded-2xl p-4 transition-all ${
                      visibility === opt.value
                        ? 'bg-primary/20 ring-2 ring-primary'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    <p className="font-semibold">{opt.label}</p>
                    <p className="text-sm text-muted-foreground">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {showInOtherCalendars && (
                <label className="flex items-start gap-3 rounded-2xl bg-muted/50 p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-border"
                    checked={hideFromOtherCalendars}
                    onChange={(e) => setHideFromOtherCalendars(e.target.checked)}
                  />
                  <span>
                    <span className="block font-semibold text-sm">{t('event.hideFromOther')}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {t('event.hideFromOtherHint')}
                    </span>
                  </span>
                </label>
              )}

              {visibility === 'selected_members' && (
                <div className="rounded-2xl bg-muted/50 p-4">
                  <p className="text-sm font-semibold mb-3">Velg hvem som skal se</p>
                  <div className="flex flex-col gap-2">
                    {members.filter((m) => m.id !== currentMemberId).map((m) => {
                      const checked = selectedMemberIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedMemberIds((prev) => checked ? prev.filter((id) => id !== m.id) : [...prev, m.id])}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${checked ? 'bg-primary/20 ring-2 ring-primary' : 'bg-background hover:bg-muted'}`}
                        >
                          <span
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: `hsl(var(--member-${m.color_token.replace('pastel-', '')}))` }}
                          >
                            {m.display_name.charAt(0)}
                          </span>
                          <span className="flex-1 text-sm font-medium">{m.display_name}</span>
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${checked ? 'bg-primary border-primary' : 'border-border'}`}>
                            {checked && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            )}
                          </span>
                        </button>
                      );
                    })}
                    {members.filter((m) => m.id !== currentMemberId).length === 0 && (
                      <p className="text-sm text-muted-foreground">Ingen andre medlemmer å dele med enda.</p>
                    )}
                  </div>
                  {selectedMemberIds.length === 0 && (
                    <p className="text-xs text-destructive mt-2">Velg minst én person for å fortsette.</p>
                  )}
                </div>
              )}



              {/* Summary */}
              <div className="rounded-2xl bg-muted p-4 mt-4">
                <p className="text-sm text-muted-foreground mb-1">{t('event.summary')}</p>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">
                  {format(startDate, 'd. MMMM yyyy', { locale: dateLocale })}
                  {endDate && ` → ${format(endDate, 'd. MMMM yyyy', { locale: dateLocale })}`}
                  {' · '}
                  {getDayPartRangeLabel()}
                  {!useAllDay && startTime && ` · ${startTime}`}
                  {!useAllDay && endTime ? `–${endTime}` : ''}
                </p>
                {category && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {resolveCategoryLabel(category, otherLabel, locale)}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <PopupStickyFooter>
        <button
          type="button"
          onClick={step < STEPS ? goNext : handleSubmit}
          disabled={!canProceed || createEvent.isPending}
          className="w-full rounded-2xl bg-green-200 text-green-900 py-3.5 font-semibold disabled:opacity-40 transition-all text-base hover:bg-green-300"
        >
          {step < STEPS ? t('common.next') : createEvent.isPending ? t('event.saving') : t('event.create')}
        </button>
      </PopupStickyFooter>
    </CenteredPopup>
  );
};

export default NewEventFlow;
