import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { useLocale } from '@/hooks/useLocale';
import CenteredPopup from '@/components/CenteredPopup';
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
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`inline-flex max-w-full items-center gap-1 text-left font-medium text-[#0B4A5C] underline decoration-[#4EB8C8] decoration-2 underline-offset-2 ${className ?? ''}`}
      >
        <MapPin size={12} strokeWidth={2.25} className="shrink-0 text-[#4EB8C8]" aria-hidden />
        <span className="min-w-0 break-words">{label}</span>
      </button>
      {open && (
        <CenteredPopup
          onClose={() => setOpen(false)}
          onExit={() => setOpen(false)}
          size="hug"
          zClassName="z-[90]"
        >
          <div className="px-4 pb-5 pt-1">
            <p className="px-1 text-sm font-semibold text-[#0B4A5C]">{label}</p>
            <p className="px-1 pb-3 pt-1 text-xs text-muted-foreground">{t('event.openInMaps')}</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  void openExternalUrl(urls.google);
                  setOpen(false);
                }}
                className="w-full rounded-2xl bg-cyan-100 px-4 py-3.5 text-left text-sm font-semibold text-[#0B4A5C]"
              >
                {t('event.googleMaps')}
              </button>
              <button
                type="button"
                onClick={() => {
                  void openExternalUrl(urls.apple);
                  setOpen(false);
                }}
                className="w-full rounded-2xl bg-cyan-50 px-4 py-3.5 text-left text-sm font-semibold text-[#0B4A5C]"
              >
                {t('event.appleMaps')}
              </button>
            </div>
          </div>
        </CenteredPopup>
      )}
    </>
  );
}

export default EventAddressLink;
