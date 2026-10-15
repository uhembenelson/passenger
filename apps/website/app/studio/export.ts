/**
 * Turning a clip into a file.
 *
 * A clip is a pure function of time, so it can be drawn one frame at a time — but
 * its frames are DOM, and a browser will not hand you a video out of DOM. So each
 * frame is rasterized: the frame element is serialized, the site's own font is
 * baked in beside it as a data URL, and the pair is drawn into a canvas through an
 * SVG `foreignObject`. The canvas frames are then encoded by WebCodecs and muxed
 * into an MP4.
 *
 * Two things are load-bearing. An SVG loaded as an image cannot see the page's
 * fonts, so the font has to travel inside it — a frame drawn without it would
 * quietly fall back to a system face and every word would be the wrong width.
 * And every frame carries its own timestamp, taken from the frame grid rather than
 * from the wall clock, so the file is exactly as long as the clip and a frame
 * cannot slide out of step however slowly the machine draws it.
 *
 * The file has a picture and no sound. The narration is a separate track: it is
 * offered beside the export so a file can be laid over the picture where the two
 * are put together.
 */

import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { FPS } from "./clips";

/**
 * Codecs to try, best first. Baseline H.264 is named first when a browser offers
 * it, since it plays on the widest range of devices; Main and High are what Chrome
 * and Safari actually expose. VP9 in MP4 is the last resort.
 */
const VIDEO_CODECS: { codec: string; muxer: "avc" | "vp9"; profile: string }[] = [
  { codec: "avc1.42E01E", muxer: "avc", profile: "baseline" },
  { codec: "avc1.4d0028", muxer: "avc", profile: "main" },
  { codec: "avc1.640028", muxer: "avc", profile: "high" },
  { codec: "vp09.00.10.08", muxer: "vp9", profile: "vp9" },
];

export type Recording = {
  blob: Blob;
  mimeType: string;
  extension: string;
};

export type RecordOptions = {
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  /** The family the frame draws with, with any custom property already resolved. */
  fontFamily: string;
  /** Move the hidden frame to `frame`, and hand back the element to draw. */
  render: (frame: number) => Promise<HTMLElement | null>;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
};

/** The bitrate a frame of this size wants, for flat colour and fine type. */
function bitrateFor(width: number, height: number) {
  return Math.round(Math.min(28_000_000, width * height * FPS * 0.16));
}

/**
 * The first codec this browser will actually encode. Asked rather than assumed:
 * a browser can list a codec in `isTypeSupported` and still refuse to configure an
 * encoder, and the profiles on offer differ between machines.
 */
async function pickVideoCodec(width: number, height: number) {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("This browser cannot encode video. Try a recent Chrome, Edge or Safari.");
  }
  for (const option of VIDEO_CODECS) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: option.codec,
        width,
        height,
        framerate: FPS,
        bitrate: bitrateFor(width, height),
      });
      if (support.supported) return option;
    } catch {
      // A codec string this build does not know; try the next.
    }
  }
  throw new Error("This browser has no video codec the export can use.");
}

function base64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/* ── The font, which has to be carried inside every frame ───────────────── */

type Face = {
  family: string;
  weight: number;
  style: string;
  range: string;
  url: string;
};

/**
 * Every face the page is actually using for this family. There are more than one:
 * a weight per entry, and a unicode-range subset per entry on top of that, so
 * taking the first match would drop every weight but one and every glyph outside
 * one subset.
 */
