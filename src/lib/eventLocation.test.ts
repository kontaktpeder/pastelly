import { describe, expect, it } from 'vitest';
import { googleMapsSearchUrl, mapsUrlsForLocation } from './eventLocation';

describe('event address maps links', () => {
  it('turns a street address into Google and Apple search URLs', () => {
    const urls = mapsUrlsForLocation('Carrer de la Mar 12, Palma');
    expect(urls.google).toContain('google.com/maps/search');
    expect(urls.google).toContain(encodeURIComponent('Carrer de la Mar 12, Palma'));
    expect(urls.apple).toContain('maps.apple.com/?q=');
    expect(urls.label).toBe('Carrer de la Mar 12, Palma');
  });

  it('keeps a Google Maps link and prefers its q= for Apple Maps', () => {
    const urls = mapsUrlsForLocation(
      'https://www.google.com/maps/search/?api=1&query=Hotel%20Playa',
    );
    expect(urls.google).toContain('google.com/maps');
    expect(urls.apple).toContain(encodeURIComponent('Hotel Playa'));
    expect(urls.label).toBe('Hotel Playa');
  });

  it('opens Google Maps search from a typed query', () => {
    expect(googleMapsSearchUrl('Palma harbour')).toContain('query=Palma%20harbour');
  });
});
