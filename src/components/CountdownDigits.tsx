import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getCountdownRemaining, type CountdownRemaining } from '@/lib/countdownTime';
import { getCountdownTheme } from '@/lib/countdownThemes';
import { useLocale } from '@/hooks/useLocale';
import { formatVacationRange } from '@/lib/vacationMode';
import { getIntlLocale } from '@/lib/i18n';

export function useLiveRemaining(targetAt: string) {
  const [remaining, setRemaining] = useState(() => getCountdownRemaining(targetAt));
  useEffect(() => {
    const tick = () => setRemaining(getCountdownRemaining(targetAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [targetAt]);
  return remaining;
}

export function countdownUnitLabel(
  remaining: CountdownRemaining,
  t: (key: any) => string,
): { value: string; label: string } {
  if (remaining.isPast) {
    return { value: '🎉', label: t('countdown.itsTime') };
  }
  if (remaining.days > 0) {
    return {
      value: String(remaining.days),
      label: remaining.days === 1 ? t('countdown.dayLeft') : t('countdown.daysLeft'),
    };
  }
  if (remaining.hours > 0) {
    return { value: String(remaining.hours), label: t('countdown.hoursLeft') };
  }
  return { value: String(Math.max(remaining.minutes, 0)), label: t('countdown.minutesLeft') };
}

/** Large digit block used in profile + detail. */
export function CountdownDigits({
  targetAt,
  themeId,
  emoji,
  title,
  compact = false,
  endsAt,
  useVacationMode = false,
  timeZone,
}: {
  targetAt: string;
  themeId?: string | null;
  emoji?: string | null;
  title?: string;
  compact?: boolean;
  endsAt?: string | null;
  useVacationMode?: boolean;
  timeZone?: string | null;
}) {
  const { t, locale } = useLocale();
  const remaining = useLiveRemaining(targetAt);
  const theme = getCountdownTheme(themeId);
  const { value, label } = countdownUnitLabel(remaining, t);
  const untilLabel =
    remaining.isPast || !title
      ? label
      : remaining.days === 1
        ? t('countdown.dayUntilTitle', { title })
        : remaining.days > 0
          ? t('countdown.daysUntilTitle', { title })
          : label;

  const vacationRange =
    useVacationMode && endsAt
      ? formatVacationRange(new Date(targetAt), new Date(endsAt), getIntlLocale(locale), timeZone || undefined)
      : null;

  return (
    <div
      className={`rounded-[1.5rem] text-center overflow-hidden ${compact ? 'px-4 py-5' : 'px-5 py-7'}`}
      style={{ background: theme.gradient }}
    >
      {emoji ? (
        <p className={`${compact ? 'text-2xl' : 'text-3xl'} mb-1`} aria-hidden>
          {emoji}
        </p>
      ) : null}
      <motion.p
        key={value}
        initial={{ scale: 0.9, opacity: 0.7 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 24 }}
        className={`font-bold tracking-tight text-foreground/90 leading-none tabular-nums ${
          compact ? 'text-5xl' : 'text-7xl'
        }`}
      >
        {value}
      </motion.p>
      <p className={`mt-2 font-semibold ${theme.accentText} ${compact ? 'text-xs' : 'text-sm'}`}>
        {untilLabel}
      </p>
      {title && (remaining.isPast || remaining.days === 0) ? (
        <p className={`mt-2 font-bold text-foreground ${compact ? 'text-sm' : 'text-base'}`}>
          {title}
        </p>
      ) : null}
      {vacationRange && (
        <p className={`mt-2 font-medium text-foreground/80 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {t('countdown.autoVacationRange', { range: vacationRange })}
        </p>
      )}
      {!remaining.isPast && remaining.days === 0 && (
        <p className="text-xs text-foreground/60 mt-2 font-medium tabular-nums">
          {String(remaining.hours).padStart(2, '0')}:
          {String(remaining.minutes).padStart(2, '0')}:
          {String(remaining.seconds).padStart(2, '0')}
        </p>
      )}
    </div>
  );
}
