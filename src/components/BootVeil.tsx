import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

/** Matches the native splash background (capacitor.config.ts). */
const SPLASH_BG = '#FFFFFF';

const DOT_VARS = ['--member-blue', '--member-peach', '--member-mint', '--member-rose'];

/**
 * Fast boots stay a clean white veil + icon; the wordmark only appears when
 * boot takes longer than this. Prevents the name flashing in right before reveal.
 */
const BRAND_DELAY_MS = 550;

/** Matches the native splash icon size (~160pt on a typical iPhone). */
const ICON_CLASS = 'h-32 w-32 rounded-[22.37%]';

/**
 * Cold-start veil shown between the native splash and the first painted UI.
 * Same white base + Pastelly icon as the splash so the hand-off is seamless;
 * the wordmark only fades in if boot takes longer than BRAND_DELAY_MS.
 */
const BootVeil = ({ revealing }: { revealing: boolean }) => {
  const [showBrand, setShowBrand] = useState(false);
  const revealingRef = useRef(revealing);
  revealingRef.current = revealing;

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!revealingRef.current) setShowBrand(true);
    }, BRAND_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-[80] pointer-events-none overflow-hidden"
      style={{ backgroundColor: SPLASH_BG }}
      initial={false}
      animate={{ opacity: revealing ? 0 : 1 }}
      transition={{ duration: 0.78, ease: [0.22, 1, 0.36, 1] }}
      aria-hidden
    >
      {showBrand && (
        <motion.div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(55% 40% at 18% 12%, hsl(340 55% 85% / 0.45), transparent 70%),' +
              'radial-gradient(50% 38% at 85% 20%, hsl(20 75% 85% / 0.4), transparent 70%),' +
              'radial-gradient(60% 50% at 80% 92%, hsl(220 55% 85% / 0.45), transparent 70%),' +
              'radial-gradient(55% 45% at 12% 92%, hsl(270 45% 85% / 0.45), transparent 70%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative flex flex-col items-center">
          <img
            src="/brand/app-icon.png"
            alt=""
            className={ICON_CLASS}
            draggable={false}
          />
          {showBrand && (
            <div className="absolute top-full mt-5 flex flex-col items-center">
              <motion.p
                className="font-display text-4xl font-extrabold tracking-tight"
                style={{ color: 'hsl(0 5% 17%)' }}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              >
                Pastelly
              </motion.p>

              <div className="mt-5 flex gap-2">
                {DOT_VARS.map((v, i) => (
                  <motion.span
                    key={v}
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: `hsl(var(${v}))` }}
                    initial={{ opacity: 0.3 }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1.4,
                      repeat: Infinity,
                      delay: 0.2 + i * 0.18,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default BootVeil;
