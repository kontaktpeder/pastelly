import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { armSplashWatchdog } from './appBoot';
import { isNativePlatform, isIOS } from './platform';
import { initDeepLinks } from './deepLinks';
import { initPush } from './push';

export async function initNative(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Light });
    // Draw under the status bar; CSS safe-area padding handles the inset once.
    await StatusBar.setOverlaysWebView({ overlay: true });
    if (!isIOS()) {
      await StatusBar.setBackgroundColor({ color: '#FFF4F6' });
    }
  } catch (err) {
    console.warn('StatusBar init failed', err);
  }

  try {
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch {
    /* not supported on android */
  }

  try {
    // Prevent iOS from scrolling the WebView/calendar when focusing inputs —
    // popups handle their own inner scroll + sticky CTAs.
    await Keyboard.setScroll({ isDisabled: true });
  } catch {
    /* older plugin / android */
  }

  await initDeepLinks();
  await initPush();

  // Splash stays until Index/Calendar call markAppReady() — or this watchdog.
  armSplashWatchdog(4500);
}
