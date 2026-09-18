import { useEffect, useState } from 'react';
import { format, addDays } from 'date-fns';
import { toast } from 'sonner';
import { useUpdateEvent, useEventVisibleMembers, syncEventVisibleMembers, type Event } from '@/hooks/useEvents';
import { getCategoryOptionsForKind, EVENT_CATEGORY_META, type EventCategory } from '@/lib/eventCategories';
import { resolveCategoryVisuals, getMemberColorMap } from '@/lib/categoryPresentation';
import {
  DAY_PART_ORDER,
  DAY_PART_TIME_RANGES,
  timeRangeToDayParts,
  ALL_DAY_INDEX,
  AFTERNOON_INDEX,
  isAllDayPart,
} from '@/lib/dayParts';
import { buildEventUpdatePatch } from '@/lib/buildEventUpdatePatch';
import type { HouseholdMember } from '@/hooks/useHousehold';
import CenteredPopup from '@/components/CenteredPopup';
import PopupStickyFooter from '@/components/PopupStickyFooter';
import { scrollFocusIntoView } from '@/lib/scrollFocusIntoView';
import { useLocale } from '@/hooks/useLocale';
import { useVacationMode } from '@/hooks/useVacationMode';
import type { MessageKey } from '@/lib/i18n';

interface EditEventQuickSheetProps {
  event: Event;
  householdId: string;
  currentMemberId: string;
  members?: HouseholdMember[];
  calendarKind?: string | null;
  showInOtherCalendars?: boolean;
  onClose: () => void;
  onSaved?: (eventId: string, dateStr: string) => void;
  onOpenFullEdit?: (event: Event) => void;
}

const FIELD =
  'min-w-0 box-border appearance-none rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary';
const ADD_BTN =
  'shrink-0 rounded-xl bg-muted active:bg-muted/70 px-3 py-3 text-sm font-medium whitespace-nowrap min-w-[4.75rem] transition-colors';

