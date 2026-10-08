import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { isNativePlatform } from '@/lib/native/platform';

/** Matches the native splash background (capacitor.config.ts). */
const SPLASH_BG = '#FFFFFF';

const DOT_VARS = ['--member-blue', '--member-peach', '--member-mint', '--member-rose'];

/**
 * Fast boots stay a clean cream veil; the brand only appears when boot takes
 * longer than this. Prevents the wordmark flashing in right before reveal.
 */
const BRAND_DELAY_MS = 550;

/**
 * Cold-start veil shown between the native splash and the first painted UI.
 * Same cream base as the splash so the hand-off is seamless; the wordmark and
 * pastel atmosphere fade in on top so the light screen never feels blank.
 */
const BootVeil = ({ revealing }: { revealing: boolean }) => {
  // Native launch already shows the Pastelly splash — keep the wordmark up so
  // the Capacitor/TestFlight mark never reappears between splash and UI.
  const [showBrand, setShowBrand] = useState(() => isNativePlatform());
  const revealingRef = useRef(revealing);
  revealingRef.current = revealing;

  useEffect(() => {
    if (isNativePlatform()) return;
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
      <>
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

        <div className="absolute inset-0 flex flex-col items-center justify-center">
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
      </>
    )}
  </motion.div>
  );
};

export default BootVeil;
