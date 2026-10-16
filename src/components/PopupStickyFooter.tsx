import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

interface PopupStickyFooterProps {
  children: ReactNode;
  className?: string;
}

/**
 * Footer pinned to the bottom of a CenteredPopup card.
 * Translates above the keyboard without shrinking the sheet frame
 * (frame keyboard padding was crushing flex-1 content).
 *
 * useKeyboardInset only reports a positive inset while an editable field is
 * focused, so Neste/CTAs stay at the sheet bottom on non-input steps (e.g. Kategori).
 */
const PopupStickyFooter = ({ children, className }: PopupStickyFooterProps) => {
  const keyboardInset = useKeyboardInset();
  const keyboardOpen = keyboardInset > 24;

  return (
    <div
      data-sheet-footer
      className={cn(
        'pointer-events-none absolute inset-x-0 z-20 px-5 pt-3 [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_textarea]:pointer-events-auto',
        keyboardOpen ? 'pb-3' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        className,
      )}
      style={{ bottom: keyboardOpen ? keyboardInset : 0 }}
    >
      {children}
    </div>
  );
};

export default PopupStickyFooter;
