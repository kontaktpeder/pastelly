import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import CenteredPopup from '@/components/CenteredPopup';
import PopupStickyFooter from '@/components/PopupStickyFooter';
import { useLocale } from '@/hooks/useLocale';
import { useMembers } from '@/hooks/useHousehold';
import {
  fetchEventsForDateRange,
  syncEventVisibleMembers,
  useCreateEvent,
} from '@/hooks/useEvents';
import type { CalendarMembership } from '@/hooks/useCurrentHouseholdContext';
import { resolveCalendarKind } from '@/lib/calendarKinds';
import { addDaysYmd, datesForTimes } from '@/lib/imageImport/parseClock';
import { applyConfirmedYear, extractShiftsFromWords, needsYearConfirmation } from '@/lib/imageImport/extractShifts';
import { findPossibleCalendarDuplicate, mergeCertainImageDuplicates } from '@/lib/imageImport/dedupe';
import { recognizeImagePages } from '@/lib/imageImport/runOcr';
import { proposalToCreateInput } from '@/lib/imageImport/toCreateInput';
import type { CalendarDuplicate, ImageCrop, ImportVisibility, ShiftProposal } from '@/lib/imageImport/types';
import { scrollFocusIntoView } from '@/lib/scrollFocusIntoView';

type Step = 'pick' | 'reading' | 'year' | 'setup' | 'confirm';

interface ImageImportFlowProps {
  memberships: CalendarMembership[];
  currentHouseholdId: string;
  currentMemberId: string;
  suggestedYear: number;
  showInOtherCalendars?: boolean;
  onClose: (summary?: { added: number; skipped: number }) => void;
  onCreated?: (eventId: string, dateStr: string) => void;
  onSwitchCalendar?: (householdId: string) => void;
}

function readFilesAsDataUrls(files: File[]): Promise<string[]> {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }),
    ),
  );
}

function readImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('image'));
    img.src = url;
  });
}

function spansNextDay(proposal: { eventDate: string | null; endDate: string | null }): boolean {
  return !!proposal.eventDate && !!proposal.endDate && proposal.endDate > proposal.eventDate;
}

