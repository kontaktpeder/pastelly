/** Matches the native splash background (capacitor.config.ts). */
const SPLASH_BG = '#FFF4F6';

const DOT_VARS = ['--member-rose', '--member-peach', '--member-lavender', '--member-blue'];

/**
 * Cold-start veil between the native splash and the first painted UI.
 * Fixed pastel frame — no scale, no gradient fade, no wordmark resize —
 * so Capacitor doesn't hitch or jump size while the calendar loads.
 */
const BootVeil = ({ revealing }: { revealing: boolean }) => {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[80] overflow-hidden"
      style={{
        backgroundColor: SPLASH_BG,
        backgroundImage:
          'radial-gradient(55% 42% at 16% 10%, hsl(340 62% 86% / 0.7), transparent 68%),' +
          'radial-gradient(48% 36% at 88% 16%, hsl(20 80% 86% / 0.62), transparent 70%),' +
          'radial-gradient(58% 46% at 82% 94%, hsl(220 60% 86% / 0.55), transparent 70%),' +
          'radial-gradient(52% 42% at 10% 92%, hsl(270 48% 88% / 0.55), transparent 70%)',
        opacity: revealing ? 0 : 1,
        transition: revealing ? 'opacity 280ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
      }}
      aria-hidden
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p
          className="font-extrabold tracking-tight"
          style={{
            color: 'hsl(340 18% 22%)',
            fontFamily: 'ui-rounded, Nunito, system-ui, sans-serif',
            fontSize: '2.25rem',
            lineHeight: 1,
          }}
        >
          Pastelly
        </p>
        <div className="mt-5 flex gap-2">
          {DOT_VARS.map((v) => (
            <span
              key={v}
              className="boot-dot h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: `hsl(var(${v}))` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default BootVeil;
