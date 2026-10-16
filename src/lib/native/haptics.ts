import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { isNativePlatform } from './platform';

const DOUBLE_GAP_MS = 80;

function webVibrate(pattern: number | number[]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(pattern);
}

/** Light tap — e.g. long-press recognized, or the new-event plus. */
export async function hapticLight(): Promise<void> {
  if (!isNativePlatform()) {
    webVibrate(12);
    return;
  }
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* simulator / unsupported */
  }
}

/** Two light taps — saved a new event, or finished an edit. */
export async function hapticDoubleLight(): Promise<void> {
  if (!isNativePlatform()) {
    webVibrate([12, DOUBLE_GAP_MS, 12]);
    return;
  }
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
    await new Promise((resolve) => window.setTimeout(resolve, DOUBLE_GAP_MS));
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* simulator / unsupported */
  }
}

/** Medium tap — slightly stronger confirmation. */
export async function hapticMedium(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    /* ignore */
  }
}
