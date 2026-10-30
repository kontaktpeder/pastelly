/**
 * Pastelly sheet motion standard (locked).
 *
 * Used by CenteredPopup for drag handoff, detent settle, and dismiss.
 * Tune here — not ad-hoc in components — so all sheets stay consistent.
 */

export type SheetSpringOpts = {
  stiffness?: number;
  damping?: number;
  mass?: number;
  restDelta?: number;
  restSpeed?: number;
};

/** Tiny body threshold only to separate scroll intent from sheet drag. Grabber is 0. */
export const BODY_ACTIVATE_PX = 2;
/** Tiny unfinished nudges only — soft return home. Larger moves use nearest + velocity. */
export const NUDGE_DEADZONE_PX = 16;
export const NUDGE_VEL = 350;
/** Cap leftover velocity when springing back to the same detent. */
export const SAME_DETENT_VEL_CAP = 260;
/** Dismiss fling threshold (px/s). */
export const DISMISS_VEL = 900;
/** Max raw handoff before animation scaling (px/s). */
export const HANDOFF_VEL_CAP = 1600;
/** Spring is driven softer than commit velocity — avoids mid-flight brake hitch. */
export const ANIM_VEL_SCALE = 0.28;
export const ANIM_VEL_CAP = 480;
/** Distance-based extra cap: |v| <= travel * this. */
export const ANIM_VEL_DIST_FACTOR = 2.2;
/** Fixed spring integration step (seconds). */
export const SPRING_DT = 1 / 120;
/** EMA blend for touch velocity (higher = trust latest sample more). */
export const VEL_EMA = 0.32;
/** Velocity projection bias when choosing nearest detent. */
export const COMMIT_PROJECT_SEC = 0.22;

/** Nested sheet recess (sheet under another sheet). Keep subtle — big jumps read as a glitch. */
export const NEST_RECESS_SCALE = 0.97;
export const NEST_RECESS_Y_PX = 8;
export const NEST_RECESS_MS = 380;
export const NEST_RECESS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** Detent settle — light bounce, stable mid-path */
export const DETENT_SPRING: SheetSpringOpts = {
  stiffness: 360,
  damping: 52,
  mass: 0.88,
  restDelta: 0.9,
  restSpeed: 22,
};

/** Enter / resize / return-home — softer, no fling */
export const SETTLE_SPRING: SheetSpringOpts = {
  stiffness: 340,
  damping: 50,
  mass: 0.92,
  restDelta: 0.9,
  restSpeed: 20,
};

/**
 * Continuity at finger → spring handoff.
 * Drop opposing velocity, scale down for animation (commit still uses raw vy).
 */
export function animationHandoffVelocity(from: number, to: number, vy: number): number {
  const travel = to - from;
  if (Math.abs(travel) < 0.5) return 0;
  const toward = Math.sign(travel);
  let v = vy;
  if (v !== 0 && Math.sign(v) !== toward) {
    v = 0;
  }
  v *= ANIM_VEL_SCALE;
  const distCap = Math.abs(travel) * ANIM_VEL_DIST_FACTOR;
  if (Math.abs(v) > distCap) v = toward * distCap;
  if (Math.abs(v) > ANIM_VEL_CAP) v = toward * ANIM_VEL_CAP;
  if (Math.abs(v) > HANDOFF_VEL_CAP) v = toward * HANDOFF_VEL_CAP;
  return v;
}

