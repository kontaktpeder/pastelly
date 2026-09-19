import { EVENT_CATEGORY_META, type EventCategory } from '@/lib/eventCategories';
import { resolveCategoryLabel } from '@/lib/categoryPresentation';
import { VACATION_QUICK_CATEGORIES } from '@/lib/vacationMode';
import { useLocale } from '@/hooks/useLocale';

interface VacationQuickAddProps {
  onPick: (category: EventCategory) => void;
  pendingCategory?: string | null;
  categories?: readonly EventCategory[];
}

const VacationQuickAdd = ({
  onPick,
  pendingCategory,
  categories = VACATION_QUICK_CATEGORIES,
}: VacationQuickAddProps) => {
  const { locale } = useLocale();

  return (
    <div className="py-1">
      {categories.map((key) => {
        const busy = pendingCategory === key;
        return (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() => onPick(key)}
            className="w-full px-1 py-2.5 text-left text-sm text-foreground disabled:opacity-50"
          >
            {busy
              ? EVENT_CATEGORY_META[key]?.label
              : resolveCategoryLabel(key, null, locale)}
          </button>
        );
      })}
    </div>
  );
};

export default VacationQuickAdd;
