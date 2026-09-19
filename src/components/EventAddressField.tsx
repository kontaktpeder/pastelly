import { useLocale } from '@/hooks/useLocale';
import { googleMapsSearchUrl, openExternalUrl } from '@/lib/eventLocation';
import { scrollFocusIntoView } from '@/lib/scrollFocusIntoView';
import type { Ref } from 'react';

const FIELD =
  'min-w-0 box-border appearance-none rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary';

interface EventAddressFieldProps {
  value: string;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}

const EventAddressField = ({ value, onChange, inputRef, className }: EventAddressFieldProps) => {
  const { t } = useLocale();
  return (
    <div className={className}>
      <label className="text-sm font-medium mb-1 block">{t('event.address')}</label>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('event.addressPlaceholder')}
        autoComplete="street-address"
        onFocus={scrollFocusIntoView}
        className={`w-full ${FIELD}`}
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t('event.addressHint')}</p>
        <button
          type="button"
          onClick={() => void openExternalUrl(googleMapsSearchUrl(value))}
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-2"
        >
          {t('event.findInGoogleMaps')}
        </button>
      </div>
    </div>
  );
};

export default EventAddressField;
