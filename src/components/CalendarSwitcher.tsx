import { useState } from 'react';
import { BriefcaseBusiness, ChevronDown, Home, Settings, UserRound } from 'lucide-react';
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
  onOpenAccount: () => void;
}

const CalendarSwitcher = ({
  household,
  memberships,
  stackIndex = 0,
  onSelect,
  onOpenSettings,
  onOpenAccount,
}: CalendarSwitcherProps) => {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const canSwitch = memberships.length > 1;
  const kind = resolveCalendarKind(household);
  const KindIcon = kind === 'work' ? BriefcaseBusiness : Home;
  const kindLabel = calendarKindLabelLocalized(household, t);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 shrink-0 cursor-pointer"
        aria-label={kindLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
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
        <span className="flex h-9 w-9 items-center justify-center rounded-xl text-foreground/80">
          <KindIcon size={22} strokeWidth={2.25} aria-hidden />
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label={t('common.close')}
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-full mt-2 z-50 w-[min(100vw-2.5rem,18rem)] rounded-2xl border border-border bg-background shadow-lg p-2"
            role="listbox"
          >
            {memberships.map((m) => {
              const rowKind = resolveCalendarKind(m.household);
              const RowIcon = rowKind === 'work' ? BriefcaseBusiness : Home;
              return (
                <SwitcherRow
                  key={m.household_id}
                  name={m.household.name}
                  kindLabel={calendarKindLabelLocalized(m.household, t)}
                  Icon={RowIcon}
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
              );
            })}
            <div className="my-1.5 border-t border-border/70" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenAccount();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <UserRound size={18} strokeWidth={2.2} className="shrink-0 opacity-70" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate">{t('profile.account')}</span>
                <span className="block text-[11px] text-muted-foreground">{t('profile.accountHint')}</span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

function SwitcherRow({
  name,
  kindLabel,
  Icon,
  active,
  settingsLabel,
  onSelect,
  onSettings,
}: {
  name: string;
  kindLabel: string;
  Icon: typeof Home;
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
        className={`min-w-0 flex-1 text-left rounded-xl px-3 py-2.5 transition-colors ${
          active ? 'font-semibold text-foreground' : 'text-foreground font-medium'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon size={18} strokeWidth={2.2} className="shrink-0 opacity-70" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-sm">{name}</span>
            <span className="block text-[11px] text-muted-foreground">{kindLabel}</span>
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSettings();
        }}
        aria-label={settingsLabel}
        className="shrink-0 flex items-center justify-center w-10 h-10 mr-0.5 rounded-xl text-muted-foreground/50 hover:text-muted-foreground hover:bg-background/60 transition-colors"
      >
        <Settings size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

export default CalendarSwitcher;
