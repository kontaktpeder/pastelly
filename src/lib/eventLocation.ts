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

/** Visible label for an address or pasted Maps URL. */
export function addressDisplayLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const urls = mapsUrlsForLocation(trimmed);
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  if (urls.label && urls.label !== trimmed && !/^https?:\/\//i.test(urls.label)) return urls.label;
  return trimmed.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
}