const EditEventQuickSheet = ({ event, members = [], currentMemberId, calendarKind = 'home', showInOtherCalendars = false, onClose, onSaved, onOpenFullEdit }: EditEventQuickSheetProps) => {
  const { t } = useLocale();
  const vacation = useVacationMode();
  const updateEvent = useUpdateEvent();
  const memberColorMap = getMemberColorMap(members.find((m) => m.id === currentMemberId));
  const dayPartLabel = (key: string) => {
    const msgKey = `dayPart.${key}` as MessageKey;
    const translated = t(msgKey);
    return translated === msgKey ? key : translated;
  };
  const catLabel = (key: string) => {
    const msgKey = `cat.${key}` as MessageKey;
    const translated = t(msgKey);
    return translated === msgKey ? (EVENT_CATEGORY_META[key as EventCategory]?.label ?? key) : translated;
  };

  const initStartIdx = (() => {
    const dps = (event as any).day_part_start as string | null;
    const idx = DAY_PART_ORDER.indexOf(dps as any);
    return idx >= 0 ? idx : 2;
  })();
  const initEndIdx = (() => {
    const dpe = (event as any).day_part_end as string | null;
    const idx = DAY_PART_ORDER.indexOf(dpe as any);
    return idx >= 0 ? idx : initStartIdx;
  })();

  const [title, setTitle] = useState(event.title);
  const [startDate, setStartDate] = useState(new Date(event.event_date + 'T12:00:00'));
  const [endDate, setEndDate] = useState<Date | null>(
    (event as any).end_date && (event as any).end_date !== event.event_date
      ? new Date((event as any).end_date + 'T12:00:00')
      : null,
  );
  const [selectedDayParts, setSelectedDayParts] = useState<[number, number]>([initStartIdx, initEndIdx]);
  const [dayPartClickCount, setDayPartClickCount] = useState(initStartIdx === initEndIdx ? 1 : 2);
  const [startTime, setStartTime] = useState(event.start_time?.slice(0, 5) || DAY_PART_TIME_RANGES[DAY_PART_ORDER[initStartIdx]].start);
  const [endTime, setEndTime] = useState<string | null>(event.end_time?.slice(0, 5) || null);
  const [showDayParts, setShowDayParts] = useState(false);
  const [showTimedMultiDay, setShowTimedMultiDay] = useState(() => {
    const multi =
      !!(event as any).end_date && (event as any).end_date !== event.event_date;
    const dps = (event as any).day_part_start as string | null;
    return multi && !isAllDayPart(dps) && dps !== 'full_diem' && !!event.start_time;
  });
  const [category, setCategory] = useState<EventCategory>((event.category as EventCategory) || 'other');
  const categoryOptions = (() => {
    const base = getCategoryOptionsForKind(calendarKind, {
      vacationMode: vacation.enabledForCalendar && vacation.snapshot.active,
    });
    if (category && !base.includes(category) && EVENT_CATEGORY_META[category]) {
      return [category, ...base.filter((c) => c !== category)];
    }
    return base;
  })();
  const [otherLabel, setOtherLabel] = useState<string>((event as any).category_label_override || '');
  const [visibility, setVisibility] = useState<'all_members' | 'private' | 'selected_members'>(
    (event.visibility_type as any) || 'all_members',
  );
  const { data: existingVisibleIds } = useEventVisibleMembers(
    event.visibility_type === 'selected_members' ? event.id : undefined,
  );
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  useEffect(() => {
    if (existingVisibleIds) setSelectedMemberIds(existingVisibleIds);
  }, [existingVisibleIds]);
  const [location, setLocation] = useState(event.location || '');
  const [notes, setNotes] = useState(event.notes || '');
  const [hideFromOtherCalendars, setHideFromOtherCalendars] = useState(
    !!event.hide_from_other_calendars,
  );

  const dayPartStart = DAY_PART_ORDER[selectedDayParts[0]];
  const dayPartEnd = DAY_PART_ORDER[selectedDayParts[1]];
  const isMultiDay = !!endDate;
  const useAllDay = isMultiDay ? !showTimedMultiDay : isAllDayPart(dayPartStart);

  const syncTimesFromDayPart = (startIdx: number, endIdx: number) => {
    const range = DAY_PART_TIME_RANGES[DAY_PART_ORDER[startIdx]];
    const rangeEnd = DAY_PART_TIME_RANGES[DAY_PART_ORDER[endIdx]];
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
    setSelectedDayParts([AFTERNOON_INDEX, AFTERNOON_INDEX]);
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
    if (value && endTime) {
      const newRange = timeRangeToDayParts(value, endTime);
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

  const addOneHour = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const total = ((h * 60 + (m || 0) + 60) % (24 * 60) + 24 * 60) % (24 * 60);
    const nh = Math.floor(total / 60);
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  };

  const handleAddHour = () => {
    if (isMultiDay) setShowTimedMultiDay(true);
    if (!endTime) setEndTime(addOneHour(startTime || '12:00'));
    else setEndTime(addOneHour(endTime));
  };

  const isDayPartSelected = (idx: number) => idx >= selectedDayParts[0] && idx <= selectedDayParts[1];

  const handleAddDay = () => {
    const becomingMulti = !endDate;
    if (!endDate) setEndDate(addDays(startDate, 1));
    else setEndDate(addDays(endDate, 1));
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

  const canSave =
    title.trim().length > 0 &&
    !!category &&
    (visibility !== 'selected_members' || selectedMemberIds.length > 0);

  const handleSubmit = async () => {
    if (!canSave) return;
    try {
      await updateEvent.mutateAsync({
        id: event.id,
        patch: buildEventUpdatePatch({
          title,
          startDate,
          endDate,
          dayPartStart: useAllDay ? 'all_day' : dayPartStart,
          dayPartEnd: useAllDay ? 'all_day' : dayPartEnd,
          startTime: useAllDay ? '' : startTime,
          endTime: useAllDay ? '' : (endTime || ''),
          category,
          otherLabel,
          visibility,
          location,
          notes,
          hideFromOtherCalendars,
        }),
      });
      try {
        await syncEventVisibleMembers(
          event.id,
          visibility === 'selected_members' ? selectedMemberIds : [],
        );
      } catch (syncErr: any) {
        console.error('[EditEventQuickSheet] sync visible members failed', syncErr);
        toast.error(t('event.shareFailed'));
      }
      onSaved?.(event.id, format(startDate, 'yyyy-MM-dd'));
      onClose();
    } catch (err: any) {
      console.error('[EditEventQuickSheet] update failed', err);
      toast.error(err?.message || t('event.saveFailed'));
    }
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{children}</h3>
  );

  return (
    <CenteredPopup onClose={onClose} onExit={onClose} size="sheet" zClassName="z-[70]">
      <div className="flex items-center px-5 pt-1 pb-3 shrink-0">
        <h2 className="text-lg font-bold">{t('event.quickEdit')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain scroll-touch px-5 pb-4 space-y-5 min-h-0" data-sheet-scroll>
          {/* Tittel */}
          <div>
            <SectionTitle>{t('event.title')}</SectionTitle>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('event.what')}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Dato */}
          <div>
            <SectionTitle>{t('event.date')}</SectionTitle>
            <div className="flex gap-2">
              <input
                type="date"
                value={format(startDate, 'yyyy-MM-dd')}
                onChange={(e) => {
                  const d = new Date(e.target.value + 'T12:00:00');
                  setStartDate(d);
                  if (endDate && endDate <= d) setEndDate(null);
                }}
                className={`flex-1 ${FIELD}`}
              />
              <button type="button" onClick={handleAddDay} className={ADD_BTN}>
                {t('event.addDay')}
              </button>
            </div>
            {endDate && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="date"
                  value={format(endDate, 'yyyy-MM-dd')}
                  onChange={(e) => setEndDate(new Date(e.target.value + 'T12:00:00'))}
                  min={format(addDays(startDate, 1), 'yyyy-MM-dd')}
                  className={`flex-1 ${FIELD}`}
                />
                <button type="button" onClick={clearEndDate} className="p-2 rounded-full hover:bg-muted text-muted-foreground">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              </div>
            )}
          </div>

          {/* Klokke / hele dagen */}
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
                <SectionTitle>{t('event.clock')}</SectionTitle>
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
                {endTime && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => handleEndTimeChange(e.target.value)}
                      className={`flex-1 ${FIELD}`}
                    />
                    <button type="button" onClick={() => setEndTime(null)} className="p-2 rounded-full hover:bg-muted text-muted-foreground">
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
              </>
            )}
          </div>

          {/* Del av dagen — optional (hidden when multi-day all-day) */}
          {!(isMultiDay && !showTimedMultiDay) && (
          <div>
            {!showDayParts ? (
              <button
                type="button"
                onClick={() => setShowDayParts(true)}
                className="text-sm text-muted-foreground underline underline-offset-2"
              >
                {t('event.pickDayPart')}
              </button>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <SectionTitle>{t('event.dayPart')}</SectionTitle>
                  <button
                    type="button"
                    onClick={() => setShowDayParts(false)}
                    className="text-xs text-muted-foreground underline underline-offset-2 mb-2"
                  >
                    {t('event.hideDayPart')}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {DAY_PART_ORDER.map((key, idx) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleDayPartClick(idx)}
                      className={`rounded-xl py-2.5 px-3 text-sm font-medium transition-all ${
                        isDayPartSelected(idx)
                          ? 'bg-calendar-accent text-foreground ring-2 ring-calendar-accent'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      {dayPartLabel(key)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          {/* Sted & Notat */}
          <div className="space-y-3">
            <div>
              <SectionTitle>{t('event.place')}</SectionTitle>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('common.optional')}
                onFocus={scrollFocusIntoView}
                className={`w-full ${FIELD}`}
              />
            </div>
            <div>
              <SectionTitle>{t('event.notes')}</SectionTitle>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('common.optional')}
                rows={2}
                onFocus={scrollFocusIntoView}
                className={`w-full ${FIELD} resize-none`}
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <SectionTitle>{t('event.type')}</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {categoryOptions.map((key) => {
                const meta = EVENT_CATEGORY_META[key];
                const Icon = meta.Icon;
                const selected = category === key;
                const visuals = resolveCategoryVisuals(key, memberColorMap);
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setCategory(key);
                      if (key !== 'other') setOtherLabel('');
                    }}
                    className={`rounded-xl py-2.5 px-3 text-sm font-medium transition-all flex items-center justify-between ${
                      selected ? 'ring-2 ring-current' : 'bg-muted hover:bg-muted/80'
                    }`}
                    style={selected ? { backgroundColor: visuals.soft, color: visuals.ink } : undefined}
                  >
                    <span>{catLabel(key)}</span>
                    <Icon size={16} strokeWidth={2.5} style={{ color: visuals.ink }} />
                  </button>
                );
              })}
            </div>
            {category === 'other' && (
              <input
                type="text"
                value={otherLabel}
                onChange={(e) => setOtherLabel(e.target.value)}
                placeholder={t('event.otherTypePlaceholder')}
                className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
            )}
          </div>

          {/* Synlighet */}
          <div>
            <SectionTitle>{t('event.visibility')}</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'all_members' as const, label: t('event.everyone') },
                { value: 'private' as const, label: t('event.onlyMe') },
                { value: 'selected_members' as const, label: t('event.selectedShort') },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setVisibility(opt.value)}
                  className={`rounded-xl py-2.5 px-3 text-sm font-medium transition-all ${
                    visibility === opt.value ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {showInOtherCalendars && (
              <label className="mt-3 flex items-start gap-3 rounded-xl bg-muted/50 p-3 cursor-pointer">
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
              <div className="mt-3 rounded-xl bg-muted/50 p-3">
                <div className="flex flex-col gap-1.5">
                  {members.filter((m) => m.id !== currentMemberId).map((m) => {
                    const checked = selectedMemberIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMemberIds((prev) => checked ? prev.filter((id) => id !== m.id) : [...prev, m.id])}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all ${checked ? 'bg-primary/20 ring-2 ring-primary' : 'bg-background hover:bg-muted'}`}
                      >
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                          style={{ backgroundColor: `hsl(var(--member-${m.color_token.replace('pastel-', '')}))` }}>
                          {m.display_name.charAt(0)}
                        </span>
                        <span className="flex-1 text-sm font-medium">{m.display_name}</span>
                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${checked ? 'bg-primary border-primary' : 'border-border'}`}>
                          {checked && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </span>
                      </button>
                    );
                  })}
                  {members.filter((m) => m.id !== currentMemberId).length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('event.noMembers')}</p>
                  )}
                </div>
                {selectedMemberIds.length === 0 && (
                  <p className="text-xs text-destructive mt-2">{t('event.pickOne')}</p>
                )}
              </div>
            )}
          </div>

        </div>

        <PopupStickyFooter>
          <button
            onClick={handleSubmit}
            disabled={!canSave || updateEvent.isPending}
            className="w-full rounded-2xl bg-green-200 text-green-900 py-3.5 font-semibold disabled:opacity-40 hover:bg-green-300 transition-all"
          >
            {updateEvent.isPending ? t('event.saving') : t('common.save')}
          </button>
        </PopupStickyFooter>
    </CenteredPopup>
  );
};

export default EditEventQuickSheet;
