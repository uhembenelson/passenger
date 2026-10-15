"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  CLIPS,
  DEFAULT_RATIO_ID,
  FPS,
  RATIOS,
  findRatio,
  frameCount,
  type Clip,
  type Ratio,
} from "./clips";
import { recordClip } from "./export";

/**
 * The preview surface. Clips are built in code (see `clips.tsx`); this page plays
 * one back, on the frame grid an export would walk, at the ratio you pick.
 */

/**
 * Renders the frame at the size the ratio asks for and scales it to the space
 * available, so the preview keeps the proportions of the exported frame.
 */
const Stage = React.memo(function Stage({
  clip,
  scale,
  ratio,
  frame,
}: {
  clip: Clip;
  scale: number;
  ratio: Ratio;
  frame: number;
}) {
  const frameStyle = {
    width: ratio.width,
    height: ratio.height,
    transform: `scale(${scale})`,
  } as React.CSSProperties;

  return (
    <div
      className="relative w-full overflow-hidden rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] shadow-[var(--ds-shadow-sm)]"
      style={{ aspectRatio: `${ratio.width} / ${ratio.height}` }}
    >
      {scale > 0 ? (
        <div className="absolute left-0 top-0 origin-top-left" style={frameStyle}>
          <clip.Frame t={frame / FPS} width={ratio.width} height={ratio.height} />
        </div>
      ) : null}
    </div>
  );
});

/**
 * The copy the capture walks, and nothing else.
 *
 * Its frame is its own state, so moving it redraws this one clip rather than the
 * whole page — which for a thousand frames is the difference between an export
 * that takes a minute and one that takes two.
 */
type ExportFrameHandle = {
  /** Move to a frame and hand back the element to draw. */
  draw: (frame: number) => HTMLElement | null;
};

const ExportFrame = React.forwardRef<ExportFrameHandle, { clip: Clip; ratio: Ratio }>(
  function ExportFrame({ clip, ratio }, ref) {
    const [frame, setFrame] = useState(0);
    const hostRef = useRef<HTMLDivElement>(null);

    React.useImperativeHandle(
      ref,
      () => ({
        draw: (next: number) => {
          flushSync(() => setFrame(next));
          return (hostRef.current?.firstElementChild as HTMLElement | null) ?? null;
        },
      }),
      [],
    );

    return (
      <div ref={hostRef} style={{ width: ratio.width, height: ratio.height }}>
        <clip.Frame t={frame / FPS} width={ratio.width} height={ratio.height} />
      </div>
    );
  },
);

function Region({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-tertiary)]">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

