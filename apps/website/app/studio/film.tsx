import React from "react";
import type { Clip, ClipProps } from "./clips";
import { cubicD, cubicPoint, mapCubic, reverseCubic, splitCubic, ROUTE, type Cubic, type Pt } from "./geometry";
import {
  ACCENT,
  ACCENT_TEXT,
  CheckDot,
  Chip,
  CREASE,
  INK,
  MessageCard,
  NodeDot,
  ParcelMark,
  PulseRing,
  QUIET,
  RouteGlint,
  RouteLine,
  SET,
  TEXT,
  TravellerMark,
} from "./marks";
import { clamp01, during, EASE, mix, WORD_LEAD, WORD_RISE } from "./motion";
import { stageLayout, typeSize, type Stage } from "./stage";
import { VOICE, type VoiceWord } from "./voice";

/**
 * A film made of six beats: a post, a trip, two strangers, a meeting, a handover,
 * and the line the film is for. The whole thing is a pure function of time, so a
 * frame seen in the studio is the frame an export would capture.
 *
 * The narration is recorded, and it is the clock. `voice.ts` holds when each word
 * is actually spoken, and every mark is keyed to those times — the post is written
 * as the post is read, the traveller leaves on the line that says someone is
 * already going, the two meet on the word "together". Nothing in a scene runs on a
 * clock of its own, and nothing is spread evenly to fill a beat.
 *
 * It is drawn in the frame's own pixels and sized from the frame's short side, so
 * the same film fills a 16:9 frame and a 9:16 one. Where the frame is wide the
 * narration sits beside the scene; where it is tall the narration sits above it.
 * Nothing is letterboxed and nothing runs off the frame at any of the four ratios.
 */

export const DURATION = VOICE.duration;

/**
 * Scenes cross-dissolve over this, and each one is pushed in as it arrives and
 * eased back as it leaves, so a beat change is a move rather than a blink.
 */
const SCENE_FADE = 0.85;
/** Type leaves over this, and arrives over `TYPE_FADE`. Never both at once. */
const TYPE_OUT = 0.55;
const TYPE_FADE = 0.22;

type Beat = {
  id: string;
  /** Seconds. Beats share a boundary: one starts where the one before it ends. */
  start: number;
  end: number;
  /** Words wrapped in `*` are the ones the beat turns on; they carry the accent. */
  lines: string[];
};

/**
 * The script, one entry per beat, matching `voiceover.py` line for line. The `*`
 * markers are for the type, not the voice: the recording is of the plain text.
 */
const SCRIPT = {
  post: [
    "Right now, someone is posting on *WhatsApp,*",
    "“Who is travelling from *Kaduna* to *Jos?*",
    "*I need to send something.”*",
  ],
  trip: ["And somewhere else, someone", "is already making that *exact trip.*"],
  strangers: ["They just do not *know* each other."],
  together: ["*Passenger* brings them *together.*"],
  exchange: [
    "One person sends with *less stress,*",
    "while the other *earns* from a trip",
    "they were *already* taking.",
  ],
  closing: [
    "That is the idea behind *Passenger.*",
    "Send it with someone",
    "*already going your way.*",
  ],
  launch: ["We are getting ready to *launch.*", "Join the waitlist at", "*usepassenger.com/waitlist*"],
} as const satisfies Record<string, readonly string[]>;

/** The beats, on the voice's clock: where the recording says they start and end. */
const BEATS: Beat[] = VOICE.beats.map((voice) => ({
  id: voice.id,
  start: voice.start,
  end: voice.end,
  lines: [...SCRIPT[voice.id]],
}));

/* ── Where the film puts things ─────────────────────────────────────────── */

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The route in the scene band's own pixels. */
function pixelRoute(stage: Stage, cubic: Cubic = ROUTE): Cubic {
  const box = stage.scene;
  return mapCubic(cubic, (p) => ({ x: box.x + p.x * box.width, y: box.y + p.y * box.height }));
}

/** A point on the route, given how far along the route it is. */
function onRoute(stage: Stage, s: number): Pt {
  return cubicPoint(pixelRoute(stage), s);
}

