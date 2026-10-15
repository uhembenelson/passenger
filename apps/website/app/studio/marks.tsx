import React from "react";
import { clamp01 } from "./motion";

/**
 * The hairline marks the film is drawn from.
 *
 * One rounded stroke, no fills that are not plate, and a single bright mark where
 * a mark is about one thing. Colours are literal, not theme tokens: a frame has to
 * render the same pixels in the preview, in an export, and on a machine with no
 * theme.
 *
 * Everything is drawn in the frame's own pixels, scaled by a unit derived from the
 * frame, so a mark holds its share of the scene at any ratio.
 */

export const SET = "#FBFBF9";
export const PLATE = "#F0F3ED";
export const INK = "#1F2937";
export const TEXT = "#2D362F";
export const CREASE = "#A7B0BA";
export const QUIET = "#D5DAD7";
export const ACCENT = "#34D186";
export const ACCENT_TEXT = "#175C38";
export const ACCENT_SOFT = "#EAF5F0";

const FACE = "#FFFFFF";

/** The route, drawn as far along its own length as `progress`. */
export function RouteLine({
  d,
  width,
  color,
  progress = 1,
  dash,
  phase = 0,
  opacity = 1,
}: {
  d: string;
  width: number;
  color: string;
  progress?: number;
  dash?: string;
  /** Shifts a dashed line along itself, so a dash can march. */
  phase?: number;
  opacity?: number;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={dash ?? "1"}
      strokeDashoffset={dash ? -phase : 1 - clamp01(progress)}
      pathLength={dash ? undefined : 1}
      opacity={opacity}
    />
  );
}

/** How much of the route the travelling highlight covers. */
const GLINT = 0.18;

/**
 * A bright length of the route that runs from one end to the other. Used at a beat
 * change, so the road itself carries the film from one part to the next.
 */
export function RouteGlint({
  d,
  u,
  phase,
  width = 10,
  color = ACCENT,
  opacity = 0.5,
}: {
  d: string;
  u: number;
  /** 0 at the start of the route, 1 at the end; past 1 the highlight has left. */
  phase: number;
  width?: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width * u}
      strokeLinecap="round"
      pathLength={1}
      strokeDasharray={`${GLINT} ${1 - GLINT}`}
      strokeDashoffset={GLINT - clamp01(phase) * (1 + GLINT)}
      opacity={opacity}
    />
  );
}

/** A line of ink inside a mark, revealed left to right. */
export function InkLine({
  d,
  width,
  color,
  progress,
}: {
  d: string;
  width: number;
  color: string;
  progress: number;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray="1"
      strokeDashoffset={1 - clamp01(progress)}
      pathLength={1}
    />
  );
}

/** A stop on the route. The bright core says the stop is lit. */
export function NodeDot({ x, y, u, lit = false }: { x: number; y: number; u: number; lit?: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r={11 * u} fill={SET} stroke={INK} strokeWidth={2.4 * u} />
      <circle cx={x} cy={y} r={3.4 * u} fill={lit ? ACCENT : INK} />
    </g>
  );
}

/** A ring going out from a place, for a moment worth noticing. */
export function PulseRing({
  x,
  y,
  u,
  progress,
  color = ACCENT,
  from = 12,
  to = 76,
  opacity = 0.55,
}: {
  x: number;
  y: number;
  u: number;
  progress: number;
  color?: string;
  from?: number;
  to?: number;
  opacity?: number;
}) {
  const p = clamp01(progress);
  if (progress <= 0 || progress >= 1) return null;
  return (
    <circle
      cx={x}
      cy={y}
      r={(from + (to - from) * p) * u}
      fill="none"
      stroke={color}
      strokeWidth={1.7 * u}
      opacity={opacity * (1 - p)}
    />
  );
}

/**
 * A traveller: one stroke for the silhouette, a crease for the collar, a case held
 * low, and the brand's badge as the one bright mark. The origin is between the feet.
 */
