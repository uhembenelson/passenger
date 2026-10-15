import type { ComponentType } from "react";
import { FILM } from "./film";
import { during, EASE } from "./motion";

/**
 * Clips are built here, in code, and the studio only previews them.
 *
 * A clip is a pure function of time: given `t` in seconds, and the frame's own
 * size, it draws one frame and nothing else — no CSS transitions, no timers, no
 * internal state. The preview runs it on the same frame grid an export would walk,
 * so a frame seen in the studio is the frame that would be captured.
 *
 * A clip is handed the frame's real pixel size and draws in those pixels, so one
 * clip can be previewed at any ratio without being letterboxed.
 */

export const FPS = 30;

export type Ratio = {
  id: string;
  name: string;
  width: number;
  height: number;
};

/** Frame sizes clips are previewed at. Every frame is at least 1080 on its short side. */
export const RATIOS: Ratio[] = [
  { id: "16-9", name: "16:9", width: 1920, height: 1080 },
  { id: "9-16", name: "9:16", width: 1080, height: 1920 },
  { id: "4-5", name: "4:5", width: 1080, height: 1350 },
  { id: "1-1", name: "1:1", width: 1080, height: 1080 },
];

export const DEFAULT_RATIO_ID = "16-9";

export function findRatio(id: string) {
  return RATIOS.find((ratio) => ratio.id === id) ?? RATIOS[0];
}

export function frameCount(duration: number) {
  return Math.max(1, Math.round(duration * FPS));
}

export type ClipProps = {
  /** Seconds into the clip, already quantized to the frame grid. */
  t: number;
  /** The frame's width in pixels, at the ratio being previewed. */
  width: number;
  /** The frame's height in pixels, at the ratio being previewed. */
  height: number;
};

export type Clip = {
  id: string;
  name: string;
  /** Seconds. The studio rounds this to whole frames. */
  duration: number;
  /**
   * A track that starts with the clip and loops with it. Only the film has one:
   * the narration is recorded, and everything in the film is timed off it.
   */
  audio?: { src: string };
  Frame: ComponentType<ClipProps>;
};

/** The short side every size in a clip is measured against. */
const REFERENCE = 1080;

// ─── Words in ───────────────────────────────────────────────────────────────
// Colours inside a clip are literal, not theme tokens: a frame has to render the
// same pixels in the preview, in an export, and on a machine with no theme.

const LINE = "Good things move with people";
const WORDS = LINE.split(" ");

const LEAD_IN = 0.35;
const WORD_DURATION = 0.62;
const WORD_STAGGER = 0.14;
const TAIL = 0.9;

function wordProgress(t: number, index: number) {
  const at = LEAD_IN + index * WORD_STAGGER;
  return during(t, at, at + WORD_DURATION, EASE.settle);
}

function WordsInFrame({ t, width, height }: ClipProps) {
  const u = Math.min(width, height) / REFERENCE;
  const size = Math.min(width * 0.054, height * 0.16);
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-[#FAFAFC]"
      style={{ padding: `0 ${width * 0.083}px` }}
    >
      <p
        className="flex flex-wrap justify-center text-center font-semibold leading-[1.06] tracking-[-0.035em] text-[#2D362F]"
        style={{
          fontSize: size,
          gap: `${0.15 * size}px ${0.26 * size}px`,
          fontFamily: "var(--font-work-sans), ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {WORDS.map((word, index) => {
          const progress = wordProgress(t, index);
          return (
            <span
              key={`${word}-${index}`}
              className="inline-block"
              style={{
                opacity: progress,
                transform: `translateY(${(1 - progress) * 44 * u}px)`,
              }}
            >
              {word}
            </span>
          );
        })}
      </p>
    </div>
  );
}

export const CLIPS: Clip[] = [
  FILM,
  {
    id: "words-in",
    name: "Words in",
    duration: LEAD_IN + (WORDS.length - 1) * WORD_STAGGER + WORD_DURATION + TAIL,
    Frame: WordsInFrame,
  },
];