/** rAF spring with fixed timestep — same translate3d path as finger drag. */
export function runSheetSpring(options: {
  from: number;
  to: number;
  velocity?: number;
  spring?: SheetSpringOpts;
  onUpdate: (y: number) => void;
  onComplete?: () => void;
}): () => void {
  const {
    from,
    to,
    velocity = 0,
    spring = DETENT_SPRING,
    onUpdate,
    onComplete,
  } = options;
  const stiffness = spring.stiffness ?? DETENT_SPRING.stiffness!;
  const damping = spring.damping ?? DETENT_SPRING.damping!;
  const mass = spring.mass ?? DETENT_SPRING.mass!;
  const restDelta = spring.restDelta ?? DETENT_SPRING.restDelta!;
  const restSpeed = spring.restSpeed ?? DETENT_SPRING.restSpeed!;

  let y = from;
  let v = animationHandoffVelocity(from, to, velocity);
  let last = performance.now();
  let acc = 0;
  let raf = 0;
  let cancelled = false;

  onUpdate(from);

  const integrate = (dt: number) => {
    const force = -stiffness * (y - to) - damping * v;
    const accel = force / mass;
    v += accel * dt;
    y += v * dt;
  };

  const step = (now: number) => {
    if (cancelled) return;
    acc += Math.min(0.064, Math.max(0, (now - last) / 1000));
    last = now;

    let guard = 0;
    while (acc >= SPRING_DT && guard < 8) {
      integrate(SPRING_DT);
      acc -= SPRING_DT;
      guard += 1;
      if (Math.abs(v) < restSpeed && Math.abs(y - to) < restDelta) {
        onUpdate(to);
        onComplete?.();
        return;
      }
    }

    onUpdate(y);
    raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

/** Short day-sheet rest: 55% of the frame. Matches CenteredPopup's half detent. */
export const SHEET_HALF_VISIBLE = 0.55;

export type SheetDetent = 'half' | 'full';
export type SheetVariant = 'browse' | 'wizard' | 'compact';

/**
 * Named sheet roles — call sites pick a role, never raw detents/size/fitContent.
 * Keeps every sheet on the same motion path with consistent open height rules.
 */
export const SHEET_VARIANTS = {
  /** Peek + expand (day, event detail, profile, countdown detail, …). */
  browse: {
    size: 'sheet' as const,
    detents: ['half', 'full'] as const satisfies readonly SheetDetent[],
    initialDetent: 'half' as const satisfies SheetDetent,
    fitContent: true,
    nest: true,
    backdrop: 'solid' as const,
  },
  /** Full-height form flows (new/edit wizards). Keyboard-friendly. */
  wizard: {
    size: 'sheet' as const,
    detents: ['full'] as const satisfies readonly SheetDetent[],
    initialDetent: 'full' as const satisfies SheetDetent,
    fitContent: false,
    nest: true,
    backdrop: 'solid' as const,
  },
  /** Content-sized card, same grabber/dismiss/nest physics as sheets. */
  compact: {
    size: 'hug' as const,
    detents: ['full'] as const satisfies readonly SheetDetent[],
    initialDetent: 'full' as const satisfies SheetDetent,
    fitContent: false,
    nest: true,
    backdrop: 'none' as const,
  },
} as const;

/**
 * How far up a day sheet should open so `neededPx` of content is on screen.
 * Never shorter than half. Never taller than the frame — leftover content scrolls.
 * Returns the sheet's top offset (0 = full height).
 */
export function sheetYToReveal(
  frameH: number,
  neededPx: number,
  halfVisible = SHEET_HALF_VISIBLE,
): number {
  if (frameH <= 0) return 0;
  const halfY = Math.max(0, Math.round(frameH * (1 - halfVisible)));
  const fittedY = Math.max(0, frameH - Math.ceil(neededPx));
  return Math.min(halfY, fittedY);
}

/** Ease-out dismiss — smoother than a hard spring fling on long travel. */
export function runSheetEaseOut(options: {
  from: number;
  to: number;
  duration?: number;
  onUpdate: (y: number) => void;
  onComplete?: () => void;
}): () => void {
  const { from, to, onUpdate, onComplete } = options;
  const distance = Math.abs(to - from);
  const duration = options.duration ?? Math.min(0.45, Math.max(0.26, distance / 1800));
  const start = performance.now();
  let raf = 0;
  let cancelled = false;

  onUpdate(from);

  const step = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / (duration * 1000));
    // Quartic ease-out — softer landing than cubic
    const eased = 1 - (1 - t) ** 4;
    const y = from + (to - from) * eased;
    onUpdate(y);
    if (t >= 1) {
      onUpdate(to);
      onComplete?.();
      return;
    }
    raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}
