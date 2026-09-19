import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { KEYBOARD_PAD_TRANSITION } from '@/lib/motion';
import { blurSheetField } from '@/lib/focusSheetField';
import { lockSheetDismiss, unlockSheetDismiss } from '@/lib/sheetGate';
import {
  getNestDepth,
  getNestIndex,
  nestPop,
  nestPush,
  subscribeNest,
} from '@/lib/sheetNest';
import { scrollElementIntoContainer } from '@/lib/scrollFocusIntoView';
import {
  BODY_ACTIVATE_PX,
  COMMIT_PROJECT_SEC,
  DETENT_SPRING,
  DISMISS_VEL,
  NEST_RECESS_EASE,
  NEST_RECESS_MS,
  NEST_RECESS_SCALE,
  NEST_RECESS_Y_PX,
  NUDGE_DEADZONE_PX,
  NUDGE_VEL,
  SAME_DETENT_VEL_CAP,
  SETTLE_SPRING,
  VEL_EMA,
  runSheetEaseOut,
  runSheetSpring,
  type SheetSpringOpts,
} from '@/lib/sheetMotion';

export type SheetDetent = 'half' | 'full';

/** Extra scroll room so sticky footer + keyboard don't clip focused fields. */
const KEYBOARD_SCROLL_FOOTER_RESERVE = 128;

interface CenteredPopupProps {
  onClose: () => void;
  children: ReactNode;
  /**
   * hug — height follows content (small overlays)
   * sheet — viewport-tall card; use with detents for half/full
   */
  size?: 'hug' | 'sheet';
  /**
   * Snap points. Default `['full']` (wizards).
   * `['half','full']` = Ruter-style browse sheet (calendar peeks behind).
   */
  detents?: SheetDetent[];
  /** Where the sheet opens. Defaults to the largest detent. */
  initialDetent?: SheetDetent;
  className?: string;
  zClassName?: string;
  backdrop?: 'solid' | 'none';
  onExit?: () => void;
  /**
   * Participate in nested sheet stack (default: sheets yes, hug no).
   * Under-sheets recess and un-recess when a higher sheet dismisses.
   */
  nest?: boolean;
}

/** Visible fraction of the frame at each detent (full = flush to top inset). */
const DETENT_VISIBLE: Record<SheetDetent, number> = {
  full: 1,
  half: 0.55,
};

function getScrollEl(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  const marked = root.querySelector('[data-sheet-scroll]') as HTMLElement | null;
  if (marked) return marked;
  return root.querySelector('.overflow-y-auto, .overflow-y-scroll') as HTMLElement | null;
}

function yForDetent(detent: SheetDetent, frameH: number): number {
  const visible = DETENT_VISIBLE[detent];
  return Math.max(0, Math.round(frameH * (1 - visible)));
}

function normalizeDetents(detents: SheetDetent[]): SheetDetent[] {
  const set = new Set(detents);
  const ordered: SheetDetent[] = [];
  if (set.has('full')) ordered.push('full');
  if (set.has('half')) ordered.push('half');
  return ordered.length ? ordered : ['full'];
}

function writeSheetY(el: HTMLElement | null, y: number) {
  if (!el) return;
  el.style.transform = `translate3d(0, ${y}px, 0)`;
}

/** iOS-style rubber band for overscroll past an edge (overshoot in px). */
function rubber(overshoot: number, dimension = 200, constant = 0.55): number {
  const sign = Math.sign(overshoot);
  const x = Math.abs(overshoot);
  return sign * ((x * dimension * constant) / (dimension + constant * x));
}

/** Map raw drag Y through rubber at top (past full) and soft resistance past frame bottom. */
function resistDragY(raw: number, frameH: number): number {
  if (raw < 0) return rubber(raw);
  if (raw > frameH) return frameH + rubber(raw - frameH, 160, 0.4);
  return raw;
}

type GestureState = {
  pointerId: number;
  startY: number;
  lastY: number;
  lastAt: number;
  startDragY: number;
  velocityY: number;
  dragging: boolean;
  fromGrabber: boolean;
  scrollEl: HTMLElement | null;
};

/**
 * Bottom sheet: follows the finger, snaps to detents (half / full), or dismisses.
 * Finger + settle both write translate3d on rAF — no Framer on the motion path.
 */
