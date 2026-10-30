import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  Dumbbell,
  UtensilsCrossed,
  Wine,
  BriefcaseBusiness,
  Heart,
  Users,
  Plane,
  Headphones,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateEvent } from '@/hooks/useEvents';
import { useLocale } from '@/hooks/useLocale';
import { translateDayPart } from '@/lib/i18n';
import type { DayPart } from '@/lib/dayParts';
import {
  SEED_TEMPLATES,
  SEED_DAY_PARTS,
  buildSeedEvents,
  defaultPlacementFor,
  nextDays,
  type SeedPlacement,
  type SeedTemplateId,
} from '@/lib/seedWeek';
import { dismissSeedWeek } from '@/lib/seedWeekStorage';
import { peekWelcomeIntent } from '@/lib/welcomeIntent';
import CenteredPopup from '@/components/CenteredPopup';
import PopupStickyFooter from '@/components/PopupStickyFooter';

const ICONS: Record<SeedTemplateId, LucideIcon> = {
  training: Dumbbell,
  dinner_home: UtensilsCrossed,
  dinner_out: Wine,
  work_late: BriefcaseBusiness,
  date_night: Heart,
  friends: Users,
  weekend: Plane,
  alone_time: Headphones,
  chores: Sparkles,
};

interface SeedWeekFlowProps {
  householdId: string;
  onClose: () => void;
  onComplete: () => void;
}

type Step = 'pick' | 'place';

const SeedWeekFlow = ({ householdId, onClose, onComplete }: SeedWeekFlowProps) => {
  const { t, locale, dateLocale } = useLocale();
  const queryClient = useQueryClient();
  const createEvent = useCreateEvent();
  const [step, setStep] = useState<Step>('pick');
  const [selected, setSelected] = useState<Set<SeedTemplateId>>(() => new Set());
  const [placements, setPlacements] = useState<SeedPlacement[]>([]);
  const [saving, setSaving] = useState(false);

  const dayOptions = useMemo(() => nextDays(new Date(), 7), []);

  const toggle = (id: SeedTemplateId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const goPlace = () => {
    if (selected.size === 0) return;
    const next = [...selected].map((id) => defaultPlacementFor(id));
    setPlacements(next);
    setStep('place');
  };

  const updatePlacement = (id: SeedTemplateId, patch: Partial<Pick<SeedPlacement, 'date' | 'dayPart'>>) => {
    setPlacements((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  };

  const finish = () => {
    dismissSeedWeek(householdId);
    onComplete();
  };

  const handleSkip = () => {
    dismissSeedWeek(householdId);
    onClose();
  };

  const handleSubmit = async () => {
    if (placements.length === 0) return;
    setSaving(true);
    try {
      const payloads = buildSeedEvents(householdId, placements, (key) => t(key));
      for (const payload of payloads) {
        await createEvent.mutateAsync(payload);
      }
      await queryClient.invalidateQueries({ queryKey: ['household-has-events', householdId] });
      // Create flow shows WelcomeDialog after close — avoid a competing toast.
      if (peekWelcomeIntent(householdId) !== 'create') {
        toast.success(t('seed.done', { count: payloads.length }));
      }
      finish();
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step === 'place') setStep('pick');
    else handleSkip();
  };

  return (
    <CenteredPopup
      variant="browse"
      onClose={handleBack}
      onExit={handleSkip}
      zClassName="z-[70]"
    >
      <div className="px-5 pt-1 pb-3 shrink-0">
        <h2 className="text-2xl font-bold">
          {step === 'pick' ? t('seed.title') : t('seed.placeTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {step === 'pick' ? t('seed.subtitle') : t('seed.placeSubtitle')}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-touch px-5 pb-4 space-y-3" data-sheet-scroll>
        {step === 'pick' &&
          SEED_TEMPLATES.map((template) => {
            const active = selected.has(template.id);
            const Icon = ICONS[template.id];
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => toggle(template.id)}
                className={`w-full rounded-xl py-3 px-4 text-sm font-medium transition-all flex items-center gap-3 text-left ${
                  active ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted active:bg-muted/80'
                }`}
              >
                <Icon size={18} strokeWidth={2.5} className="shrink-0 text-foreground/80" />
                <span className="min-w-0 flex-1">{t(template.titleKey)}</span>
              </button>
            );
          })}

        {step === 'place' &&
          placements.map((p) => {
            const template = SEED_TEMPLATES.find((t) => t.id === p.id)!;
            const Icon = ICONS[p.id];
            return (
              <div key={p.id} className="rounded-2xl bg-muted/50 p-4 space-y-4 overflow-visible">
                <div className="flex items-center gap-2">
                  <Icon size={16} strokeWidth={2.5} className="text-foreground/80" />
                  <p className="font-semibold text-sm">{t(template.titleKey)}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t('event.date')}</p>
                  <div className="flex gap-2 overflow-x-auto py-1 -mx-1 px-1">
                    {dayOptions.map((d) => {
                      const key = format(d, 'yyyy-MM-dd');
                      const active = p.date === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => updatePlacement(p.id, { date: key })}
                          className={`shrink-0 rounded-xl px-2.5 py-2 text-center min-w-[3.25rem] transition-all ${
                            active
                              ? 'bg-primary/25 outline outline-2 outline-primary outline-offset-0'
                              : 'bg-background'
                          }`}
                        >
                          <span className="block text-[10px] uppercase text-muted-foreground">
                            {format(d, 'EEE', { locale: dateLocale })}
                          </span>
                          <span className="block text-sm font-semibold">{format(d, 'd')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t('event.dayPart')}</p>
                  <div className="flex flex-wrap gap-2 py-1">
                    {SEED_DAY_PARTS.map((part) => {
                      const active = p.dayPart === part;
                      return (
                        <button
                          key={part}
                          type="button"
                          onClick={() => updatePlacement(p.id, { dayPart: part as DayPart })}
                          className={`rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                            active
                              ? 'bg-primary/25 outline outline-2 outline-primary outline-offset-0'
                              : 'bg-background'
                          }`}
                        >
                          {translateDayPart(locale, part)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground pt-0.5">
                  {format(parseISO(p.date), 'EEEE d. MMM', { locale: dateLocale })}
                  {' · '}
                  {translateDayPart(locale, p.dayPart)}
                </p>
              </div>
            );
          })}
      </div>

      <PopupStickyFooter className="space-y-2">
        {step === 'pick' ? (
          <>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={goPlace}
              className="w-full rounded-2xl bg-green-200 text-green-900 py-3.5 font-semibold disabled:opacity-40 transition-all text-base hover:bg-green-300"
            >
              {selected.size === 0
                ? t('seed.pickSome')
                : t('seed.nextPlace', { count: selected.size })}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="w-full py-2 text-sm font-medium text-muted-foreground underline underline-offset-2"
            >
              {t('seed.skip')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSubmit()}
              className="w-full rounded-2xl bg-green-200 text-green-900 py-3.5 font-semibold disabled:opacity-40 transition-all text-base hover:bg-green-300"
            >
              {saving ? t('seed.saving') : t('seed.submit', { count: placements.length })}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setStep('pick')}
              className="w-full py-2 text-sm font-medium text-muted-foreground underline underline-offset-2"
            >
              {t('common.back')}
            </button>
          </>
        )}
      </PopupStickyFooter>
    </CenteredPopup>
  );
};

export default SeedWeekFlow;
