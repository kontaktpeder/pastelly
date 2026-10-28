import { useState } from 'react';
import { ChevronDown, Settings } from 'lucide-react';
import { calendarKindLabelLocalized, resolveCalendarKind } from '@/lib/calendarKinds';
import { useLocale } from '@/hooks/useLocale';
import type { CalendarMembership } from '@/hooks/useCurrentHouseholdContext';
import type { Household } from '@/hooks/useHousehold';

interface CalendarSwitcherProps {
  household: Household;
  memberships: CalendarMembership[];
  stackIndex?: number;
  onSelect: (householdId: string) => void;
  onOpenSettings: (householdId: string) => void;
}

const CalendarSwitcher = ({
  household,
  memberships,
  stackIndex = 0,
  onSelect,
  onOpenSettings,
}: CalendarSwitcherProps) => {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const canSwitch = memberships.length > 1;

  const homes = memberships.filter((m) => resolveCalendarKind(m.household) === 'home');
  const works = memberships.filter((m) => resolveCalendarKind(m.household) === 'work');

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex items-center gap-1 min-w-0">
        <button
          type="button"
          onClick={() => canSwitch && setOpen((v) => !v)}
          className={`flex items-center gap-2 min-w-0 max-w-full text-left ${
            canSwitch ? 'cursor-pointer' : 'cursor-default'
          }`}
          aria-expanded={canSwitch ? open : undefined}
          aria-haspopup={canSwitch ? 'listbox' : undefined}
        >
          {canSwitch && (
            <span className="flex items-center gap-1.5 shrink-0 self-center" aria-hidden>
              <span className="flex flex-col gap-1">
                {memberships.map((m, i) => (
                  <span
                    key={m.household_id}
                    className={`w-1.5 h-1.5 rounded-full ${
                      i === stackIndex ? 'bg-foreground/70' : 'bg-border'
                    }`}
                  />
                ))}
              </span>
              <ChevronDown
                size={16}
                strokeWidth={2.25}
                className={`text-muted-foreground transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
              />
            </span>
          )}
          <span className="min-w-0">
            <span className="block font-display text-lg font-extrabold tracking-tight truncate leading-tight">{household.name}</span>
            <span className="block font-display text-[10px] font-semibold text-muted-foreground leading-tight">
              {calendarKindLabelLocalized(household, t)}
            </span>
          </span>
        </button>

        {!canSwitch && (
          <button
            type="button"
            onClick={() => onOpenSettings(household.id)}
            aria-label={t('profile.settingsThis')}
            className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground/35 hover:text-muted-foreground/70 hover:bg-muted/50 transition-colors"
          >
            <Settings size={15} strokeWidth={2} />
          </button>
        )}
      </div>

      {open && canSwitch && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label={t('common.close')}
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-0 top-full mt-2 z-50 w-[min(100vw-2.5rem,18rem)] rounded-2xl border border-border bg-background shadow-lg p-2"
            role="listbox"
          >
            {homes.length > 0 && (
              <div className={works.length > 0 ? 'mb-1' : undefined}>
                {homes.map((m) => (
                  <SwitcherRow
                    key={m.household_id}
                    name={m.household.name}
                    active={m.household_id === household.id}
                    settingsLabel={t('profile.settingsThis')}
                    onSelect={() => {
                      onSelect(m.household_id);
                      setOpen(false);
                    }}
                    onSettings={() => {
                      setOpen(false);
                      onOpenSettings(m.household_id);
                    }}
                  />
                ))}
              </div>
            )}
            {works.length > 0 && (
              <div>
                {works.map((m) => (
                  <SwitcherRow
                    key={m.household_id}
                    name={m.household.name}
                    active={m.household_id === household.id}
                    settingsLabel={t('profile.settingsThis')}
                    onSelect={() => {
                      onSelect(m.household_id);
                      setOpen(false);
                    }}
                    onSettings={() => {
                      setOpen(false);
                      onOpenSettings(m.household_id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

function SwitcherRow({
  name,
  active,
  settingsLabel,
  onSelect,
  onSettings,
}: {
  name: string;
  active: boolean;
  settingsLabel: string;
  onSelect: () => void;
  onSettings: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={active}
      className={`flex items-center gap-0.5 rounded-xl ${
        active ? 'bg-primary/15' : 'hover:bg-muted'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`min-w-0 flex-1 text-left rounded-xl px-3 py-2.5 text-sm truncate transition-colors ${
          active ? 'font-semibold text-foreground' : 'text-foreground font-medium'
        }`}
      >
        {name}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSettings();
        }}
        aria-label={settingsLabel}
        className="shrink-0 flex items-center justify-center w-10 h-10 mr-0.5 rounded-xl text-muted-foreground/35 hover:text-muted-foreground/70 hover:bg-background/60 transition-colors"
      >
        <Settings size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

export default CalendarSwitcher;