function facesFor(computedFamily: string): Face[] {
  const wanted = computedFamily
    .split(",")
    .map((part) => part.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);

  const faces: Face[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // another origin's stylesheet, with no faces we need
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      // `src` and `unicode-range` are real on a `@font-face` declaration at runtime
      // but are missing from the DOM typings.
      const declared = rule.style as CSSStyleDeclaration & { src?: string; unicodeRange?: string };
      const family = (declared.fontFamily || "").replace(/["']/g, "");
      if (!wanted.some((name) => name.toLowerCase() === family.toLowerCase())) continue;
      const source = (declared.src || "").match(/url\((["']?)([^"')]+)\1\)/);
      if (!source) continue;
      faces.push({
        family,
        weight: Number.parseInt(declared.fontWeight || "400", 10) || 400,
        style: declared.fontStyle || "normal",
        range: declared.unicodeRange || "",
        // A `@font-face` source is written relative to its stylesheet, not the page.
        url: new URL(source[2], sheet.href ?? document.baseURI).href,
      });
    }
  }
  return faces;
}

/**
 * The code points a frame actually draws. Every character of every text node,
 * which is what the font has to be able to set.
 */
function codePointsIn(root: Element): Set<number> {
  const points = new Set<number>();
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      for (const character of node.textContent ?? "") points.add(character.codePointAt(0) ?? 0);
      return;
    }
    for (const child of Array.from(node.childNodes)) visit(child);
  };
  visit(root);
  return points;
}

/** The spans a `unicode-range` value names. */
function spansIn(value: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const part of value.split(",")) {
    const token = part.trim().replace(/^U\+/i, "");
    if (!token) continue;
    if (token.includes("?")) {
      spans.push([
        Number.parseInt(token.replace(/\?/g, "0"), 16),
        Number.parseInt(token.replace(/\?/g, "F"), 16),
      ]);
    } else if (token.includes("-")) {
      const [low, high] = token.split("-");
      spans.push([Number.parseInt(low, 16), Number.parseInt(high, 16)]);
    } else {
      const point = Number.parseInt(token, 16);
      spans.push([point, point]);
    }
  }
  return spans;
}

/** Whether any of the drawn characters falls inside a face's declared range. */
function covers(spanText: string, points: Set<number>) {
  const spans = spansIn(spanText);
  if (spans.length === 0) return true; // no range declared: the face covers everything
  for (const point of points) {
    for (const [low, high] of spans) {
      if (point >= low && point <= high) return true;
    }
  }
  return false;
}

const fontCssCache = new Map<string, Promise<string>>();

/**
 * The `@font-face` block for a family, with each file inlined exactly once and
 * only the subsets the frame's own characters fall into.
 *
 * The page declares the same file many times over — once per weight, and once per
 * unicode subset — and a frame cannot look a file up the way the page can, so the
 * bytes have to travel inside it. That is expensive twice over: the frame is
 * serialized into a data URL and the whole payload is decoded again for every
 * frame of the clip. So declarations naming the same file, style and range are
 * folded into one rule whose weight is a range — for a variable font that is not a
 * shortcut, one file really does serve every weight in the span — and subsets that
 * hold none of the frame's characters are left out entirely. For English type that
 * is the difference between a dozen files and one.
 */
export function loadFontFaces(computedFamily: string, points: Set<number>): Promise<string> {
  const key = `${computedFamily}|${Array.from(points).sort((a, b) => a - b).join(",")}`;
  let cached = fontCssCache.get(key);
  if (!cached) {
    cached = (async () => {
      const faces = facesFor(computedFamily).filter((face) => covers(face.range, points));
      const groups = new Map<string, { face: Face; low: number; high: number }>();
      for (const face of faces) {
        const groupKey = `${face.url}|${face.style}|${face.range}`;
        const existing = groups.get(groupKey);
        if (existing) {
          existing.low = Math.min(existing.low, face.weight);
          existing.high = Math.max(existing.high, face.weight);
        } else {
          groups.set(groupKey, { face, low: face.weight, high: face.weight });
        }
      }

      const files = new Map<string, string>();
      await Promise.all(
        Array.from(new Set(Array.from(groups.values(), (group) => group.face.url))).map(
          async (url) => {
            const response = await fetch(url);
            if (!response.ok) return;
            files.set(
              url,
              `data:font/woff2;base64,${base64(new Uint8Array(await response.arrayBuffer()))}`,
            );
          },
        ),
      );

      return Array.from(groups.values())
        .filter((group) => files.has(group.face.url))
        .map(({ face, low, high }) => {
          const weight = low === high ? `${low}` : `${low} ${high}`;
          return (
            `@font-face{font-family:${JSON.stringify(face.family)};` +
            `font-weight:${weight};font-style:${face.style};` +
            `src:url("${files.get(face.url)}") format("woff2");` +
            (face.range ? `unicode-range:${face.range};` : "") +
            `}`
          );
        })
        .join("");
    })();
    fontCssCache.set(key, cached);
  }
  return cached;
}

/* ── Drawing one frame ─────────────────────────────────────────────────── */

/**
 * Every rule that styles a class the frame actually uses.
 *
 * Descent is by capability rather than by rule type, because Tailwind puts its
 * utilities inside `@layer`, and a rule nested in a layer is invisible to a walk
 * that only knows about `@media`. Selectors are compared with their escapes
 * stripped, because a utility class carrying an arbitrary value arrives escaped —
 * `.bg-\[\#FAFAFC\]` names the class `bg-[#FAFAFC]`.
 */
function rulesMatching(rules: CSSRuleList, used: (selector: string) => boolean): string[] {
  const out: string[] = [];
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      if (used(rule.selectorText)) out.push(rule.cssText);
    } else if ("cssRules" in rule) {
      const inner = rulesMatching((rule as CSSGroupingRule).cssRules, used);
      if (inner.length > 0) {
        out.push(`${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${inner.join("")}}`);
      }
    }
  }
  return out;
}

/**
 * The stylesheet a frame needs to look like itself.
 *
 * A frame is expected to draw with inline styles — the film does, so this finds
 * nothing and costs nothing. But a frame that reaches for utility classes would
 * otherwise rasterize unstyled, because an image has no stylesheets of its own, so
 * any rule naming a class the frame actually uses is carried across as well.
 */