type ExportState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done"; url: string; name: string; size: number; frames: number }
  | { status: "failed"; message: string };

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudioPage() {
  const [clipId, setClipId] = useState(CLIPS[0]?.id ?? "");
  const clip = useMemo(() => CLIPS.find((entry) => entry.id === clipId) ?? CLIPS[0], [clipId]);

  const [ratioId, setRatioId] = useState(DEFAULT_RATIO_ID);
  const ratio = useMemo(() => findRatio(ratioId), [ratioId]);

  const frames = clip ? frameCount(clip.duration) : 1;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  const reducedMotion = useRef(false);
  const initialised = useRef(false);

  // The clip's own track, if it has one. The picture is a function of the frame, so
  // the audio is kept on the same clock: played from the frame the transport is on,
  // paused with it, and nudged back if it drifts.
  const audioRef = useRef<HTMLAudioElement>(null);

  // The stage is a fixed pixel frame; measure the space it has and scale it down.
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const apply = () => setScale(element.clientWidth / ratio.width);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ratio.width]);

  // Start in motion, unless the visitor asked for reduced motion — then hold the
  // finished frame so the clip is still readable.
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion.current) setFrame(frames - 1);
    else setPlaying(true);
  }, [frames]);

  // Advance on real time, land on frames. `elapsed` is a local so a frame never
  // drifts from the wall clock; the frame it starts from is read from a ref so
  // this loop is not rebuilt on every frame it paints.
  const frameRef = useRef(frame);
  frameRef.current = frame;

  useEffect(() => {
    if (!playing || !clip) return;
    let handle = 0;
    let previous = performance.now();
    let elapsed = frameRef.current / FPS;
    const tick = (now: number) => {
      elapsed += (now - previous) / 1000;
      previous = now;
      if (elapsed >= clip.duration) elapsed = elapsed % clip.duration;
      setFrame(Math.min(frames - 1, Math.floor(elapsed * FPS)));
      // The track runs on the same wall clock as the picture; if it has slipped,
      // put it back rather than letting the two pull apart over forty seconds.
      const audio = audioRef.current;
      if (audio && clip.audio && Math.abs(audio.currentTime - elapsed) > 0.12) {
        audio.currentTime = elapsed;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, clip, frames]);

  // Start and stop the track with the transport. Autoplay is blocked until the
  // visitor has touched the page, so the listener below picks it up on their first
  // gesture rather than leaving the film silent.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!playing) {
      audio.pause();
      return;
    }
    const play = () => void audio.play().catch(() => {});
    play();
    window.addEventListener("pointerdown", play);
    window.addEventListener("keydown", play);
    return () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
    };
  }, [playing, clip]);

  // Scrubbing moves the picture by frames, so the track follows the frame rather
  // than its own clock while the transport is paused.
  useEffect(() => {
    if (playing) return;
    const audio = audioRef.current;
    if (!audio || !clip?.audio) return;
    const target = frame / FPS;
    if (Math.abs(audio.currentTime - target) > 1 / FPS) audio.currentTime = target;
  }, [frame, playing, clip]);

  const selectClip = (next: Clip) => {
    setClipId(next.id);
    setFrame(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const scrub = (value: number) => {
    setPlaying(false);
    setFrame(value);
  };

  const restart = () => {
    setFrame(0);
    if (!reducedMotion.current) setPlaying(true);
  };

  // ── Export ────────────────────────────────────────────────────────────────
  // A second copy of the clip is rendered off to the side and walked frame by
  // frame, faster than real time; the visible stage is left alone. Each frame is
  // stamped from the frame grid rather than the clock, so the file keeps the
  // clip's exact length however long the machine takes to draw it. The file is a
  // picture only — the narration is offered beside it as its own track.

  const [exporting, setExporting] = useState(false);
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
  const exportFrameRef = useRef<ExportFrameHandle>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const exportUrlRef = useRef<string | null>(null);

  // A finished file belongs to the clip and ratio it was made from.
  useEffect(() => {
    setExportState({ status: "idle" });
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current);
      exportUrlRef.current = null;
    }
  }, [clip?.id, ratio.id]);

  useEffect(
    () => () => {
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
    },
    [],
  );

  const startExport = async () => {
    if (!clip || exportState.status === "running") return;
    setPlaying(false);
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current);
      exportUrlRef.current = null;
    }

    const controller = new AbortController();
    exportAbortRef.current = controller;

    // Mount the hidden frame before anything is captured. Its family is read back
    // rather than assumed: the frame asks for it through a custom property, which
    // means nothing inside an image, so the resolved name has to travel with it.
    flushSync(() => setExporting(true));
    const opening = exportFrameRef.current?.draw(0) ?? null;
    const fontFamily = opening ? getComputedStyle(opening).fontFamily : "sans-serif";

    setExportState({ status: "running", done: 0, total: frames });

    // Progress is reported on a clock rather than per frame: a state update
    // redraws the page, and doing that a thousand times costs more than the frames
    // themselves.
    let reported = 0;

    try {
      const recording = await recordClip({
        width: ratio.width,
        height: ratio.height,
        duration: clip.duration,
        fontFamily,
        render: async (next) => exportFrameRef.current?.draw(next) ?? null,
        onProgress: (done, total) => {
          const now = performance.now();
          if (done < total && now - reported < 120) return;
          reported = now;
          setExportState({ status: "running", done, total });
        },
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        setExportState({ status: "idle" });
        return;
      }

      const url = URL.createObjectURL(recording.blob);
      exportUrlRef.current = url;
      setExportState({
        status: "done",
        url,
        name: `${clip.id}-${ratio.id}.${recording.extension}`,
        size: recording.blob.size,
        frames,
      });
    } catch (error) {
      setExportState({
        status: "failed",
        message: error instanceof Error ? error.message : "The export did not finish.",
      });
    } finally {
      exportAbortRef.current = null;
      setExporting(false);
    }
  };

  const cancelExport = () => exportAbortRef.current?.abort();

  const busy = exportState.status === "running";

  if (!clip) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--ds-color-bg-subtle)]">
        <header className="border-b border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-bg-surface)] px-5 py-4 sm:px-8">
          <h1 className="text-base font-semibold tracking-tight text-[var(--ds-color-text-primary)]">
            Studio
          </h1>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6 sm:px-8 lg:py-8">
          <p className="text-sm text-[var(--ds-color-text-tertiary)]">
            No clips yet. Add one to <code className="font-mono text-xs">app/studio/clips.tsx</code>{" "}
            and it will show up here.
          </p>
        </main>
      </div>
    );
  }

  const playhead = frames > 1 ? frame / (frames - 1) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--ds-color-bg-subtle)]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-bg-surface)] px-5 py-4 sm:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-tight text-[var(--ds-color-text-primary)]">
            Studio
          </h1>
          <p className="text-xs text-[var(--ds-color-text-tertiary)]">
            Preview surface for clips built in code.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-[var(--ds-color-text-secondary)] transition-colors hover:text-[var(--ds-color-text-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to site
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8 lg:py-8">
        <div className="flex flex-col gap-6">
          <Region
            title="Stage"
            action={
              <div
                role="group"
                aria-label="Frame ratio"
                className="flex items-center gap-1 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-bg-subtle)] p-1"
              >
                {RATIOS.map((option) => {
                  const selected = option.id === ratio.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setRatioId(option.id)}
                      aria-pressed={selected}
                      disabled={busy}
                      className={`cursor-pointer rounded-[var(--ds-radius-sm)] px-2.5 py-1 font-mono text-xs tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-border-focus)] ${
                        selected
                          ? "bg-[var(--ds-color-bg-surface)] text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-sm)]"
                          : "text-[var(--ds-color-text-tertiary)] hover:text-[var(--ds-color-text-secondary)]"
                      }`}
                    >
                      {option.name}
                    </button>
                  );
                })}
              </div>
            }
          >
            <div
              ref={viewportRef}
              className="mx-auto flex w-full justify-center"
              style={{ maxWidth: `calc(72vh * ${ratio.width / ratio.height})` }}
            >
              <Stage clip={clip} scale={scale} ratio={ratio} frame={frame} />
            </div>
          </Region>

          <Region
            title="Transport"
            action={
              <span className="font-mono text-xs tabular-nums text-[var(--ds-color-text-tertiary)]">
                {(frame / FPS).toFixed(2)}s / {clip.duration.toFixed(2)}s
              </span>
            }
          >
            <div className="flex flex-col gap-4 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-bg-surface)] p-4">
              {clip.audio ? (
                <audio ref={audioRef} src={clip.audio.src} loop preload="auto" muted={muted} hidden />
              ) : null}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlaying((current) => !current)}
                  aria-label={playing ? "Pause clip" : "Play clip"}
                  className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[var(--ds-color-action-primary)] text-[var(--ds-color-action-on-primary)] transition-colors hover:bg-[var(--ds-color-action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-border-focus)] focus-visible:ring-offset-2"
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={restart}
                  aria-label="Restart clip"
                  className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-bg-surface)] text-[var(--ds-color-text-secondary)] transition-colors hover:text-[var(--ds-color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-border-focus)] focus-visible:ring-offset-2"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                {clip.audio ? (
                  <button
                    type="button"
                    onClick={() => setMuted((current) => !current)}
                    aria-label={muted ? "Unmute clip" : "Mute clip"}
                    aria-pressed={muted}
                    className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-bg-surface)] text-[var(--ds-color-text-secondary)] transition-colors hover:text-[var(--ds-color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-border-focus)] focus-visible:ring-offset-2"
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                ) : null}

                <input
                  type="range"
                  min={0}
                  max={frames - 1}
                  step={1}
                  value={frame}
                  onChange={(event) => scrub(Number(event.target.value))}
                  aria-label="Playhead"
                  className="mx-2 h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--ds-color-border-strong)] accent-[var(--ds-color-action-primary)]"
                />
              </div>

              <div className="relative h-12 overflow-hidden rounded-[var(--ds-radius-md)] bg-[var(--ds-color-bg-subtle)]">
                <div className="absolute inset-y-1 left-0 right-0 rounded-[var(--ds-radius-sm)] border border-[var(--ds-color-border-action)] bg-[var(--ds-color-brand-primary)]/12" />
                <div
                  className="absolute inset-y-0 w-px bg-[var(--ds-color-action-primary)]"
                  style={{ left: `${playhead * 100}%` }}
                />
              </div>
            </div>
          </Region>
        </div>

        <aside className="flex flex-col gap-6">
          <Region title="Clips">
            <ul className="flex flex-col gap-2">
              {CLIPS.map((entry) => {
                const selected = entry.id === clip.id;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => selectClip(entry)}
                      aria-current={selected ? "true" : undefined}
                      disabled={busy}
                      className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--ds-radius-lg)] border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-border-focus)] ${
                        selected
                          ? "border-[var(--ds-color-border-action)] bg-[var(--ds-color-bg-surface)]"
                          : "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-bg-subtle)] hover:bg-[var(--ds-color-bg-surface)]"
                      }`}
                    >
                      <span className="truncate text-sm font-medium text-[var(--ds-color-text-primary)]">
                        {entry.name}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-[var(--ds-color-text-tertiary)]">
                        {entry.duration.toFixed(2)}s
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Region>

          <Region title="Render">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <dt className="text-[var(--ds-color-text-tertiary)]">Frame</dt>
              <dd className="text-right font-mono tabular-nums text-[var(--ds-color-text-secondary)]">
                {ratio.width} × {ratio.height}
              </dd>
              <dt className="text-[var(--ds-color-text-tertiary)]">Rate</dt>
              <dd className="text-right font-mono tabular-nums text-[var(--ds-color-text-secondary)]">
                {FPS} fps
              </dd>
              <dt className="text-[var(--ds-color-text-tertiary)]">Frames</dt>
              <dd className="text-right font-mono tabular-nums text-[var(--ds-color-text-secondary)]">
                {frames}
              </dd>
            </dl>
          </Region>

          <Region title="Export">
            <div className="flex flex-col gap-4 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-bg-surface)] p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <dt className="text-[var(--ds-color-text-tertiary)]">File</dt>
                <dd className="text-right font-mono tabular-nums text-[var(--ds-color-text-secondary)]">
                  MP4 · H.264
                </dd>
                <dt className="text-[var(--ds-color-text-tertiary)]">Frame</dt>
                <dd className="text-right font-mono tabular-nums text-[var(--ds-color-text-secondary)]">
                  {ratio.width} × {ratio.height}
                </dd>
                <dt className="text-[var(--ds-color-text-tertiary)]">Length</dt>
                <dd className="text-right font-mono tabular-nums text-[var(--ds-color-text-secondary)]">
                  {clip.duration.toFixed(2)}s
                </dd>
              </dl>

              <p className="text-xs leading-relaxed text-[var(--ds-color-text-tertiary)]">
                The file carries the picture only. The narration travels beside it, and the two are
                put together where the clip is finished.
              </p>

              {busy ? (
                <>
                  <div
                    role="progressbar"
                    aria-label="Frames captured"
                    aria-valuemin={0}
                    aria-valuemax={exportState.total}
                    aria-valuenow={exportState.done}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ds-color-border-strong)]"
                  >
                    <div
                      className="h-full rounded-full bg-[var(--ds-color-action-primary)]"
                      style={{
                        width: `${(exportState.done / Math.max(1, exportState.total)) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs tabular-nums text-[var(--ds-color-text-tertiary)]">
                      {exportState.done} / {exportState.total} frames
                    </span>
                    <button
                      type="button"
                      onClick={cancelExport}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--ds-color-border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--ds-color-text-secondary)] transition-colors hover:text-[var(--ds-color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-border-focus)] focus-visible:ring-offset-2"
                    >
                      <Square className="h-3 w-3" />
                      Stop
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--ds-color-text-tertiary)]">
                    Drawing and encoding frames. This runs as fast as the machine can go. Keep the
                    tab in view.
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  onClick={startExport}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-medium text-[var(--ds-color-action-on-primary)] transition-colors hover:bg-[var(--ds-color-action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-border-focus)] focus-visible:ring-offset-2"
                >
                  <Download className="h-4 w-4" />
                  Export clip
                </button>
              )}

              {exportState.status === "done" ? (
                <div className="flex flex-col gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-bg-subtle)] p-3">
                  <a
                    href={exportState.url}
                    download={exportState.name}
                    className="inline-flex items-center gap-2 text-xs font-medium text-[var(--ds-color-text-primary)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-border-focus)]"
                  >
                    <Download className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{exportState.name}</span>
                  </a>
                  <span className="font-mono text-xs tabular-nums text-[var(--ds-color-text-tertiary)]">
                    {exportState.frames} frames · {fileSize(exportState.size)}
                  </span>
                </div>
              ) : null}

              {exportState.status === "failed" ? (
                <p
                  role="alert"
                  className="text-xs leading-relaxed text-[var(--ds-color-text-secondary)]"
                >
                  {exportState.message}
                </p>
              ) : null}

              {clip.audio ? (
                <a
                  href={clip.audio.src}
                  download
                  className="inline-flex items-center gap-2 self-start text-xs font-medium text-[var(--ds-color-text-secondary)] underline underline-offset-2 transition-colors hover:text-[var(--ds-color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-border-focus)]"
                >
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  Narration track
                </a>
              ) : null}
            </div>
          </Region>
        </aside>
      </main>

      {/* The copy the capture walks. It is laid out off to the side rather than
          hidden, so it measures and styles exactly like the visible one. */}
      {exporting && clip ? (
        <div aria-hidden className="pointer-events-none" style={{ position: "fixed", left: -40000, top: 0 }}>
          <ExportFrame key={`${clip.id}-${ratio.id}`} ref={exportFrameRef} clip={clip} ratio={ratio} />
        </div>
      ) : null}
    </div>
  );
}
