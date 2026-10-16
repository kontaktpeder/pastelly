import { SplashScreen } from '@capacitor/splash-screen';
import { isNativePlatform } from '@/lib/native/platform';

/**
 * Cold-start gate: keep the native splash up until the first meaningful UI
 * is painted (or the watchdog fires), then fade it out once.
 */
let settled = false;
let watchdog: number | null = null;

export function markAppReady() {
  if (settled) return;
  settled = true;
  if (watchdog != null) {
    window.clearTimeout(watchdog);
    watchdog = null;
  }
  if (!isNativePlatform()) return;
  // Slightly shorter than the in-app veil so splash is gone before veil hits 0
  // (avoids a black compositor gap when both layers clear on the same frame).
  void SplashScreen.hide({ fadeOutDuration: 180 }).catch(() => {
    /* already hidden / unsupported */
  });
}

/** Call from initNative so splash never sticks if ready never fires. */
export function armSplashWatchdog(ms = 4500) {
  if (!isNativePlatform() || settled) return;
  if (watchdog != null) window.clearTimeout(watchdog);
  watchdog = window.setTimeout(() => {
    watchdog = null;
    markAppReady();
  }, ms);
}
