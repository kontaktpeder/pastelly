import { EVENT_CATEGORY_META, type EventCategory } from '@/lib/eventCategories';
import { resolveCategoryLabel, resolveCategoryVisuals } from '@/lib/categoryPresentation';
import { VACATION_QUICK_CATEGORIES } from '@/lib/vacationMode';
import { useLocale } from '@/hooks/useLocale';

interface VacationQuickAddProps {
  onPick: (category: EventCategory) => void;
  pendingCategory?: string | null;
}

const VacationQuickAdd = ({ onPick, pendingCategory }: VacationQuickAddProps) => {
  const { t, locale } = useLocale();

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-vacation-ink/70 px-0.5">
        {t('vacation.quickAdd')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {VACATION_QUICK_CATEGORIES.map((key) => {
          const meta = EVENT_CATEGORY_META[key];
          const Icon = meta.Icon;
          const visuals = resolveCategoryVisuals(key);
          const busy = pendingCategory === key;
          return (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => onPick(key)}
              className="flex items-center gap-2.5 rounded-2xl px-3 py-3.5 text-left shadow-sm active:scale-[0.98] transition-transform disabled:opacity-60"
              style={{ backgroundColor: visuals.soft }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: visuals.rail }}
              >
                <Icon size={18} strokeWidth={2.4} style={{ color: visuals.ink }} />
              </span>
              <span className="min-w-0 text-sm font-bold leading-tight" style={{ color: visuals.ink }}>
                {busy ? t('vacation.added') : resolveCategoryLabel(key, null, locale)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default VacationQuickAdd;
