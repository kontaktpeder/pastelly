import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'no.studiopah.pastelly',
  appName: 'Pastelly',
  webDir: 'dist',
  ios: {
    // Web app owns safe-area via CSS — avoid double inset with env() padding
    contentInset: 'never',
    // Let OneSignal own APNs callbacks (required for reliable iOS registration)
    handleApplicationNotifications: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 3000,
      backgroundColor: '#FFF4F6',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#FFF4F6',
    },
    Keyboard: {
      // App manages sticky CTAs via useKeyboardInset — avoid WebView resize fighting padding.
      resize: 'none',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
