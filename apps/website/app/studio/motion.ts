/**
 * Timing for clips.
 *
 * Everything here is a pure function: the same input always gives the same
 * number, so a frame rendered in the preview is the frame an export would get.
 * No springs, because a spring's position depends on how it was stepped; an
 * ease with a stated duration lands the same way every time.
 */

export function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

/**
 * A CSS `cubic-bezier` as a function, so a clip can use the same curves the site
 * does. Solves for the curve's own parameter by Newton, then reads y.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;
  const slopeX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;

  return (progress: number) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    let u = progress;
    for (let step = 0; step < 8; step += 1) {
      const error = sampleX(u) - progress;
      if (Math.abs(error) < 1e-6) return sampleY(u);
      const slope = slopeX(u);
      if (Math.abs(slope) < 1e-6) break;
      u -= error / slope;
    }
    return sampleY(clamp01(u));
  };
}

/**
 * The two clocks the drawing rules ask for. A discrete change — a word landing, a
 * mark arriving — gets a long ease-out. Anything that keeps moving — a mark
 * travelling a route — gets an ease that starts and ends soft.
 */
export const EASE = {
  settle: cubicBezier(0.32, 0.72, 0, 1),
  gliding: cubicBezier(0.65, 0, 0.35, 1),
  arrive: cubicBezier(0.22, 1, 0.36, 1),
};

/** How far `t` has travelled through the window `from` → `to`. */
export function during(t: number, from: number, to: number, ease = EASE.settle) {
  if (to === from) return t >= to ? 1 : 0;
  return ease(clamp01((t - from) / (to - from)));
}

/**
 * Type leads the voice by this much, so a word is most of the way into place as it
 * is said rather than after it.
 */
export const WORD_LEAD = 0.1;

/** How long a word takes to land once its moment comes. */
export const WORD_RISE = 0.42;
