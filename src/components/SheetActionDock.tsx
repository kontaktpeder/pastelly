import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

/** Untransformed popup root. Action buttons portal here so they do not ride the sheet. */
export type SheetDockValue = {
  root: HTMLElement | null;
  /** Nested cover is open — hide this sheet's actions so they don't show through. */
  hidden: boolean;
};

export const SheetDockContext = createContext<SheetDockValue>({
  root: null,
  hidden: false,
});

/**
 * Actions pinned to the bottom center of the screen while the sheet is open.
 * The sheet only changes height above this dock, so the buttons do not travel,
 * lag, or sit on a divider. On dismiss they follow the sheet via --sheet-dismiss-shift.
 */
const SheetActionDock = ({ children }: { children: ReactNode }) => {
  const { root, hidden } = useContext(SheetDockContext);
  const keyboardInset = useKeyboardInset();
  const keyboardOpen = keyboardInset > 24;

  if (!root || hidden) return null;

  return createPortal(
    <div
      data-sheet-dock
      className="pointer-events-none absolute inset-x-0 z-40 flex justify-center"
      style={{
        bottom: keyboardOpen ? keyboardInset : 0,
        transform: 'translate3d(0, var(--sheet-dismiss-shift, 0px), 0)',
        transition: 'none',
      }}
    >
      <div
        className={`pointer-events-auto flex w-full max-w-md flex-col items-center gap-2 bg-background px-5 md:max-w-xl ${
          keyboardOpen ? 'pb-3' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'
        }`}
      >
        {children}
      </div>
    </div>,
    root,
  );
};

export default SheetActionDock;