function collectCss(root: HTMLElement): string {
  const classes = new Set<string>();
  const gather = (element: Element) => {
    for (const name of (element.getAttribute("class") ?? "").split(/\s+/)) {
      if (name) classes.add(name);
    }
    for (const child of Array.from(element.children)) gather(child);
  };
  gather(root);
  if (classes.size === 0) return "";

  const names = Array.from(classes);
  const used = (selector: string) => {
    if (selector.includes(":root")) return true;
    const plain = selector.replace(/\\/g, "");
    return names.some((name) => plain.includes(`.${name}`));
  };

  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // another origin's stylesheet
    }
    parts.push(...rulesMatching(rules, used));
  }
  return parts.join("");
}

/** The DPR-independent drawing surface a frame is rasterized through. */
function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  if (!canvas.getContext("2d", { alpha: false })) {
    throw new Error("This browser cannot draw the export canvas.");
  }
  return canvas;
}

async function rasterize(
  canvas: HTMLCanvasElement,
  element: HTMLElement,
  css: string,
  fontFamily: string,
  width: number,
  height: number,
) {
  const clone = element.cloneNode(true) as HTMLElement;
  // The frame asks for the font through a custom property, which means nothing
  // inside an image. Write the resolved family in its place.
  clone.style.fontFamily = fontFamily;

  const body = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    (css ? `<defs><style>${css}</style></defs>` : "") +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${body}</foreignObject></svg>`;

  // A data URL rather than a blob URL: Chrome taints a canvas drawn from a
  // blob-backed SVG, and a tainted canvas cannot be turned into a `VideoFrame` at
  // all. It costs a third in size and buys the frame.
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("A frame could not be drawn to the export canvas."));
    image.src = `data:image/svg+xml;base64,${base64(new TextEncoder().encode(svg))}`;
  });
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The export canvas has no drawing surface.");
  context.drawImage(image, 0, 0, width, height);
}

/* ── The recording ─────────────────────────────────────────────────────── */

export async function recordClip(options: RecordOptions): Promise<Recording> {
  const { width, height, duration, fontFamily, render, onProgress, signal } = options;

  const total = Math.max(1, Math.round(duration * FPS));
  const canvas = makeCanvas(width, height);
  const codec = await pickVideoCodec(width, height);
  const bitrate = bitrateFor(width, height);

  // Read the opening frame first. It settles what every later frame must look like.
  const opening = await render(0);
  if (!opening) throw new Error("The export frame went missing.");

  // The font has to be settled before the first frame is drawn, so it is chosen
  // from characters sampled across the whole clip rather than from the frame in
  // hand: kinetic type keeps its words in the frame and animates them, but text
  // that only arrives later would otherwise be set in a face that never travelled
  // with the picture.
  const points = new Set<number>();
  const samples = new Set<number>([0, total - 1]);
  for (let step = 1; step < 16; step += 1) samples.add(Math.round((step / 16) * (total - 1)));
  for (const sample of Array.from(samples).sort((a, b) => a - b)) {
    const element = sample === 0 ? opening : await render(sample);
    if (!element) continue;
    for (const point of codePointsIn(element)) points.add(point);
  }
  if (total > 1) await render(0); // put the opening frame back before it is drawn

  const css = (await loadFontFaces(fontFamily, points)) + collectCss(opening);
  await rasterize(canvas, opening, css, fontFamily, width, height);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: codec.muxer, width, height, frameRate: FPS },
    fastStart: "in-memory",
  });

  let failure: Error | undefined;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => {
      failure = error instanceof Error ? error : new Error(String(error));
    },
  });
  encoder.configure({
    codec: codec.codec,
    width,
    height,
    framerate: FPS,
    bitrate,
    latencyMode: "quality",
  });

  try {
    for (let frame = 0; frame < total; frame += 1) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (frame > 0) {
        const element = await render(frame);
        if (!element) throw new Error("The export frame went missing.");
        await rasterize(canvas, element, css, fontFamily, width, height);
      }
      if (failure) throw failure;

      // Stamped from the frame grid, never from the clock: the picture is the
      // same length at any speed the machine can draw it.
      const timestamp = Math.round((frame / FPS) * 1_000_000);
      const videoFrame = new VideoFrame(canvas, { timestamp, duration: Math.round(1_000_000 / FPS) });
      try {
        encoder.encode(videoFrame, { keyFrame: frame % (FPS * 2) === 0 });
      } finally {
        videoFrame.close();
      }

      // Keep the encoder's queue short so memory stays flat on a long clip.
      while (encoder.encodeQueueSize > 8) await new Promise((resolve) => setTimeout(resolve, 0));
      onProgress?.(frame + 1, total);
    }

    await encoder.flush();
    if (failure) throw failure;
    muxer.finalize();
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }

  const blob = new Blob([target.buffer], { type: "video/mp4" });
  return { blob, mimeType: "video/mp4", extension: "mp4" };
}
