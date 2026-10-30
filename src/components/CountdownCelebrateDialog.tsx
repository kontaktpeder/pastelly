import { useEffect } from 'react';
import CenteredPopup from '@/components/CenteredPopup';
import PopupStickyFooter from '@/components/PopupStickyFooter';
import { CountdownDigits } from '@/components/CountdownDigits';
import { burstConfetti } from '@/lib/celebrate';
import { getCountdownTheme } from '@/lib/countdownThemes';
import { useLocale } from '@/hooks/useLocale';

interface CountdownCelebrateDialogProps {
  title: string;
  body: string;
  emoji?: string | null;
  themeId?: string | null;
  targetAt?: string | null;
  onClose: () => void;
}

/** Celebration sheet — confetti + locked CenteredPopup motion. */
const CountdownCelebrateDialog = ({
  title,
  body,
  emoji,
  themeId,
  targetAt,
  onClose,
}: CountdownCelebrateDialogProps) => {
  const { t } = useLocale();
  const theme = getCountdownTheme(themeId);

  useEffect(() => {
    const id = window.setTimeout(
      () => burstConfetti({ colors: theme.confetti, count: 56 }),
      100,
    );
    return () => window.clearTimeout(id);
  }, [theme.confetti]);

  return (
    <CenteredPopup
      variant="browse"
      onClose={onClose}
      onExit={onClose}
      zClassName="z-[80]"
    >
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-touch px-5 pb-4 text-center"
        data-sheet-scroll
      >
        <p className="text-4xl mb-3 mt-2" aria-hidden>
          {emoji || '✨'}
        </p>
        <h2 id="countdown-celebrate-title" className="text-2xl font-bold tracking-tight mb-2">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">{body}</p>

        {targetAt ? (
          <div className="mb-2">
            <CountdownDigits targetAt={targetAt} themeId={themeId} compact />
          </div>
        ) : null}
      </div>

      <PopupStickyFooter>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl bg-green-200 text-green-900 py-3.5 font-semibold hover:bg-green-300 transition-colors"
        >
          {t('welcome.cta')}
        </button>
      </PopupStickyFooter>
    </CenteredPopup>
  );
};

export default CountdownCelebrateDialog;