/** Show the whole source card, in its own shape, without clipping the text. */
function ProposalCrop({ src, crop }: { src: string; crop: ImageCrop }) {
  const safeW = Math.max(crop.width, 1);
  const safeH = Math.max(crop.height, 1);
  return (
    <div className="w-full overflow-hidden rounded-2xl bg-muted">
      <div className="relative h-0 w-full" style={{ paddingBottom: `${(safeH / safeW) * 100}%` }}>
        <img
          src={src}
          alt=""
          className="absolute max-w-none"
          style={{
            width: `${(crop.imageWidth / safeW) * 100}%`,
            height: `${(crop.imageHeight / safeH) * 100}%`,
            left: `${-(crop.x / safeW) * 100}%`,
            top: `${-(crop.y / safeH) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}

const ImageImportFlow = ({
  memberships,
  currentHouseholdId,
  currentMemberId,
  suggestedYear,
  showInOtherCalendars = false,
  onClose,
  onCreated,
  onSwitchCalendar,
}: ImageImportFlowProps) => {
  const { t, dateLocale } = useLocale();
  const createEvent = useCreateEvent();
  const fileRef = useRef<HTMLInputElement>(null);
  const addingRef = useRef(false);
  const closedRef = useRef(false);
  const [step, setStep] = useState<Step>('pick');
  const [images, setImages] = useState<string[]>([]);
  const [proposals, setProposals] = useState<ShiftProposal[]>([]);
  const [index, setIndex] = useState(0);
  const [added, setAdded] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [yearDraft, setYearDraft] = useState(String(suggestedYear));
  const [householdId, setHouseholdId] = useState(currentHouseholdId);
  const [visibility, setVisibility] = useState<ImportVisibility>('all_members');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [hideFromOther, setHideFromOther] = useState(false);
  const [editing, setEditing] = useState(false);
  const [calendarHits, setCalendarHits] = useState<Record<string, CalendarDuplicate>>({});
  const [error, setError] = useState('');

  const { data: members = [] } = useMembers(householdId);
  const selectedMembership = memberships.find((m) => m.household_id === householdId);
  const viewerId = selectedMembership?.id ?? currentMemberId;
  const calendarKind = resolveCalendarKind(selectedMembership?.household ?? null);
  const category = calendarKind === 'work' ? 'production' : 'work';
  const leakToggle = !!(selectedMembership?.show_in_other_calendars ?? showInOtherCalendars);
  const current = proposals[index] ?? null;
  const remaining = Math.max(proposals.length - index, 0);

  const finish = (addedCount: number, skippedCount: number) => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (addedCount > 0 && householdId !== currentHouseholdId) {
      onSwitchCalendar?.(householdId);
    }
    onClose({ added: addedCount, skipped: skippedCount });
  };

  const handleDismiss = () => {
    if (step === 'confirm' || step === 'setup' || step === 'year') {
      finish(added, skipped + remaining);
      return;
    }
    onClose();
  };

  const handleFiles = async (list: FileList | null) => {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setError('');
    setStep('reading');
    try {
      const urls = await readFilesAsDataUrls(files);
      setImages(urls);
      const sizes = await Promise.all(urls.map((url) => readImageSize(url).catch(() => null)));
      const pages = await recognizeImagePages(urls);
      const extracted = pages.flatMap((page, i) => extractShiftsFromWords(page.words, i, sizes[i]).proposals);
      const merged = mergeCertainImageDuplicates(extracted);
      if (merged.length === 0) {
        const snippet = pages
          .map((page) => page.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 140);
        setError(snippet ? t('import.noShiftsHint', { snippet }) : t('import.noShifts'));
        setStep('pick');
        return;
      }
      setProposals(merged);
      setIndex(0);
      setAdded(0);
      setSkipped(0);
      setStep(needsYearConfirmation(merged) ? 'year' : 'setup');
    } catch (err) {
      console.error('[ImageImportFlow] ocr failed', err);
      setError(t('import.readFailed'));
      setStep('pick');
    }
  };

  const confirmYear = () => {
    const year = Number(yearDraft);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return;
    setProposals((prev) => applyConfirmedYear(prev, year));
    setStep('setup');
  };

  const beginConfirm = async () => {
    if (visibility === 'selected_members' && selectedMemberIds.length === 0) return;
    const dated = proposals.filter((p) => p.eventDate);
    const start = dated.map((p) => p.eventDate!).sort()[0];
    const end = dated.map((p) => p.endDate || p.eventDate!).sort().at(-1);
    if (start && end) {
      try {
        const existing = await fetchEventsForDateRange(householdId, start, end);
        const hits: Record<string, CalendarDuplicate> = {};
        for (const proposal of dated) {
          const hit = findPossibleCalendarDuplicate(proposal, existing);
          if (hit) hits[proposal.id] = hit;
        }
        setCalendarHits(hits);
      } catch (err) {
        console.warn('[ImageImportFlow] calendar lookup failed', err);
      }
    }
    setStep('confirm');
    setEditing(false);
  };

  const goNext = (wasSkip: boolean) => {
    const next = index + 1;
    const nextSkipped = skipped + (wasSkip ? 1 : 0);
    if (next >= proposals.length) {
      finish(added + (wasSkip ? 0 : 1), nextSkipped);
      return;
    }
    if (wasSkip) setSkipped(nextSkipped);
    setIndex(next);
    setEditing(false);
  };

  const handleAdd = async () => {
    if (!current?.eventDate || addingRef.current || createEvent.isPending) return;
    addingRef.current = true;
    try {
      const created = await createEvent.mutateAsync(
        proposalToCreateInput(current, householdId, visibility, category, hideFromOther),
      );
      if (visibility === 'selected_members') {
        try {
          await syncEventVisibleMembers(created.id, selectedMemberIds);
        } catch (syncErr) {
          console.error('[ImageImportFlow] visible members failed', syncErr);
        }
      }
      setAdded((n) => n + 1);
      onCreated?.(created.id, current.eventDate);
      goNext(false);
    } catch (err: any) {
      toast.error(err?.message || t('import.addFailed'));
    } finally {
      addingRef.current = false;
    }
  };

  const updateCurrent = (patch: Partial<ShiftProposal>) => {
    setProposals((prev) =>
      prev.map((p, i) => {
        if (i !== index) return p;
        const next = { ...p, ...patch };
        if (patch.eventDate && patch.endDate == null) {
          const spans = spansNextDay(p);
          next.endDate = spans && next.eventDate ? addDaysYmd(next.eventDate, 1) : next.eventDate;
        }
        if ((patch.startTime || patch.endTime) && next.eventDate) {
          const timed = datesForTimes(
            next.eventDate,
            next.startTime,
            next.endTime,
            spansNextDay(next),
          );
          next.endDate = timed.endDate;
          next.overnight = timed.overnight;
        }
        return next;
      }),
    );
  };

  const summaryLine = useMemo(() => {
    if (!current?.eventDate) return '';
    const startLabel = format(new Date(current.eventDate + 'T12:00:00'), 'd. MMMM', { locale: dateLocale });
    const when =
      current.endDate && current.endDate > current.eventDate
        ? `${startLabel}–${format(new Date(current.endDate + 'T12:00:00'), 'd. MMMM', { locale: dateLocale })}`
        : startLabel;
    return [current.title, current.location, when, `${current.startTime}–${current.endTime}`]
      .filter(Boolean)
      .join(' · ');
  }, [current, dateLocale]);

  return (
    <CenteredPopup variant="wizard" onClose={handleDismiss} onExit={handleDismiss} zClassName="z-[70]">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-touch px-5 pt-2 pb-4" data-sheet-scroll>
        {step === 'pick' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-center">{t('import.fromImage')}</h2>
            <p className="text-sm text-muted-foreground text-center">{t('import.pickHint')}</p>
            {error && <p className="text-sm text-destructive text-center break-words">{error}</p>}
          </div>
        )}

        {step === 'reading' && (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold">{t('import.reading')}</p>
            <p className="text-sm text-muted-foreground mt-2">{t('import.readingHint')}</p>
          </div>
        )}

        {step === 'year' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-center">{t('import.yearMissing')}</h2>
            <p className="text-sm text-muted-foreground text-center">{t('import.yearHint')}</p>
            <label className="block">
              <span className="text-sm font-medium">{t('import.year')}</span>
              <input
                type="number"
                inputMode="numeric"
                value={yearDraft}
                onFocus={scrollFocusIntoView}
                onChange={(e) => setYearDraft(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-base"
              />
            </label>
          </div>
        )}

        {step === 'setup' && (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold text-center">{t('import.setup')}</h2>
            <p className="text-sm text-muted-foreground text-center">{t('import.workerIsYou')}</p>

            {memberships.length > 1 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">{t('import.chooseCalendar')}</p>
                <div className="space-y-2">
                  {memberships.map((m) => (
                    <button
                      key={m.household_id}
                      type="button"
                      onClick={() => {
                        setHouseholdId(m.household_id);
                        setSelectedMemberIds([]);
                      }}
                      className={`w-full rounded-2xl px-4 py-3 text-left font-medium ${
                        householdId === m.household_id
                          ? 'bg-primary/20 ring-2 ring-primary'
                          : 'bg-muted'
                      }`}
                    >
                      {m.household.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-lg font-bold">{t('event.who')}</h3>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: 'all_members' as const, label: t('event.everyone') },
                    { value: 'private' as const, label: t('event.onlyMe') },
                    { value: 'selected_members' as const, label: t('event.selected') },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVisibility(opt.value)}
                    className={`flex min-h-12 items-center justify-center rounded-2xl px-2 py-2 text-center text-sm font-medium ${
                      visibility === opt.value ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {visibility === 'private'
                  ? t('event.onlyMeHint')
                  : visibility === 'selected_members'
                    ? t('event.selectedHint')
                    : t('event.everyoneHint')}
              </p>
            </div>

            {visibility === 'selected_members' && (
              <div className="space-y-2">
                {members
                  .filter((m) => m.id !== viewerId)
                  .map((m) => {
                    const checked = selectedMemberIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setSelectedMemberIds((prev) =>
                            checked ? prev.filter((id) => id !== m.id) : [...prev, m.id],
                          )
                        }
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 ${
                          checked ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted'
                        }`}
                      >
                        {m.display_name}
                      </button>
                    );
                  })}
              </div>
            )}

            {leakToggle && (
              <label className="flex items-start gap-3 rounded-xl bg-muted/50 px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={hideFromOther}
                  onChange={(e) => setHideFromOther(e.target.checked)}
                />
                <span>
                  <span className="block font-semibold text-sm">{t('event.hideFromOther')}</span>
                  <span className="block text-xs text-muted-foreground">{t('event.hideFromOtherHint')}</span>
                </span>
              </label>
            )}
          </div>
        )}

        {step === 'confirm' && current && (
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">
              {t('import.progress', { current: index + 1, total: proposals.length })}
            </p>
            {images[current.sourceImageIndex] && (
              <ProposalCrop src={images[current.sourceImageIndex]!} crop={current.crop} />
            )}
            {calendarHits[current.id] && (
              <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-950">
                {t('import.possibleDuplicate', { title: calendarHits[current.id]!.title })}
              </p>
            )}
            {current.mergedFromImages > 1 && (
              <p className="text-xs text-muted-foreground">{t('import.mergedFromImages')}</p>
            )}

            {editing ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  {t('event.title')}
                  <input
                    value={current.title}
                    onFocus={scrollFocusIntoView}
                    onChange={(e) => updateCurrent({ title: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-border px-4 py-3"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t('event.date')}
                  <input
                    type="date"
                    value={current.eventDate ?? ''}
                    onFocus={scrollFocusIntoView}
                    onChange={(e) =>
                      updateCurrent({
                        eventDate: e.target.value,
                        endDate: spansNextDay(current) ? addDaysYmd(e.target.value, 1) : e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-border px-4 py-3"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-sm font-medium">
                    {t('event.clock')}
                    <input
                      type="time"
                      value={current.startTime}
                      onFocus={scrollFocusIntoView}
                      onChange={(e) => updateCurrent({ startTime: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-border px-4 py-3"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    {t('event.endTime')}
                    <input
                      type="time"
                      value={current.endTime}
                      onFocus={scrollFocusIntoView}
                      onChange={(e) => updateCurrent({ endTime: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-border px-4 py-3"
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  {t('event.place')}
                  <input
                    value={current.location ?? ''}
                    onFocus={scrollFocusIntoView}
                    onChange={(e) => updateCurrent({ location: e.target.value || null })}
                    className="mt-1 w-full rounded-xl border border-border px-4 py-3"
                  />
                </label>
              </div>
            ) : (
              <div className="rounded-2xl bg-muted p-4">
                <p className="text-lg font-bold leading-tight">{current.title}</p>
                <p className="mt-1 text-sm">{summaryLine}</p>
              </div>
            )}

            {current.overnight && current.eventDate && (
              <div className="space-y-2">
                <p className="text-base font-medium">{t('import.spanQuestion')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { next: false, label: t('import.oneDay') },
                      { next: true, label: t('import.nextDay') },
                    ] as const
                  ).map((opt) => {
                    const selected = spansNextDay(current) === opt.next;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() =>
                          updateCurrent({
                            endDate: opt.next ? addDaysYmd(current.eventDate!, 1) : current.eventDate,
                          })
                        }
                        className={`flex min-h-12 items-center justify-center rounded-2xl px-3 py-2 text-center text-base font-medium ${
                          selected ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <PopupStickyFooter className="space-y-2">
        {step === 'pick' && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-2xl bg-green-200 py-3.5 font-semibold text-green-900"
          >
            {t('import.pickImages')}
          </button>
        )}
        {step === 'year' && (
          <button
            type="button"
            onClick={confirmYear}
            className="w-full rounded-2xl bg-green-200 py-3.5 font-semibold text-green-900"
          >
            {t('import.useYear', { year: yearDraft })}
          </button>
        )}
        {step === 'setup' && (
          <button
            type="button"
            onClick={() => void beginConfirm()}
            disabled={visibility === 'selected_members' && selectedMemberIds.length === 0}
            className="w-full rounded-2xl bg-green-200 py-3.5 font-semibold text-green-900 disabled:opacity-40"
          >
            {t('common.next')}
          </button>
        )}
        {step === 'confirm' && current && (
          <>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={createEvent.isPending || !current.eventDate}
              className="w-full rounded-2xl bg-green-200 py-3.5 font-semibold text-green-900 disabled:opacity-40"
            >
              {createEvent.isPending ? t('event.saving') : t('import.add')}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="rounded-2xl bg-muted py-3 font-semibold"
              >
                {editing ? t('import.doneEdit') : t('import.edit')}
              </button>
              <button
                type="button"
                onClick={() => goNext(true)}
                className="rounded-2xl bg-muted py-3 font-semibold"
              >
                {t('import.skip')}
              </button>
            </div>
          </>
        )}
        <button type="button" onClick={handleDismiss} className="w-full py-2 text-sm text-muted-foreground">
          {t('common.cancel')}
        </button>
      </PopupStickyFooter>
    </CenteredPopup>
  );
};

export default ImageImportFlow;
