/**
 * Route geometry.
 *
 * The route is one cubic, written in a unit square, so it can be mapped into the
 * scene band at any frame size. The control points are mapped with it, so the
 * curve the route follows is the same curve at every ratio.
 *
 * Nothing here reads the DOM. A clip has to draw the same frame in a preview and
 * in an export, so the point and the tangent come from the cubic's own algebra
 * rather than `getPointAtLength`.
 */

export type Pt = { x: number; y: number };
export type Cubic = { p0: Pt; c1: Pt; c2: Pt; p1: Pt };

/** Kaduna on the left and low, Jos on the right and high, met by one sweep. */
export const ROUTE: Cubic = {
  p0: { x: 0.06, y: 0.74 },
  c1: { x: 0.34, y: 0.94 },
  c2: { x: 0.66, y: 0.1 },
  p1: { x: 0.94, y: 0.3 },
};

export function cubicPoint(cubic: Cubic, s: number): Pt {
  const m = 1 - s;
  const a = m * m * m;
  const b = 3 * m * m * s;
  const d = 3 * m * s * s;
  const e = s * s * s;
  return {
    x: a * cubic.p0.x + b * cubic.c1.x + d * cubic.c2.x + e * cubic.p1.x,
    y: a * cubic.p0.y + b * cubic.c1.y + d * cubic.c2.y + e * cubic.p1.y,
  };
}

/** The direction of travel along the route, in degrees clockwise from the x axis. */
export function cubicAngle(cubic: Cubic, s: number): number {
  const m = 1 - s;
  const a = 3 * m * m;
  const b = 6 * m * s;
  const d = 3 * s * s;
  const dx = a * (cubic.c1.x - cubic.p0.x) + b * (cubic.c2.x - cubic.c1.x) + d * (cubic.p1.x - cubic.c2.x);
  const dy = a * (cubic.c1.y - cubic.p0.y) + b * (cubic.c2.y - cubic.c1.y) + d * (cubic.p1.y - cubic.c2.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** The route with every point put through `map`. An affine map keeps it a cubic. */
export function mapCubic(cubic: Cubic, map: (point: Pt) => Pt): Cubic {
  return { p0: map(cubic.p0), c1: map(cubic.c1), c2: map(cubic.c2), p1: map(cubic.p1) };
}

/** The same route, walked the other way. */
export function reverseCubic(cubic: Cubic): Cubic {
  return { p0: cubic.p1, c1: cubic.c2, c2: cubic.c1, p1: cubic.p0 };
}

/** The two halves of a cubic, split at `s`. */
export function splitCubic(cubic: Cubic, s: number): [Cubic, Cubic] {
  const at = (from: Pt, to: Pt): Pt => ({
    x: from.x + (to.x - from.x) * s,
    y: from.y + (to.y - from.y) * s,
  });
  const a = at(cubic.p0, cubic.c1);
  const b = at(cubic.c1, cubic.c2);
  const d = at(cubic.c2, cubic.p1);
  const e = at(a, b);
  const f = at(b, d);
  const mid = at(e, f);
  return [
    { p0: cubic.p0, c1: a, c2: e, p1: mid },
    { p0: mid, c1: f, c2: d, p1: cubic.p1 },
  ];
}

/** A cubic as a path description. */
export function cubicD(cubic: Cubic): string {
  return `M ${cubic.p0.x} ${cubic.p0.y} C ${cubic.c1.x} ${cubic.c1.y}, ${cubic.c2.x} ${cubic.c2.y}, ${cubic.p1.x} ${cubic.p1.y}`;
}