const CenteredPopup = ({
  onClose,
  children,
  size = 'sheet',
  detents: detentsProp,
  initialDetent,
  className,
  zClassName = 'z-50',
  backdrop = 'solid',
  onExit,
  nest: nestProp,
}: CenteredPopupProps) => {
  const keyboardInset = useKeyboardInset();
  const keyboardOpen = keyboardInset > 24;
  const exit = onExit ?? onClose;
  const nestEnabled = nestProp ?? size === 'sheet';
  const cardRef = useRef<HTMLDivElement>(null);
  const sheetLayerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const detentRef = useRef<SheetDetent>('full');
  const canDragRef = useRef(true);
  const frameHRef = useRef(700);
  const multiDetentRef = useRef(false);
  const nestIdRef = useRef<number | null>(null);
  const yRef = useRef(
    typeof window !== 'undefined' ? window.innerHeight : 640,
  );
  const settleDragRef = useRef<(vy: number) => void>(() => {});
  const cancelSpringRef = useRef<(() => void) | null>(null);
  const animatingRef = useRef(false);

  const nestDepth = useSyncExternalStore(subscribeNest, getNestDepth, () => 0);

  const detents = normalizeDetents(detentsProp ?? ['full']);
  const multiDetent = detents.length > 1 && size === 'sheet';
  const startDetent: SheetDetent =
    initialDetent && detents.includes(initialDetent)
      ? initialDetent
      : detents.includes('half') && multiDetent
        ? 'half'
        : 'full';

  const [frameH, setFrameH] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 700,
  );

  const maxDim = backdrop === 'solid' ? (multiDetent ? 0.28 : 0.4) : 0;
  const [backdropOpen, setBackdropOpen] = useState(false);
  const [padReady, setPadReady] = useState(false);
  const [flyingOut, setFlyingOut] = useState(false);
  const flyingOutRef = useRef(false);
  const enteredRef = useRef(false);
  const dismissLockedRef = useRef(false);

  // Before paint so under-sheets recess in the same frame the cover appears.
  useLayoutEffect(() => {
    if (!nestEnabled) return;
    nestIdRef.current = nestPush();
    return () => {
      if (nestIdRef.current != null) {
        nestPop(nestIdRef.current);
        nestIdRef.current = null;
      }
    };
  }, [nestEnabled]);

  const releaseNest = () => {
    if (nestIdRef.current != null) {
      nestPop(nestIdRef.current);
      nestIdRef.current = null;
    }
  };

  const myNestIndex =
    nestIdRef.current != null ? getNestIndex(nestIdRef.current) : -1;
  const isRecessed =
    nestEnabled && myNestIndex >= 0 && nestDepth > myNestIndex + 1;

  // Grabber/body drag always allowed when not recessed; beginDrag blurs fields.
  const canDrag = !flyingOut && !isRecessed;
  canDragRef.current = canDrag;
  flyingOutRef.current = flyingOut;
  frameHRef.current = frameH;
  multiDetentRef.current = multiDetent;

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setPadReady(true);
      if (backdrop === 'solid') setBackdropOpen(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, [backdrop]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrameH(el.clientHeight || window.innerHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      cancelSpringRef.current?.();
      if (dismissLockedRef.current) {
        dismissLockedRef.current = false;
        unlockSheetDismiss();
      }
    };
  }, []);

  const setDragVisual = (on: boolean) => {
    const layer = sheetLayerRef.current;
    const card = cardRef.current;
    if (layer) {
      layer.style.willChange = on ? 'transform' : '';
    }
    if (card) {
      // Inline so React className re-renders can't put the shadow back mid-motion
      card.style.boxShadow = on ? 'none' : '';
    }
  };

  const setY = (y: number) => {
    yRef.current = y;
    writeSheetY(sheetLayerRef.current, y);
  };

  const stopSpring = () => {
    cancelSpringRef.current?.();
    cancelSpringRef.current = null;
    animatingRef.current = false;
  };

  const animateTo = (
    target: number,
    opts?: {
      velocity?: number;
      spring?: SheetSpringOpts;
      keepCompositor?: boolean;
      mode?: 'spring' | 'easeOut';
      onComplete?: () => void;
    },
  ) => {
    stopSpring();
    const keepCompositor = opts?.keepCompositor ?? false;
    if (keepCompositor) setDragVisual(true);
    animatingRef.current = true;

    const finish = () => {
      cancelSpringRef.current = null;
      animatingRef.current = false;
      setY(target);
      if (keepCompositor) setDragVisual(false);
      opts?.onComplete?.();
    };

    if (opts?.mode === 'easeOut') {
      cancelSpringRef.current = runSheetEaseOut({
        from: yRef.current,
        to: target,
        onUpdate: setY,
        onComplete: finish,
      });
      return;
    }

    cancelSpringRef.current = runSheetSpring({
      from: yRef.current,
      to: target,
      velocity: opts?.velocity ?? 0,
      spring: opts?.spring ?? DETENT_SPRING,
      onUpdate: setY,
      onComplete: finish,
    });
  };

  const snapTo = (
    detent: SheetDetent,
    opts?: { velocity?: number; spring?: SheetSpringOpts; keepCompositor?: boolean },
  ) => {
    detentRef.current = detent;
    const target = yForDetent(detent, frameHRef.current);
    animateTo(target, {
      velocity: opts?.velocity ?? 0,
      spring: opts?.spring ?? DETENT_SPRING,
      keepCompositor: opts?.keepCompositor ?? false,
    });
  };

  // Enter + keep detent aligned when frame height changes
  useEffect(() => {
    if (flyingOut || frameH <= 0) return;
    if (!enteredRef.current) {
      enteredRef.current = true;
      detentRef.current = startDetent;
      animateTo(yForDetent(startDetent, frameH), {
        spring: SETTLE_SPRING,
        keepCompositor: true,
      });
      return;
    }
    if (gestureRef.current?.dragging || animatingRef.current) return;
    const target = yForDetent(detentRef.current, frameH);
    if (Math.abs(yRef.current - target) < 6) return;
    animateTo(target, { spring: SETTLE_SPRING });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameH, flyingOut]);

  // Keyboard: expand to full so fields aren't clipped
  useEffect(() => {
    if (flyingOut || !enteredRef.current) return;
    if (!keyboardOpen) return;
    snapTo('full', { spring: SETTLE_SPRING, keepCompositor: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardOpen, flyingOut]);

  // Lift scroll room inside the sheet — do NOT pad the outer frame (that crushed flex-1).
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const pad = keyboardOpen
      ? `${Math.min(keyboardInset, Math.round(window.innerHeight * 0.5)) + KEYBOARD_SCROLL_FOOTER_RESERVE}px`
      : '';
    card.querySelectorAll<HTMLElement>('[data-sheet-scroll]').forEach((el) => {
      el.style.paddingBottom = pad;
    });
  }, [keyboardOpen, keyboardInset]);

  // Keep focused field visible above sticky footer + keyboard
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !keyboardOpen) return;
    const reserve = KEYBOARD_SCROLL_FOOTER_RESERVE;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches('input, textarea, select, [contenteditable="true"]')) return;
      window.setTimeout(() => scrollElementIntoContainer(target, { footerReserve: reserve }), 80);
      window.setTimeout(() => scrollElementIntoContainer(target, { footerReserve: reserve }), 280);
    };
    card.addEventListener('focusin', onFocusIn);
    return () => card.removeEventListener('focusin', onFocusIn);
  }, [keyboardOpen]);

  // Sheet: only safe-area on the frame. Keyboard lift is footer translate + scroll pad.
  // Hug: pad frame bottom so small cards sit above the keyboard.
  const framePad = {
    paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
    paddingLeft: 'env(safe-area-inset-left)',
    paddingRight: 'env(safe-area-inset-right)',
    paddingBottom:
      size !== 'sheet'
        ? keyboardOpen
          ? `${Math.min(keyboardInset, Math.round(window.innerHeight * 0.42))}px`
          : 'max(0.5rem, env(safe-area-inset-bottom))'
        : '0px',
    transition: padReady ? KEYBOARD_PAD_TRANSITION : undefined,
  };

  const flyOutThenDismiss = (_velocity = 0) => {
    if (flyingOutRef.current) return;
    flyingOutRef.current = true;
    setFlyingOut(true);
    setBackdropOpen(false);
    gestureRef.current = null;
    // Un-recess under-sheets now — parallel with fly-out, not after unmount.
    releaseNest();
    if (!dismissLockedRef.current) {
      dismissLockedRef.current = true;
      lockSheetDismiss();
    }
    const curY = yRef.current;
    const travel = Math.max(frameH * 1.05 - curY, frameH * 0.55);
    animateTo(curY + travel, {
      mode: 'easeOut',
      keepCompositor: true,
      onComplete: () => {
        if (dismissLockedRef.current) {
          dismissLockedRef.current = false;
          unlockSheetDismiss();
        }
        exit();
      },
    });
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !flyingOutRef.current) {
        event.preventDefault();
        flyOutThenDismiss();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settleDrag = (vy: number) => {
    if (flyingOut) return;
    const y = yRef.current;
    const h = frameHRef.current;
    const current = detentRef.current;
    const currentY = yForDetent(current, h);
    const deltaFromCurrent = y - currentY;

    const positions = detents
      .map((d) => ({ d, y: yForDetent(d, h) }))
      .sort((a, b) => a.y - b.y);

    const peekY = positions[positions.length - 1]?.y ?? 0;
    const dismissLine = peekY + Math.max(100, (h - peekY) * 0.35);

    if (y >= dismissLine || (vy >= DISMISS_VEL && y > peekY * 0.35)) {
      flyOutThenDismiss(vy);
      return;
    }

    // Only tiny unfinished nudges: ease back home without a fling.
    if (Math.abs(deltaFromCurrent) < NUDGE_DEADZONE_PX && Math.abs(vy) < NUDGE_VEL) {
      snapTo(current, {
        velocity: 0,
        spring: SETTLE_SPRING,
        keepCompositor: true,
      });
      return;
    }

    // Standard commit: nearest detent to velocity-projected position.
    const projected = y + vy * COMMIT_PROJECT_SEC;
    let best = positions[0]!;
    let bestDist = Math.abs(projected - best.y);
    for (const p of positions) {
      const dist = Math.abs(projected - p.y);
      if (dist < bestDist) {
        best = p;
        bestDist = dist;
      }
    }

    const returningHome = best.d === current;
    // Raw vy still used for commit (projection above); spring scales it in runSheetSpring.
    const settleVy = returningHome
      ? Math.max(-SAME_DETENT_VEL_CAP, Math.min(SAME_DETENT_VEL_CAP, vy * 0.35))
      : vy;

    snapTo(best.d, {
      velocity: settleVy,
      spring: returningHome ? SETTLE_SPRING : DETENT_SPRING,
      keepCompositor: true,
    });
  };
  settleDragRef.current = settleDrag;

  // Single gesture path: pointer → direct translate3d
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const beginDrag = (state: GestureState, clientY: number, timeStamp: number) => {
      // Release field focus so drag isn't gated / keyboard doesn't fight the gesture.
      blurSheetField();
      state.dragging = true;
      state.startY = clientY;
      state.lastY = clientY;
      state.lastAt = timeStamp;
      state.startDragY = yRef.current;
      stopSpring();
      setDragVisual(true);
      try {
        card.setPointerCapture(state.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (flyingOutRef.current || event.button !== 0) {
        gestureRef.current = null;
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) {
        gestureRef.current = null;
        return;
      }
      if (target.closest('[data-sheet-close]')) {
        gestureRef.current = null;
        return;
      }

      const fromGrabber = !!target.closest('[data-sheet-grabber]');
      // Grabber always starts drag (except fly-out). Body pull needs canDrag.
      if (!fromGrabber && !canDragRef.current) {
        gestureRef.current = null;
        return;
      }

      const state: GestureState = {
        pointerId: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        lastAt: event.timeStamp,
        startDragY: yRef.current,
        velocityY: 0,
        dragging: false,
        fromGrabber,
        scrollEl:
          (target.closest('[data-sheet-scroll]') as HTMLElement | null) ?? getScrollEl(card),
      };
      gestureRef.current = state;

      if (fromGrabber) {
        beginDrag(state, event.clientY, event.timeStamp);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const state = gestureRef.current;
      if (!state || event.pointerId !== state.pointerId) return;

      const dy = event.clientY - state.startY;

      if (!state.dragging) {
        // Body activate only when drag is allowed; grabber already began on down.
        if (!canDragRef.current) return;
        const scrollTop = state.scrollEl?.scrollTop ?? 0;
        const expandFromHalf =
          dy < -BODY_ACTIVATE_PX && multiDetentRef.current && detentRef.current !== 'full';
        const pullDownFromTop = dy > BODY_ACTIVATE_PX && scrollTop <= 1;
        if (!expandFromHalf && !pullDownFromTop) return;
        beginDrag(state, event.clientY, event.timeStamp);
      }

      const elapsed = Math.max(1, event.timeStamp - state.lastAt);
      const sample = ((event.clientY - state.lastY) / elapsed) * 1000;
      state.velocityY = state.velocityY * (1 - VEL_EMA) + sample * VEL_EMA;
      state.lastY = event.clientY;
      state.lastAt = event.timeStamp;

      const h = frameHRef.current;
      const raw = state.startDragY + event.clientY - state.startY;
      setY(resistDragY(raw, h));
    };

    const finishPointer = (event: PointerEvent) => {
      const state = gestureRef.current;
      if (!state || event.pointerId !== state.pointerId) return;
      gestureRef.current = null;
      if (state.dragging) {
        // Do NOT clear drag visual here — settle spring owns it until landed
        settleDragRef.current(state.velocityY);
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (gestureRef.current?.dragging) {
        event.preventDefault();
      }
    };

    card.addEventListener('pointerdown', onPointerDown);
    card.addEventListener('pointermove', onPointerMove);
    card.addEventListener('pointerup', finishPointer);
    card.addEventListener('pointercancel', finishPointer);
    card.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      card.removeEventListener('pointerdown', onPointerDown);
      card.removeEventListener('pointermove', onPointerMove);
      card.removeEventListener('pointerup', finishPointer);
      card.removeEventListener('pointercancel', finishPointer);
      card.removeEventListener('touchmove', onTouchMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useSheetLayout = size === 'sheet';
  const initialY = yRef.current;

  const recessTransform = isRecessed
    ? `translate3d(0, ${NEST_RECESS_Y_PX}px, 0) scale(${NEST_RECESS_SCALE})`
    : 'translate3d(0, 0, 0) scale(1)';

  return (
    <div
      className={cn(
        'fixed inset-0',
        zClassName,
        (flyingOut || isRecessed) && 'pointer-events-none',
      )}
      aria-hidden={isRecessed || undefined}
    >
      <div
        className="absolute inset-0 transition-opacity"
        style={{
          backgroundColor: backdrop === 'solid' ? 'hsl(var(--foreground))' : 'transparent',
          // Keep dim while nested so calendar doesn't flash when the cover flies out.
          opacity: backdrop === 'solid' && backdropOpen ? maxDim : 0,
          transitionDuration: flyingOut ? '240ms' : `${NEST_RECESS_MS}ms`,
          transitionTimingFunction: NEST_RECESS_EASE,
        }}
        onClick={flyingOut || isRecessed ? undefined : () => flyOutThenDismiss()}
        aria-hidden
      />

      <div
        ref={frameRef}
        className={cn(
          'absolute inset-0 flex justify-center pointer-events-none overflow-hidden',
          useSheetLayout ? 'items-stretch' : 'items-end',
        )}
        style={framePad}
      >
        <div
          ref={sheetLayerRef}
          className={cn(
            'relative z-10 flex w-full max-w-md min-h-0',
            !isRecessed && 'pointer-events-auto',
            useSheetLayout
              ? 'h-full max-h-full self-stretch md:max-w-xl'
              : 'h-auto max-h-[min(92dvh,100%)]',
          )}
          style={{ transform: `translate3d(0, ${initialY}px, 0)` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={cn(
              'flex min-h-0 w-full origin-top',
              useSheetLayout ? 'h-full' : 'h-auto max-h-full',
            )}
            style={{
              transform: recessTransform,
              // Instant recess (same frame as cover); ease only when returning.
              transition: isRecessed
                ? 'none'
                : `transform ${NEST_RECESS_MS}ms ${NEST_RECESS_EASE}`,
              willChange: isRecessed ? 'transform' : undefined,
            }}
          >
            <div
              ref={cardRef}
              role="dialog"
              aria-modal={!isRecessed}
              className={cn(
                'relative flex min-h-0 w-full flex-col overflow-hidden bg-background shadow-soft-lg',
                'rounded-t-[1.25rem] rounded-b-none',
                useSheetLayout ? 'h-full' : 'h-auto max-h-full',
                className,
              )}
            >
              <div
                data-sheet-grabber
                className="relative z-30 flex shrink-0 items-center justify-between px-3 pt-1.5 pb-1"
                style={{ touchAction: 'none' }}
              >
                <div className="w-11" aria-hidden />
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center py-3 touch-none cursor-grab active:cursor-grabbing"
                  aria-label="Dra sheet"
                  tabIndex={-1}
                >
                  <span className="block h-1.5 w-12 rounded-full bg-muted-foreground/40" />
                </button>
                <button
                  type="button"
                  data-sheet-close
                  onClick={(e) => {
                    e.stopPropagation();
                    flyOutThenDismiss();
                  }}
                  className="relative z-40 w-11 h-11 flex items-center justify-center rounded-full bg-muted/90 text-muted-foreground"
                  aria-label="Lukk"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CenteredPopup;