export function TravellerMark({
  x,
  y,
  u,
  scale = 1,
  lit = false,
  opacity = 1,
}: {
  x: number;
  y: number;
  u: number;
  scale?: number;
  lit?: boolean;
  opacity?: number;
}) {
  const s = u * scale;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={opacity}>
      <rect x={26} y={-48} width={26} height={24} rx={5} fill={SET} stroke={CREASE} strokeWidth={2.4} />
      <path d="M 33 -48 Q 39 -58, 45 -48" fill="none" stroke={CREASE} strokeWidth={2.4} strokeLinecap="round" />
      <path
        d="M -24 -74 C -24 -92, -12 -99, 0 -99 C 12 -99, 24 -92, 24 -74 L 22 -10 Q 22 -6, 17 -6 L -17 -6 Q -22 -6, -22 -10 Z"
        fill={SET}
        stroke={INK}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path
        d="M -14 -80 C -14 -90, -6 -94, 0 -94 C 6 -94, 14 -90, 14 -80"
        fill="none"
        stroke={CREASE}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <circle cx={0} cy={-112} r={15} fill={SET} stroke={INK} strokeWidth={3} />
      <circle cx={20} cy={-86} r={9.5} fill={lit ? ACCENT : SET} stroke={lit ? SET : CREASE} strokeWidth={2.5} />
      <path
        d="M 16.4 -86 L 18.8 -83.6 L 23.8 -88.6"
        fill="none"
        stroke={lit ? FACE : CREASE}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** A parcel: a sealed box, a crease for the seam, and a bright seal. */
export function ParcelMark({
  x,
  y,
  u,
  scale = 1,
  tilt = 0,
  opacity = 1,
}: {
  x: number;
  y: number;
  u: number;
  scale?: number;
  tilt?: number;
  opacity?: number;
}) {
  const s = u * scale;
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${s})`} opacity={opacity}>
      <rect x={-30} y={-23} width={60} height={46} rx={9} fill={PLATE} stroke={INK} strokeWidth={3} />
      <path d="M -30 -8 H 30" fill="none" stroke={CREASE} strokeWidth={2} />
      <path d="M -18 6 H 2" fill="none" stroke={CREASE} strokeWidth={2} strokeLinecap="round" />
      <path d="M -18 16 H -6" fill="none" stroke={CREASE} strokeWidth={2} strokeLinecap="round" />
      <circle cx={21} cy={-15} r={4} fill={ACCENT} />
    </g>
  );
}

/**
 * A post: a card with a bright avatar and three lines of writing. The lines draw
 * themselves in, so a frame shows how far the writing has got.
 */
export function MessageCard({
  x,
  y,
  u,
  scale = 1,
  lines,
  pulse = 1,
  opacity = 1,
}: {
  x: number;
  y: number;
  u: number;
  scale?: number;
  /** How far each line of writing has drawn, 0 to 1. */
  lines: [number, number, number];
  /** A breath on the avatar, so the card is alive while it waits. */
  pulse?: number;
  opacity?: number;
}) {
  const s = u * scale;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={opacity}>
      <rect x={-132} y={-86} width={264} height={172} rx={30} fill={SET} stroke={INK} strokeWidth={3} />
      <g transform={`translate(-98 -48) scale(${pulse})`}>
        <circle r={13} fill={ACCENT} />
      </g>
      <InkLine d="M -74 -48 H 24" width={2.4} color={CREASE} progress={lines[0]} />
      <InkLine d="M -98 -6 H 62" width={2.4} color={CREASE} progress={lines[1]} />
      <InkLine d="M -98 28 H 4" width={2.4} color={CREASE} progress={lines[2]} />
    </g>
  );
}

/** A parcel handed over, signed for: the one bright disc that closes the film. */
export function CheckDot({ x, y, u, progress }: { x: number; y: number; u: number; progress: number }) {
  const p = clamp01(progress);
  return (
    <g transform={`translate(${x} ${y}) scale(${0.7 + 0.3 * p})`} opacity={p}>
      <circle r={15 * u} fill={ACCENT} stroke={SET} strokeWidth={3 * u} />
      <path
        d={`M ${-6.4 * u} 0 L ${-1.6 * u} ${4.8 * u} L ${7.2 * u} ${-4.8 * u}`}
        fill="none"
        stroke={FACE}
        strokeWidth={3.2 * u}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1"
        strokeDashoffset={1 - p}
        pathLength={1}
      />
    </g>
  );
}

/** A name a place goes by, in the chip language the site already uses. */
export function Chip({
  x,
  y,
  u,
  tone = "quiet",
  opacity = 1,
  children,
}: {
  x: number;
  y: number;
  u: number;
  tone?: "quiet" | "accent";
  opacity?: number;
  children: React.ReactNode;
}) {
  const accent = tone === "accent";
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        padding: `${7 * u}px ${16 * u}px`,
        borderRadius: 999,
        background: accent ? ACCENT_SOFT : SET,
        border: `${1.4 * u}px solid ${accent ? ACCENT : QUIET}`,
        color: accent ? ACCENT_TEXT : INK,
        fontSize: 22 * u,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
        opacity,
      }}
    >
      {children}
    </div>
  );
}
