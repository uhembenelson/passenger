/**
 * Where a clip puts things, at whatever size the frame is.
 *
 * A clip draws in the frame's own pixels, so the same clip fills a 16:9 frame and
 * a 9:16 one without letterboxing. Type and marks are sized from the frame's short
 * side, so the film holds the same share at every ratio; only the arrangement
 * changes — two columns where the frame is wide, two rows where it is tall.
 */

export type Box = { x: number; y: number; width: number; height: number };

export type Stage = {
  width: number;
  height: number;
  /** Marks and type are sized from this, so they read the same at any ratio. */
  u: number;
  /** True when the narration sits above the scene rather than beside it. */
  stacked: boolean;
  /** The band narration is set in. */
  narration: Box;
  /** The band the marks are drawn in. */
  scene: Box;
};

/** The short side every size is measured against. */
const REFERENCE = 1080;
const PAD = 72;
const GUTTER = 56;
/** At or above this width-to-height ratio a frame reads as landscape. */
const WIDE = 1.25;
/** How much of a tall frame the narration band takes. */
const NARRATION_SHARE = 0.35;

export function stageLayout(width: number, height: number): Stage {
  const u = Math.min(width, height) / REFERENCE;
  const pad = PAD * u;
  const gutter = GUTTER * u;
  const stacked = width / height < WIDE;

  if (stacked) {
    const narrationHeight = Math.round(height * NARRATION_SHARE);
    return {
      width,
      height,
      u,
      stacked,
      narration: { x: pad, y: pad, width: width - pad * 2, height: narrationHeight },
      scene: {
        x: pad,
        y: pad + narrationHeight + gutter,
        width: width - pad * 2,
        height: height - (pad + narrationHeight + gutter) - pad,
      },
    };
  }

  const column = Math.round(width * 0.4);
  return {
    width,
    height,
    u,
    stacked,
    narration: { x: pad, y: pad, width: column - pad - gutter / 2, height: height - pad * 2 },
    scene: {
      x: column + gutter / 2,
      y: pad,
      width: width - (column + gutter / 2) - pad,
      height: height - pad * 2,
    },
  };
}

/**
 * The largest type the band can hold at a stated weight. Both the width and the
 * height of the band set the ceiling — a wide, short band gets what fits its
 * height, a tall, narrow one what fits its width — so a line never runs off the
 * band at any ratio, and the words are as big as the ratio allows.
 */
export function typeSize(band: Box, u: number) {
  return Math.min(band.width / 9.3, band.height / 6.9, 72 * u);
}