/** A point written in the unit square, in the scene band's own pixels. */
function inScene(stage: Stage, p: Pt): Pt {
  const box = stage.scene;
  return { x: box.x + p.x * box.width, y: box.y + p.y * box.height };
}

/** Marks stand on the route, so their feet go a little past it. */
const FOOT = 4;

/* ── The clock the words set ────────────────────────────────────────────── */

type Token = { word: string; em: boolean };
type Plan = {
  beat: Beat;
  /** Each line broken into the words that land, with the accented ones marked. */
  tokens: Token[][];
  /** When each word lands, per line. */
  lines: number[][];
  /** The same landings, flattened, for a scene that keys off "the last word". */
  words: number[];
};

/** A line, split on `*`, where the odd pieces are the words the beat turns on. */
function tokens(line: string): Token[] {
  return line.split("*").flatMap((part, index) =>
    part
      .split(" ")
      .filter((word) => word.length > 0)
      .map((word) => ({ word, em: index % 2 === 1 })),
  );
}

/**
 * When each word lands. The narration is already recorded, so these times come from
 * the recording rather than from an even division of the beat: a word lands when it
 * is spoken. Everything in a scene is timed off these numbers, so a beat can no
 * longer be read at a pace of its own choosing.
 */
function schedule(beat: Beat, heard: readonly VoiceWord[]): Plan {
  const block = beat.lines.map(tokens);
  const counts = block.map((line) => line.length);
  const scripted = counts.reduce((sum, count) => sum + count, 0);
  if (scripted !== heard.length) {
    throw new Error(
      `${beat.id}: the script has ${scripted} words, the voice has ${heard.length} — ` +
        "re-run apps/website/scripts/voiceover.py after editing the script",
    );
  }

  const lines: number[][] = [];
  const landings: number[] = [];
  let step = 0;

  counts.forEach((count) => {
    const line: number[] = [];
    for (let word = 0; word < count; word += 1) {
      const at = heard[step].t - WORD_LEAD;
      line.push(at);
      landings.push(at);
      step += 1;
    }
    lines.push(line);
  });

  return { beat, tokens: block, lines, words: landings };
}

/** The whole film's schedule, worked out once. */
const PLAN: Plan[] = BEATS.map((beat, index) => schedule(beat, VOICE.beats[index].words));

/** The moments the film changes part, where the road carries it across. */
const BOUNDARIES = BEATS.slice(1).map((beat) => beat.start);

/* ── The two clocks ─────────────────────────────────────────────────────── */

/**
 * Scenes cross-dissolve, so the map and the route never blink out between beats.
 * The two opacities sum to one at every moment. Each scene also arrives a little
 * large and leaves a little small, so the change has a direction.
 */
function sceneOpacity(t: number, beat: Beat, index: number) {
  const rise = index === 0 ? 1 : during(t, beat.start - SCENE_FADE, beat.start, EASE.gliding);
  const fall =
    index === BEATS.length - 1 ? 1 : 1 - during(t, beat.end - SCENE_FADE, beat.end, EASE.gliding);
  return rise * fall;
}

function sceneScale(t: number, beat: Beat, index: number) {
  const enter = index === 0 ? 1 : during(t, beat.start - SCENE_FADE, beat.start, EASE.gliding);
  const exit =
    index === BEATS.length - 1 ? 0 : during(t, beat.end - SCENE_FADE, beat.end, EASE.gliding);
  return mix(1.07, 1, enter) - 0.05 * exit;
}

/** Type hands over crisply: one beat's lines are out before the next beat's begin. */
function narrationOpacity(t: number, beat: Beat, index: number) {
  const rise = index === 0 ? 1 : during(t, beat.start, beat.start + TYPE_FADE, EASE.gliding);
  const fall =
    index === BEATS.length - 1 ? 1 : 1 - during(t, beat.end - TYPE_OUT, beat.end, EASE.gliding);
  return rise * fall;
}

/* ── Type ───────────────────────────────────────────────────────────────── */

/**
 * The narration, set word by word. Each word rises into place with a little scale
 * and turn, and clears its blur as it lands; each line slides up after the one
 * before it. The words a beat turns on are set in the accent colour with a hairline
 * drawn under them as they land, so the film's own mark language reaches into the
 * type.
 */
