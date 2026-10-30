import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EVENT_CATEGORY_META, getCategoryOptionsForKind } from '@/lib/eventCategories';
import {
  COLOR_TOKEN_OPTIONS,
  DEFAULT_CATEGORY_COLOR_MAP,
  getColorTokenSwatch,
  getMemberColorMap,
  resolveCategoryVisuals,
  type CategoryColorMap,
  type CategoryColorToken,
} from '@/lib/categoryPresentation';
import type { HouseholdMember } from '@/hooks/useHousehold';
import { resolveCategoryLabel } from '@/lib/categoryPresentation';
import { useLocale } from '@/hooks/useLocale';

interface CategoryColorSettingsProps {
  member: HouseholdMember;
  calendarKind?: string | null;
}

const CategoryColorSettings = ({ member, calendarKind = 'home' }: CategoryColorSettingsProps) => {
  const { t, locale } = useLocale();
  const queryClient = useQueryClient();
  const options = getCategoryOptionsForKind(calendarKind);
  const initial = getMemberColorMap(member) ?? { ...DEFAULT_CATEGORY_COLOR_MAP };
  const [map, setMap] = useState<CategoryColorMap>(initial);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: async (next: CategoryColorMap) => {
      const { error } = await supabase
        .from('household_members')
        .update({ category_color_map: next as any })
        .eq('id', member.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['currentMember'] });
      queryClient.invalidateQueries({ queryKey: ['current-household-context'] });
    },
  });

  const handlePick = (catKey: keyof typeof DEFAULT_CATEGORY_COLOR_MAP, token: CategoryColorToken) => {
    const next = { ...map, [catKey]: token };
    setMap(next);
    setSavedKey(catKey);
    update.mutate(next);
    setTimeout(() => setSavedKey((k) => (k === catKey ? null : k)), 1200);
  };

  return (
    <div>
      <h3 className="mb-1 font-calendar text-[0.68rem] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--sheet-accent, hsl(var(--muted-foreground)))' }}>Farger for kategorier</h3>
      <p className="text-sm text-muted-foreground mb-3">Velg hvordan dine kategorier vises i denne kalenderen.</p>
      <div className="space-y-3">
        {options.map((catKey) => {
          if (catKey === 'other') {
            return (
              <div key={catKey} className="flex items-center justify-between border-b py-3 opacity-70" style={{ borderColor: 'var(--sheet-rule, hsl(var(--border)))' }}>
                <span className="text-base font-medium">{t('cat.other')}</span>
                <span className="text-sm text-muted-foreground">Fast nøytral</span>
              </div>
            );
          }
          const meta = EVENT_CATEGORY_META[catKey];
          const Icon = meta.Icon;
          const selectedToken = map[catKey] ?? DEFAULT_CATEGORY_COLOR_MAP[catKey];
          const visuals = resolveCategoryVisuals(catKey, map);
          return (
            <div key={catKey} className="border-b py-3" style={{ borderColor: 'var(--sheet-rule, hsl(var(--border)))' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon size={16} strokeWidth={2.5} style={{ color: visuals.ink }} />
                  <span className="text-base font-medium">{resolveCategoryLabel(catKey, null, locale)}</span>
                </div>
                {savedKey === catKey && (
                  <span className="text-sm text-muted-foreground">Lagret ✓</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {COLOR_TOKEN_OPTIONS.map((token) => {
                  const isSelected = selectedToken === token;
                  return (
                    <button
                      key={token}
                      onClick={() => handlePick(catKey, token)}
                      aria-label={token}
                      className={`w-7 h-7 rounded-full transition-all ${
                        isSelected ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: getColorTokenSwatch(token) }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {update.isError && (
        <p className="text-destructive text-sm mt-2">Kunne ikke lagre farger</p>
      )}
    </div>
  );
};

export default CategoryColorSettings;
