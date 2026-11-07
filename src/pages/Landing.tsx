import { Link } from 'react-router-dom';
import { useLocale } from '@/hooks/useLocale';

type LandingProps = {
  onGetStarted: () => void;
  onSignIn: () => void;
};

/** Static paint — no opacity enter (avoids flash under BootVeil / auth handoff). */
const Landing = ({ onGetStarted, onSignIn }: LandingProps) => {
  const { t, locale } = useLocale();
  const helpHref = locale === 'en' ? '/support' : '/hjelp';
  const privacyHref = locale === 'en' ? '/privacy' : '/personvern';

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 45% at 20% 15%, hsl(var(--member-rose) / 0.55), transparent 70%),' +
            'radial-gradient(55% 40% at 85% 25%, hsl(var(--member-peach) / 0.5), transparent 70%),' +
            'radial-gradient(65% 55% at 75% 90%, hsl(var(--calendar-accent) / 0.55), transparent 70%),' +
            'radial-gradient(60% 50% at 10% 95%, hsl(var(--member-lavender) / 0.55), transparent 70%)',
        }}
      />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-6 py-safe">
        <header className="flex items-center justify-between pt-6">
          <span className="font-display text-lg font-extrabold tracking-tight text-foreground">
            Pastelly
          </span>
          <button
            type="button"
            onClick={onSignIn}
            className="min-h-11 rounded-full px-4 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:text-foreground"
          >
            {t('landing.signIn')}
          </button>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center text-center">
          <h1 className="font-display text-[15vw] font-extrabold leading-[0.95] tracking-tight text-foreground sm:text-8xl">
            Pastelly
          </h1>

          <h2 className="mt-6 max-w-md font-display text-2xl font-semibold text-foreground/85 sm:text-3xl">
            {t('landing.headline')}
          </h2>

          <p className="mt-4 max-w-sm text-base text-muted-foreground sm:text-lg">
            {t('landing.subtitle')}
          </p>

          <div className="mt-10 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={onGetStarted}
              className="rounded-2xl bg-green-200 px-8 py-3.5 text-base font-semibold text-green-900 shadow-sm transition-transform active:scale-[0.98]"
            >
              {t('landing.start')}
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="min-h-11 px-3 text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {t('landing.hasAccount')}
            </button>
          </div>
        </section>

        <footer className="pb-6 pt-8 text-center text-xs text-muted-foreground/80">
          © {new Date().getFullYear()} Pastelly
          {' · '}
          <Link to={helpHref} className="underline underline-offset-2 hover:text-foreground">
            {t('landing.help')}
          </Link>
          {' · '}
          <Link to={privacyHref} className="underline underline-offset-2 hover:text-foreground">
            {t('landing.privacy')}
          </Link>
        </footer>
      </main>
    </div>
  );
};

export default Landing;
