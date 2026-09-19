import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin } from 'lucide-react';
import { useLocale } from '@/hooks/useLocale';
import {
  addressDisplayLabel,
  mapsUrlsForLocation,
  openExternalUrl,
} from '@/lib/eventLocation';

export function EventAddressLink({
  location,
  className,
}: {
  location: string;
  className?: string;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const label = addressDisplayLabel(location);
  const urls = mapsUrlsForLocation(location);

  return (
    <>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`inline-flex max-w-full items-center gap-1 text-left font-medium text-[#0B4A5C] underline decoration-[#4EB8C8] decoration-2 underline-offset-2 ${className ?? ''}`}
      >
        <MapPin size={12} strokeWidth={2.25} className="shrink-0 text-[#4EB8C8]" aria-hidden />
        <span className="min-w-0 break-words">{label}</span>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-end justify-center px-3">
            <button
              type="button"
              className="absolute inset-0 bg-[#0B4A5C]/25"
              aria-label={t('common.close')}
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-sm rounded-2xl bg-white p-3 shadow-soft-lg"
              style={{ marginBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <p className="px-1 pb-2 text-sm font-semibold text-[#0B4A5C]">{label}</p>
              <p className="px-1 pb-3 text-xs text-muted-foreground">{t('event.openInMaps')}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void openExternalUrl(urls.google);
                    setOpen(false);
                  }}
                  className="rounded-2xl bg-cyan-100 px-3 py-3 text-sm font-semibold text-[#0B4A5C]"
                >
                  {t('event.googleMaps')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void openExternalUrl(urls.apple);
                    setOpen(false);
                  }}
                  className="rounded-2xl bg-cyan-50 px-3 py-3 text-sm font-semibold text-[#0B4A5C]"
                >
                  {t('event.appleMaps')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export default EventAddressLink;