function Narration({
  plan,
  t,
  stage,
  opacity,
  exit,
}: {
  plan: Plan;
  t: number;
  stage: Stage;
  opacity: number;
  /** How far through its leave the block is, for the slide and the blur. */
  exit: number;
}) {
  const { lines, tokens: block } = plan;
  const size = typeSize(stage.narration, stage.u);

  return (
    <div
      style={{
        position: "absolute",
        left: stage.narration.x,
        top: stage.narration.y,
        width: stage.narration.width,
        height: stage.narration.height,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 0.34 * size,
        opacity,
        transform: `translateY(${-0.22 * size * exit}px)`,
        filter: exit > 0.02 && exit < 0.98 ? `blur(${exit * 5}px)` : undefined,
      }}
    >
      {block.map((line, lineIndex) => {
        const lineAt = lines[lineIndex][0];
        const lineIn = during(t, lineAt, lineAt + 0.6, EASE.arrive);
        return (
          <p
            key={lineIndex}
            style={{
              margin: 0,
              color: TEXT,
              fontSize: size,
              fontWeight: 600,
              lineHeight: 1.16,
              letterSpacing: "-0.02em",
              opacity: lineIn,
              transform: `translateY(${(1 - lineIn) * 0.5 * size}px)`,
            }}
          >
            {line.map((token, wordIndex) => {
              const at = lines[lineIndex][wordIndex];
              const rise = during(t, at, at + WORD_RISE, EASE.settle);
              const scale = token.em
                ? rise < 0.72
                  ? mix(0.82, 1.08, rise / 0.72)
                  : mix(1.08, 1, (rise - 0.72) / 0.28)
                : mix(0.86, 1, rise);
              const blur = rise >= 0.99 ? 0 : (1 - rise) * 5;
              const rule = clamp01((rise - 0.4) / 0.45);
              return (
                <React.Fragment key={wordIndex}>
                  {wordIndex > 0 ? " " : null}
                  <span
                    style={{
                      position: "relative",
                      display: "inline-block",
                      color: token.em ? ACCENT_TEXT : TEXT,
                      fontWeight: token.em ? 800 : 600,
                      opacity: Math.min(1, rise * 1.7),
                      transform: `translateY(${(1 - rise) * 0.32 * size}px) scale(${scale}) rotate(${(1 - rise) * -2.4}deg)`,
                      filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
                    }}
                  >
                    {token.word}
                    {token.em ? (
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: -0.06 * size,
                          height: Math.max(2, 0.075 * size),
                          borderRadius: 999,
                          background: ACCENT,
                          transformOrigin: "left",
                          transform: `scaleX(${rule})`,
                        }}
                      />
                    ) : null}
                  </span>
                </React.Fragment>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}

/* ── The map: two places, named in chips, held for the whole film ───────── */

function MapNodes({ stage }: { stage: Stage }) {
  const u = stage.u;
  const kaduna = onRoute(stage, 0);
  const jos = onRoute(stage, 1);
  return (
    <>
      <NodeDot x={kaduna.x} y={kaduna.y} u={u} />
      <NodeDot x={jos.x} y={jos.y} u={u} />
    </>
  );
}

function MapChips({ stage, opacity }: { stage: Stage; opacity: number }) {
  const u = stage.u;
  const margin = 72 * u;
  const kaduna = onRoute(stage, 0);
  const jos = onRoute(stage, 1);
  return (
    <>
      <Chip x={clamp(kaduna.x, margin, stage.width - margin)} y={kaduna.y + 62 * u} u={u} opacity={opacity}>
        Kaduna
      </Chip>
      <Chip x={clamp(jos.x, margin, stage.width - margin)} y={jos.y + 62 * u} u={u} opacity={opacity}>
        Jos
      </Chip>
    </>
  );
}

/* ── The beats ──────────────────────────────────────────────────────────── */

type BeatProps = { plan: Plan; t: number; stage: Stage };

/** A short trail of dots behind a mark, so a moving mark reads as moving. */
function trail(
  stage: Stage,
  s: number,
  count: number,
  spread: number,
): { x: number; y: number; r: number; o: number }[] {
  const dots = [];
  for (let i = 0; i < count; i += 1) {
    const at = onRoute(stage, Math.max(0, s - spread * (i + 1)));
    dots.push({
      x: at.x,
      y: at.y,
      r: (4.2 - i * 0.9) * stage.u,
      o: (0.38 - i * 0.1) * clamp01((s - 0.02) * 12),
    });
  }
  return dots;
}

/** Someone posts, the post is written as it is read, and lands on the map. */
function PostScene({ plan, t, stage }: BeatProps) {
  const { beat, lines } = plan;
  const u = stage.u;
  const route = cubicD(pixelRoute(stage));
  const kaduna = onRoute(stage, 0);
  const card = inScene(stage, { x: 0.34, y: 0.24 });

  const drawn = during(t, beat.start + 0.05, beat.start + 1.3, EASE.gliding);
  const pop = during(t, lines[0][0] - 0.35, lines[0][0] + 0.4, EASE.arrive);
  const writing: [number, number, number] = [
    during(t, lines[0][0] - 0.05, lines[0][0] + 0.55, EASE.gliding),
    during(t, lines[1][0] - 0.05, lines[1][0] + 0.55, EASE.gliding),
    during(t, lines[2][0] - 0.05, lines[2][0] + 0.55, EASE.gliding),
  ];
  // The post is finished when the last line of it lands; then it goes to Kaduna.
  const sent = lines[2][lines[2].length - 1] + WORD_RISE;
  const fly = during(t, sent + 0.2, sent + 1.15, EASE.arrive);
  const landed = sent + 1.15;
  const avatar = 1 + 0.08 * Math.sin(t * 2.3);

  return (
    <>
      <RouteLine d={route} width={3 * u} color={QUIET} progress={drawn} />
      <MessageCard
        x={card.x}
        y={card.y}
        u={u}
        scale={0.94 + 0.06 * pop}
        lines={writing}
        pulse={avatar}
        opacity={pop}
      />
      {[0.05, 0.1, 0.15].map((back, index) => {
        const p = fly - back;
        if (p <= 0 || p >= 1) return null;
        return (
          <circle
            key={index}
            cx={mix(card.x, kaduna.x, p)}
            cy={mix(card.y, kaduna.y, p)}
            r={(4.4 - index * 1) * u}
            fill={ACCENT}
            opacity={0.34 - index * 0.09}
          />
        );
      })}
      <circle
        cx={mix(card.x, kaduna.x, fly)}
        cy={mix(card.y, kaduna.y, fly)}
        r={6 * u}
        fill={ACCENT}
        opacity={clamp01(fly * 5) * clamp01((1 - fly) * 6)}
      />
      <PulseRing x={kaduna.x} y={kaduna.y} u={u} progress={during(t, landed, landed + 1.1, EASE.gliding)} from={14} to={86} />
      <PulseRing
        x={kaduna.x}
        y={kaduna.y}
        u={u}
        progress={during(t, landed + 0.26, landed + 1.36, EASE.gliding)}
        from={14}
        to={64}
      />
    </>
  );
}

/** Someone already making that exact trip, leaving on the line that says so. */
function TripScene({ plan, t, stage }: BeatProps) {
  const { beat, lines, words } = plan;
  const u = stage.u;
  const route = cubicD(pixelRoute(stage));
  const depart = lines[0][0];
  const finish = words[words.length - 1] + WORD_RISE;
  const travel = during(t, depart, finish + 0.15, EASE.gliding);
  const here = onRoute(stage, travel);
  const bob = Math.sin(t * 7) * 1.4 * u;
  const jos = onRoute(stage, 1);

  return (
    <>
      <RouteLine d={route} width={3 * u} color={QUIET} />
      <RouteLine d={route} width={6 * u} color={ACCENT} progress={travel} />
      {trail(stage, travel, 3, 0.03).map((dot, index) => (
        <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill={ACCENT} opacity={dot.o} />
      ))}
      <TravellerMark x={here.x} y={here.y + FOOT * u + bob} u={u} opacity={clamp01(travel * 6)} />
      <PulseRing x={here.x} y={here.y} u={u} progress={during(t, depart, depart + 0.9, EASE.gliding)} from={14} to={72} />
      <PulseRing x={jos.x} y={jos.y} u={u} progress={during(t, finish + 0.1, finish + 1.2, EASE.gliding)} from={16} to={104} />
      <PulseRing
        x={jos.x}
        y={jos.y}
        u={u}
        progress={during(t, finish + 0.4, finish + 1.5, EASE.gliding)}
        from={16} to={72}
      />
    </>
  );
}

/** Two people on the same road, and the road between them breaking as it is read. */
function StrangersScene({ plan, t, stage }: BeatProps) {
  const { lines, words } = plan;
  const u = stage.u;
  const route = cubicD(pixelRoute(stage));
  const start = lines[0][0];
  const appearLeft = during(t, start - 0.35, start + 0.3, EASE.arrive);
  const appearRight = during(t, start + 0.15, start + 0.75, EASE.arrive);
  const last = words[words.length - 1];
  const open = during(t, last - 0.15, last + 1.1, EASE.gliding);
  const step = during(t, last + 0.1, last + 1.4, EASE.gliding);
  const away = 0.05 * step;
  const gap = 0.005 + 0.16 * open;
  const sender = onRoute(stage, 0.05 - away);
  const traveller = onRoute(stage, 0.95 + away);
  const march = ((t * 18) % 21) * u;

  return (
    <>
      <RouteLine d={route} width={3 * u} color={QUIET} />
      <RouteLine
        d={cubicD(pixelRoute(stage, splitCubic(ROUTE, 0.5 - gap)[0]))}
        width={4 * u}
        color={CREASE}
        dash={`${11 * u} ${10 * u}`}
        phase={march}
      />
      <RouteLine
        d={cubicD(pixelRoute(stage, splitCubic(ROUTE, 0.5 + gap)[1]))}
        width={4 * u}
        color={CREASE}
        dash={`${11 * u} ${10 * u}`}
        phase={march}
      />
      <TravellerMark x={sender.x} y={sender.y + FOOT * u} u={u} opacity={appearLeft} />
      <ParcelMark x={sender.x + 52 * u} y={sender.y - 18 * u} u={u} scale={0.8} opacity={appearLeft} />
      <TravellerMark x={traveller.x} y={traveller.y + FOOT * u} u={u} opacity={appearRight} />
    </>
  );
}

/** The road closes from both ends, and they step towards the middle. */
function TogetherScene({ plan, t, stage }: BeatProps) {
  const { lines, words } = plan;
  const u = stage.u;
  const route = cubicD(pixelRoute(stage));
  const [left, right] = splitCubic(ROUTE, 0.5);
  const start = lines[0][0];
  const meetAt = words[words.length - 1];
  const close = during(t, start - 0.25, meetAt + 0.3, EASE.gliding);
  const step = during(t, start + 0.1, meetAt + 0.5, EASE.gliding);
  const lit = during(t, meetAt, meetAt + 0.45, EASE.arrive);
  const from = onRoute(stage, mix(0.06, 0.3, step));
  const to = onRoute(stage, mix(0.94, 0.7, step));
  const middle = onRoute(stage, 0.5);
  const spark = during(t, meetAt, meetAt + 0.7, EASE.settle);

  return (
    <>
      <RouteLine d={route} width={3 * u} color={QUIET} />
      <RouteLine d={cubicD(pixelRoute(stage, left))} width={6 * u} color={ACCENT} progress={close} />
      <RouteLine
        d={cubicD(pixelRoute(stage, reverseCubic(right)))}
        width={6 * u}
        color={ACCENT}
        progress={close}
      />
      <TravellerMark x={from.x} y={from.y + FOOT * u} u={u} lit={lit > 0.5} />
      <ParcelMark x={from.x - 52 * u} y={from.y - 18 * u} u={u} scale={0.8} />
      <TravellerMark x={to.x} y={to.y + FOOT * u} u={u} lit={lit > 0.5} />
      <circle cx={middle.x} cy={middle.y} r={7 * u * spark} fill={ACCENT} opacity={clamp01(spark * 3) * (1 - spark)} />
      <PulseRing x={middle.x} y={middle.y} u={u} progress={during(t, meetAt + 0.15, meetAt + 1.25, EASE.gliding)} from={14} to={108} />
      <PulseRing
        x={middle.x}
        y={middle.y}
        u={u}
        progress={during(t, meetAt + 0.45, meetAt + 1.55, EASE.gliding)}
        from={14} to={78}
      />
    </>
  );
}

/** One sends without going; the other was going anyway. */
function ExchangeScene({ plan, t, stage }: BeatProps) {
  const { lines, words } = plan;
  const u = stage.u;
  const route = cubicD(pixelRoute(stage));
  const leave = lines[0][0];
  const arrive = words[words.length - 1] + WORD_RISE;
  const carry = during(t, leave + 0.25, arrive, EASE.gliding);
  const along = onRoute(stage, mix(0.09, 0.93, carry));
  const settled = during(t, arrive, arrive + 0.6, EASE.arrive);
  const sender = onRoute(stage, 0.06);
  const traveller = onRoute(stage, 0.94);
  const litSender = during(t, leave + 0.45, leave + 0.95, EASE.arrive);
  const litTraveller = during(t, arrive + 0.1, arrive + 0.55, EASE.arrive);
  const bob = Math.sin(t * 7) * 2.2 * u;
  const parcelX = mix(along.x, traveller.x + 54 * u, settled);
  const parcelY = mix(along.y - 16 * u + bob, traveller.y - 34 * u, settled);

  return (
    <>
      <RouteLine d={route} width={3 * u} color={QUIET} />
      <RouteLine d={route} width={6 * u} color={ACCENT} />
      <TravellerMark x={sender.x} y={sender.y + FOOT * u} u={u} lit={litSender > 0.5} />
      <TravellerMark x={traveller.x} y={traveller.y + FOOT * u} u={u} lit={litTraveller > 0.5} />
      {trail(stage, mix(0.09, 0.93, carry), 3, 0.025).map((dot, index) => (
        <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill={ACCENT} opacity={dot.o * (1 - settled)} />
      ))}
      <ParcelMark x={parcelX} y={parcelY} u={u} scale={0.88} />
      <PulseRing x={sender.x} y={sender.y} u={u} progress={during(t, leave + 0.25, leave + 1.15, EASE.gliding)} from={14} to={70} />
      <PulseRing x={traveller.x} y={traveller.y} u={u} progress={during(t, arrive + 0.1, arrive + 1.3, EASE.gliding)} from={18} to={116} />
    </>
  );
}

/** The road, the two of them, and the line the film is for. */
function ClosingScene({ plan, t, stage }: BeatProps) {
  const { beat, words } = plan;
  const u = stage.u;
  const route = cubicD(pixelRoute(stage));
  const settle = during(t, beat.start - 0.3, beat.start + 0.8, EASE.gliding);
  const lastWord = words[words.length - 1];
  const sign = during(t, lastWord - 0.35, lastWord + 0.55, EASE.settle);
  const glint = ((t - beat.start) % 2.6) / 2.6;
  const ambient = (t - beat.start - 1.1) % 3.2 / 3.2;
  const sender = onRoute(stage, 0.06);
  const traveller = onRoute(stage, 0.94);

  return (
    <>
      <RouteLine d={route} width={3 * u} color={QUIET} />
      <RouteLine d={route} width={6 * u} color={ACCENT} opacity={settle} />
      <RouteGlint d={route} u={u} phase={glint} width={9} opacity={0.42 * settle} />
      <TravellerMark x={sender.x} y={sender.y + FOOT * u} u={u} lit opacity={settle} />
      <TravellerMark x={traveller.x} y={traveller.y + FOOT * u} u={u} lit opacity={settle} />
      <ParcelMark x={traveller.x + 54 * u} y={traveller.y - 34 * u} u={u} scale={0.88} opacity={settle} />
      <CheckDot x={traveller.x + 44 * u} y={traveller.y - 96 * u} u={u} progress={sign} />
      <PulseRing
        x={traveller.x}
        y={traveller.y}
        u={u}
        progress={t > beat.start + 1.1 ? ambient : -1}
        from={18}
        to={104}
        opacity={0.4}
      />
    </>
  );
}

/**
 * The invitation: the marks clear, the road holds, and the type carries the close.
 * Where the film resolves on what the two of them are, it ends on the road itself
 * and the line asking for a place on the waitlist.
 */
function LaunchScene({ plan, t, stage }: BeatProps) {
  const { beat } = plan;
  const u = stage.u;
  const route = cubicD(pixelRoute(stage));
  const settle = during(t, beat.start - 0.2, beat.start + 0.9, EASE.gliding);
  const glint = ((t - beat.start) % 2.9) / 2.9;
  const kaduna = onRoute(stage, 0);
  const jos = onRoute(stage, 1);
  const left = ((t - beat.start - 0.5) % 3.6) / 3.6;
  const right = ((t - beat.start - 1.4) % 3.6) / 3.6;

  return (
    <>
      <RouteLine d={route} width={3 * u} color={QUIET} />
      <RouteLine d={route} width={6 * u} color={ACCENT} opacity={settle} />
      <RouteGlint d={route} u={u} phase={glint} width={9} opacity={0.42 * settle} />
      <PulseRing
        x={kaduna.x}
        y={kaduna.y}
        u={u}
        progress={t > beat.start + 0.5 ? left : -1}
        from={16}
        to={92}
        opacity={0.34}
      />
      <PulseRing
        x={jos.x}
        y={jos.y}
        u={u}
        progress={t > beat.start + 1.4 ? right : -1}
        from={16}
        to={92}
        opacity={0.34}
      />
    </>
  );
}

function BeatScene(props: BeatProps) {
  switch (props.plan.beat.id) {
    case "post":
      return <PostScene {...props} />;
    case "trip":
      return <TripScene {...props} />;
    case "strangers":
      return <StrangersScene {...props} />;
    case "together":
      return <TogetherScene {...props} />;
    case "exchange":
      return <ExchangeScene {...props} />;
    case "launch":
      return <LaunchScene {...props} />;
    default:
      return <ClosingScene {...props} />;
  }
}

/* ── The clip ───────────────────────────────────────────────────────────── */

export function FilmFrame({ t, width, height }: ClipProps) {
  const stage = stageLayout(width, height);
  const route = cubicD(pixelRoute(stage));
  const centreX = stage.scene.x + stage.scene.width / 2;
  const centreY = stage.scene.y + stage.scene.height / 2;
  const mapIn = during(t, 0.25, 1.5, EASE.gliding);

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        background: SET,
        overflow: "hidden",
        fontFamily: "var(--font-work-sans), ui-sans-serif, system-ui, sans-serif",
        color: INK,
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        style={{ position: "absolute", inset: 0 }}
      >
        <g opacity={mapIn}>
          <MapNodes stage={stage} />
        </g>
        {PLAN.map((plan, index) => {
          const opacity = sceneOpacity(t, plan.beat, index);
          // A beat outside its window is invisible, so it is not built at all. The
          // picture is the same either way, and a frame is left with the two beats
          // that are actually crossing rather than all seven.
          if (opacity <= 0) return null;
          return (
            <g
              key={plan.beat.id}
              opacity={opacity}
              transform={`translate(${centreX} ${centreY}) scale(${sceneScale(t, plan.beat, index)}) translate(${-centreX} ${-centreY})`}
            >
              <BeatScene plan={plan} t={t} stage={stage} />
            </g>
          );
        })}
        {BOUNDARIES.map((boundary) => {
          const phase = during(t, boundary - 0.35, boundary + 0.95, EASE.gliding);
          if (phase <= 0 || phase >= 1) return null;
          return (
            <RouteGlint key={boundary} d={route} u={stage.u} phase={phase} width={10} opacity={0.5} />
          );
        })}
      </svg>
      <MapChips stage={stage} opacity={mapIn} />
      {PLAN.map((plan, index) => {
        const opacity = narrationOpacity(t, plan.beat, index);
        if (opacity <= 0) return null;
        return (
          <Narration
            key={plan.beat.id}
            plan={plan}
            t={t}
            stage={stage}
            opacity={opacity}
            exit={
              index === PLAN.length - 1
                ? 0
                : during(t, plan.beat.end - TYPE_OUT, plan.beat.end, EASE.gliding)
            }
          />
        );
      })}
    </div>
  );
}

export const FILM: Clip = {
  id: "kaduna-to-jos",
  name: "Kaduna to Jos",
  duration: DURATION,
  audio: { src: VOICE.src },
  Frame: FilmFrame,
};
