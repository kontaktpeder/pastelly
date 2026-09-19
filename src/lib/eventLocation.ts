import { toast } from 'sonner';
import { Browser } from '@capacitor/browser';

export function mapsUrlsForLocation(raw: string): {
  google: string;
  apple: string;
  label: string;
} {
  const trimmed = raw.trim();
  let query = trimmed;
  let google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const q = u.searchParams.get('q') || u.searchParams.get('query') || u.searchParams.get('daddr');
      if (q) query = q;
      const host = u.hostname.toLowerCase();
      if (
        host.includes('google.') ||
        host.includes('goo.gl') ||
        host.includes('maps.app.goo') ||
        host.includes('maps.apple.')
      ) {
        google = trimmed;
      }
    } catch {
      /* keep search URL */
    }
  }
  return {
    google,
    apple: `https://maps.apple.com/?q=${encodeURIComponent(query)}`,
    label: query,
  };
}

export async function openExternalUrl(url: string) {
  try {
    await Browser.open({ url });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function googleMapsSearchUrl(query: string) {
  const q = query.trim();
  if (!q) return 'https://www.google.com/maps';
  if (/^https?:\/\//i.test(q)) return q;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function offerMapsChooser(
  location: string,
  labels: { title: string; google: string; apple: string },
) {
  const urls = mapsUrlsForLocation(location);
  toast(labels.title, {
    description: urls.label,
    duration: 9000,
    action: {
      label: labels.google,
      onClick: () => void openExternalUrl(urls.google),
    },
    cancel: {
      label: labels.apple,
      onClick: () => void openExternalUrl(urls.apple),
    },
  });
}
