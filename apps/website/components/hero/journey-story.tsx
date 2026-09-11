"use client";

import React, { useEffect, useRef } from "react";

export interface JourneyStoryRef {
  updateProgress: (progress: number) => void;
}

interface JourneyStoryProps {
  storyRef?: React.RefObject<JourneyStoryRef | null>;
}

/* ── Easing Functions ───────────────────────────────────── */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const phase = (p: number, start: number, end: number, ease = easeOutCubic) =>
  ease(clamp((p - start) / (end - start)));

/* ── Multi-Curved Diagonal Trajectories ─────────────────── */
// Jos (Origin / Package):      (180, 740)  - bottom-left
// Traveller Start (Kaduna):    (160, 340)  - mid-left
// Rendezvous (under text 45%): (680, 460)  - center meeting point
// Abuja (Destination):         (1240, 320) - right side, safely well below navbar
// Delivered Popup Badge:       (1240, 240) - 160px+ safe margin below top navbar

// Sender route: graceful double-curve up to rendezvous
const D_SENDER =
  "M 180 740 C 300 740, 390 680, 470 630 C 550 580, 600 520, 680 460";

// Traveller route: graceful double-curve to rendezvous
const D_TRAVAPP =
  "M 160 340 C 280 340, 380 420, 480 410 C 560 400, 620 430, 680 460";

// Shared route to Abuja: multiple organic curves winding gracefully through terrain
// Safely terminating at (1240, 320), keeping all UI well clear of the top navigation
const D_SHARED =
  "M 680 460 C 740 500, 830 520, 910 460 C 990 400, 1060 360, 1140 370 C 1180 370, 1210 350, 1240 320";

export function JourneyStory({ storyRef }: JourneyStoryProps) {
  /* ── Refs: invisible measurement paths ─────────────────── */
  const msrSenderRef  = useRef<SVGPathElement>(null);
  const msrTravRef    = useRef<SVGPathElement>(null);
  const msrSharedRef  = useRef<SVGPathElement>(null);

  /* ── Refs: active illuminated routes (solid vibrant green) */
  const actSenderRef  = useRef<SVGPathElement>(null);
  const actSenderGRef = useRef<SVGPathElement>(null);
  const actTravRef    = useRef<SVGPathElement>(null);
  const actTravGRef   = useRef<SVGPathElement>(null);
  const actSharedRef  = useRef<SVGPathElement>(null);
  const actSharedGRef = useRef<SVGPathElement>(null);

  /* ── Refs: moving markers ──────────────────────────────── */
  const travellerGRef = useRef<SVGGElement>(null);
  const packageGRef   = useRef<SVGGElement>(null);

  /* ── Refs: location nodes ──────────────────────────────── */
  const originNodeRef = useRef<SVGGElement>(null);
  const destNodeRef   = useRef<SVGGElement>(null);
  const rvNodeRef     = useRef<SVGGElement>(null);

  /* ── Refs: rendezvous multi-ring pulse ─────────────────── */
  const pulse1Ref = useRef<SVGCircleElement>(null);
  const pulse2Ref = useRef<SVGCircleElement>(null);
  const pulse3Ref = useRef<SVGCircleElement>(null);

  /* ── Refs: contextual chips & arrival badge ────────────── */
  const chipNeedsRef   = useRef<SVGGElement>(null);
  const chipAlreadyRef = useRef<SVGGElement>(null);
  const chipSameRef    = useRef<SVGGElement>(null);
  const deliveredRef   = useRef<SVGGElement>(null);
  const destFillRef    = useRef<SVGCircleElement>(null);
  const destCheckRef   = useRef<SVGPathElement>(null);

  /* ── Path lengths cache ────────────────────────────────── */
  const lens = useRef({ sender: 1, travApp: 1, shared: 1 });

  /* ── Precomputed path samples (avoids per-frame geometry) ── */
  type Pt = { x: number; y: number };
  const points = useRef<{ sender: Pt[]; travApp: Pt[]; shared: Pt[] }>({
    sender: [],
    travApp: [],
    shared: [],
  });

  useEffect(() => {
    const measure = (r: React.RefObject<SVGPathElement | null>) =>
      r.current?.getTotalLength() ?? 1;

    lens.current.sender  = measure(msrSenderRef);
    lens.current.travApp = measure(msrTravRef);
    lens.current.shared  = measure(msrSharedRef);

    const initDash = (
      ref: React.RefObject<SVGPathElement | null>,
      len: number
    ) => {
      if (!ref.current) return;
      ref.current.style.strokeDasharray  = `${len}`;
      ref.current.style.strokeDashoffset = `${len}`;
    };

    initDash(actSenderRef,  lens.current.sender);
    initDash(actSenderGRef, lens.current.sender);
    initDash(actTravRef,    lens.current.travApp);
    initDash(actTravGRef,   lens.current.travApp);
    initDash(actSharedRef,  lens.current.shared);
    initDash(actSharedGRef, lens.current.shared);

    // Sample each route once at mount; per-frame reads interpolate these.
    const SAMPLE_COUNT = 160;
    const samplePath = (r: React.RefObject<SVGPathElement | null>) => {
      const el = r.current;
      if (!el) return [] as Pt[];
      const len = el.getTotalLength();
      const pts: Pt[] = [];
      for (let i = 0; i <= SAMPLE_COUNT; i++) {
        const p = el.getPointAtLength((i / SAMPLE_COUNT) * len);
        pts.push({ x: p.x, y: p.y });
      }
      return pts;
    };
    points.current.sender  = samplePath(msrSenderRef);
    points.current.travApp = samplePath(msrTravRef);
    points.current.shared  = samplePath(msrSharedRef);

    updateProgress(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ptOn = (ref: React.RefObject<SVGPathElement | null>, t: number) => {
    const el = ref.current;
    if (!el) return { x: 0, y: 0 };
    const len = el.getTotalLength();
    return el.getPointAtLength(clamp(t) * len);
  };

  // Cheap per-frame point lookup from the precomputed samples
  const pointAt = (samples: Pt[], t: number) => {
    if (samples.length < 2) return { x: 0, y: 0 };
    const max = samples.length - 1;
    const idx = clamp(t) * max;
    const i0 = Math.floor(idx);
    const i1 = Math.min(max, i0 + 1);
    const f = idx - i0;
    const a = samples[i0];
    const b = samples[i1];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };

  const updateProgress = (p: number) => {
    /* ── Phase 0 (0.00→0.15): Nodes appear softly ─────────── */
    if (originNodeRef.current) {
      originNodeRef.current.style.opacity = `${phase(p, 0.02, 0.16)}`;
    }
    if (destNodeRef.current) {
      destNodeRef.current.style.opacity = `${phase(p, 0.06, 0.20)}`;
    }
    if (rvNodeRef.current) {
      rvNodeRef.current.style.opacity = `${phase(p, 0.18, 0.32)}`;
    }

    /* ── Phase 1: Package appears and glides to junction by p = 0.48 ── */
    if (packageGRef.current) {
      packageGRef.current.style.opacity = `${phase(p, 0.10, 0.20)}`;
    }
    if (chipNeedsRef.current) {
      const op = phase(p, 0.12, 0.22) * (1 - phase(p, 0.38, 0.46, easeInOutCubic));
      chipNeedsRef.current.style.opacity = `${op}`;
    }

    const sLen = lens.current.sender;
    let pkgX = 180, pkgY = 740;

    // Package glides from Jos to Rendezvous between p = 0.28 and p = 0.48
    if (p < 0.28) {
      pkgX = 180;
      pkgY = 740;
      if (actSenderRef.current) {
        actSenderRef.current.style.strokeDashoffset = `${sLen}`;
        actSenderRef.current.style.opacity = "0";
      }
      if (actSenderGRef.current) {
        actSenderGRef.current.style.strokeDashoffset = `${sLen}`;
        actSenderGRef.current.style.opacity = "0";
      }
    } else if (p < 0.48) {
      const sendProg = phase(p, 0.28, 0.48, easeInOutCubic);
      const pt = pointAt(points.current.sender, sendProg);
      pkgX = pt.x;
      pkgY = pt.y;

      const offset = sLen * (1 - sendProg);
      if (actSenderRef.current) {
        actSenderRef.current.style.strokeDashoffset = `${offset}`;
        actSenderRef.current.style.opacity = "1";
      }
      if (actSenderGRef.current) {
        actSenderGRef.current.style.strokeDashoffset = `${offset}`;
        actSenderGRef.current.style.opacity = "0.4";
      }
    } else {
      // Arrived at junction: path is 100% complete solid green
      if (actSenderRef.current) {
        actSenderRef.current.style.strokeDashoffset = "0";
        actSenderRef.current.style.opacity = "1";
      }
      if (actSenderGRef.current) {
        actSenderGRef.current.style.strokeDashoffset = "0";
        actSenderGRef.current.style.opacity = "0.4";
      }
      // Handover tuck: gently tucks into traveller's side at junction
      const tuck = phase(p, 0.48, 0.54, easeInOutCubic);
      pkgX = 680 + tuck * 14;
      pkgY = 460 + tuck * 12;
    }

    /* ── Phase 2: Traveller moves to junction by p = 0.48 ──── */
    const travFade = phase(p, 0.14, 0.24);
    if (travellerGRef.current) {
      travellerGRef.current.style.opacity = `${travFade}`;
    }

    const tLen = lens.current.travApp;
    let travX = 160, travY = 340;

    // Traveller approaches from Kaduna and meets at junction at p = 0.48
    if (p < 0.48) {
      const travProg = phase(p, 0.16, 0.48, easeInOutCubic);
      const pt = pointAt(points.current.travApp, travProg);
      travX = pt.x;
      travY = pt.y;

      const offset = tLen * (1 - travProg);
      if (actTravRef.current) {
        actTravRef.current.style.strokeDashoffset = `${offset}`;
        actTravRef.current.style.opacity = `${travFade}`;
      }
      if (actTravGRef.current) {
        actTravGRef.current.style.strokeDashoffset = `${offset}`;
        actTravGRef.current.style.opacity = `${travFade * 0.4}`;
      }
    } else {
      // Arrived at junction: path is 100% complete solid green
      if (actTravRef.current) {
        actTravRef.current.style.strokeDashoffset = "0";
        actTravRef.current.style.opacity = "1";
      }
      if (actTravGRef.current) {
        actTravGRef.current.style.strokeDashoffset = "0";
        actTravGRef.current.style.opacity = "0.4";
      }
      travX = 680;
      travY = 460;
    }

    if (chipAlreadyRef.current) {
      const op = phase(p, 0.22, 0.32) * (1 - phase(p, 0.42, 0.48, easeInOutCubic));
      chipAlreadyRef.current.style.opacity = `${op}`;
      chipAlreadyRef.current.setAttribute("transform", `translate(${travX + 28}, ${travY - 24})`);
    }

    /* ── Phase 3: THE HANDOVER WINDOW (Pause / Wait at junction from p = 0.48 to 0.64) ── */
    // Both traveller and package wait together at (680, 460).
    // The viewer has ample time to observe the meeting and understand the handover.
    const matchP = phase(p, 0.48, 0.64, easeInOutCubic);
    const matchOp = matchP * (1 - phase(p, 0.64, 0.72));

    const pulseRing = (ref: React.RefObject<SVGCircleElement | null>, offset: number) => {
      if (!ref.current) return;
      const t = clamp(matchP - offset);
      const r = 12 + t * 42;
      const o = Math.max(0, matchOp * (1 - t));
      ref.current.setAttribute("r", `${r}`);
      ref.current.style.opacity = `${o}`;
    };
    pulseRing(pulse1Ref, 0.00);
    pulseRing(pulse2Ref, 0.22);
    pulseRing(pulse3Ref, 0.44);

    if (chipSameRef.current) {
      // "Same way" chip is prominently displayed during the handover window
      const op = phase(p, 0.49, 0.55) * (1 - phase(p, 0.64, 0.70, easeInOutCubic));
      chipSameRef.current.style.opacity = `${op}`;
    }

    /* ── Phase 4: Shared Journey Departs AFTER Handover (p = 0.64 → 0.92) ── */
    // Only after the handover pause is complete at p = 0.64 do they start moving together
    const shLen = lens.current.shared;

    if (p >= 0.64) {
      const sharedProg = phase(p, 0.64, 0.92, easeInOutCubic);
      const pt = pointAt(points.current.shared, sharedProg);
      travX = pt.x;
      travY = pt.y;

      // Package travels tucked alongside the traveller
      pkgX = pt.x + 14;
      pkgY = pt.y + 12;

      // Green line follows EXACTLY at traveller position
      const offset = shLen * (1 - sharedProg);
      if (actSharedRef.current) {
        actSharedRef.current.style.strokeDashoffset = `${offset}`;
        actSharedRef.current.style.opacity = "1";
      }
      if (actSharedGRef.current) {
        actSharedGRef.current.style.strokeDashoffset = `${offset}`;
        actSharedGRef.current.style.opacity = "0.45";
      }
    } else {
      // Waiting at junction: shared path has not started yet
      if (actSharedRef.current) {
        actSharedRef.current.style.strokeDashoffset = `${shLen}`;
        actSharedRef.current.style.opacity = "0";
      }
      if (actSharedGRef.current) {
        actSharedGRef.current.style.strokeDashoffset = `${shLen}`;
        actSharedGRef.current.style.opacity = "0";
      }
    }

    // Update Marker Transforms
    if (travellerGRef.current) {
      travellerGRef.current.setAttribute("transform", `translate(${travX},${travY})`);
    }
    if (packageGRef.current) {
      packageGRef.current.setAttribute("transform", `translate(${pkgX},${pkgY})`);
    }

    /* ── Phase 5 (0.90→1.00): Arrival at Abuja ─────────────── */
    const delivP = phase(p, 0.90, 0.98, easeOutCubic);

    if (deliveredRef.current) {
      deliveredRef.current.style.opacity = `${delivP}`;
      const scale = 0.85 + 0.15 * delivP;
      deliveredRef.current.setAttribute(
        "transform",
        `translate(1240, 240) scale(${scale})`
      );
    }

    if (destFillRef.current) {
      const r = 10 + delivP * 14;
      destFillRef.current.setAttribute("r", `${r}`);
      destFillRef.current.setAttribute("fill", delivP > 0.8 ? "#248A56" : "#34D186");
    }

    if (destCheckRef.current) {
      const checkLen = destCheckRef.current.getTotalLength?.() ?? 24;
      destCheckRef.current.style.strokeDasharray  = `${checkLen}`;
      destCheckRef.current.style.strokeDashoffset = `${checkLen * (1 - delivP)}`;
      destCheckRef.current.style.opacity = `${delivP}`;
    }
  };

  if (storyRef) {
    (storyRef as React.MutableRefObject<JourneyStoryRef | null>).current = {
      updateProgress,
    };
  }

  return (
    <div
      className="absolute inset-0 w-full h-full flex items-center justify-center pointer-events-none select-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Viewport Radial Ambient Glow along the diagonal axis */}
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, #34D18618 0%, #27AB6B08 45%, transparent 75%)",
          filter: "blur(60px)",
        }}
      />

      <svg
        viewBox="0 0 1440 900"
        className="w-full h-full object-cover overflow-visible"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Solid vibrant active route gradient */}
          <linearGradient id="fullActiveGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#34D186" />
            <stop offset="50%" stopColor="#27AB6B" />
            <stop offset="100%" stopColor="#248A56" />
          </linearGradient>

          {/* Approach gradient */}
          <linearGradient id="approachGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#34D186" />
            <stop offset="100%" stopColor="#27AB6B" />
          </linearGradient>

          {/* Soft drop shadow */}
          <filter id="markerShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.14" />
          </filter>

          {/* Idle animation styles */}
          <style>{`
            @keyframes idle-dash-flow {
              to { stroke-dashoffset: -32; }
            }
            .idle-route {
              stroke-dasharray: 8 8;
              animation: idle-dash-flow 2s linear infinite;
            }
            @keyframes idle-breathe-glow {
              0%, 100% { opacity: 0.22; }
              50% { opacity: 0.50; }
            }
            .idle-glow {
              animation: idle-breathe-glow 3.5s ease-in-out infinite;
            }
          `}</style>
        </defs>

        {/* ─────────────────────────────────────────────────── */}
        {/* FAINT BACKGROUND GHOST ROUTES (Multi-Curved)        */}
        {/* ─────────────────────────────────────────────────── */}
        {/* 1. Sender Approach Ghost (Jos to Rendezvous) */}
        <path
          d={D_SENDER}
          stroke="#D1D5DB"
          strokeWidth="2"
          className="idle-route idle-glow"
        />

        {/* 2. Traveller Approach Ghost (Kaduna to Rendezvous) */}
        <path
          d={D_TRAVAPP}
          stroke="#D1D5DB"
          strokeWidth="2"
          className="idle-route idle-glow"
          style={{ animationDelay: "0.6s" }}
        />

        {/* 3. Shared Ghost Route (Multi-curved safely to 1240, 320) */}
        <path
          d={D_SHARED}
          stroke="#D1D5DB"
          strokeWidth="2"
          className="idle-route idle-glow"
          style={{ animationDelay: "1.2s" }}
        />

        {/* ─────────────────────────────────────────────────── */}
        {/* MEASUREMENT PATHS (invisible)                       */}
        {/* ─────────────────────────────────────────────────── */}
        <path ref={msrSenderRef} d={D_SENDER} stroke="none" />
        <path ref={msrTravRef}   d={D_TRAVAPP} stroke="none" />
        <path ref={msrSharedRef} d={D_SHARED} stroke="none" />

        {/* ─────────────────────────────────────────────────── */}
        {/* GLOW DUPLICATES (smooth hardware-accelerated aura)  */}
        {/* ─────────────────────────────────────────────────── */}
        <path
          ref={actSenderGRef}
          d={D_SENDER}
          stroke="#34D186"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0 }}
        />
        <path
          ref={actTravGRef}
          d={D_TRAVAPP}
          stroke="#34D186"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0 }}
        />
        <path
          ref={actSharedGRef}
          d={D_SHARED}
          stroke="#34D186"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0 }}
        />

        {/* ─────────────────────────────────────────────────── */}
        {/* ACTIVE SOLID ILLUMINATED GREEN ROUTES (1:1 lock)    */}
        {/* ─────────────────────────────────────────────────── */}
        {/* Sender active route (Jos -> Rendezvous) */}
        <path
          ref={actSenderRef}
          d={D_SENDER}
          stroke="url(#approachGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0 }}
        />

        {/* Traveller approach (Kaduna -> Rendezvous) */}
        <path
          ref={actTravRef}
          d={D_TRAVAPP}
          stroke="url(#approachGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0 }}
        />

        {/* Shared active route (Rendezvous -> Abuja safely below navbar) */}
        <path
          ref={actSharedRef}
          d={D_SHARED}
          stroke="url(#fullActiveGrad)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0 }}
        />

        {/* ─────────────────────────────────────────────────── */}
        {/* RENDEZVOUS PULSE RINGS (under text area at 680, 460) */}
        {/* ─────────────────────────────────────────────────── */}
        <circle ref={pulse1Ref} cx="680" cy="460" r="14" fill="#34D186" style={{ opacity: 0 }} />
        <circle ref={pulse2Ref} cx="680" cy="460" r="14" fill="#63CF9A" style={{ opacity: 0 }} />
        <circle ref={pulse3Ref} cx="680" cy="460" r="14" fill="#98D7BA" style={{ opacity: 0 }} />

        {/* Rendezvous Node Marker */}
        <g ref={rvNodeRef} transform="translate(680,460)" style={{ opacity: 0 }}>
          <circle r="7" fill="#FFFFFF" stroke="#34D186" strokeWidth="2.5" />
        </g>

        {/* ─────────────────────────────────────────────────── */}
        {/* ORIGIN NODE: Jos (180, 740) [Bottom Left]          */}
        {/* ─────────────────────────────────────────────────── */}
        <g ref={originNodeRef} transform="translate(180,740)" style={{ opacity: 0 }}>
          <circle r="24" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="2" filter="url(#markerShadow)" />
          <circle r="7" fill="#1F2937" />
          <text
            y="44"
            textAnchor="middle"
            style={{
              fontSize: "16px",
              fontWeight: 600,
              fill: "#1F2937",
              fontFamily: "Work Sans, sans-serif",
              letterSpacing: "-0.01em",
            }}
          >
            Jos
          </text>
          <text
            y="62"
            textAnchor="middle"
            style={{
              fontSize: "12px",
              fontWeight: 500,
              fill: "#7A7F87",
              fontFamily: "Work Sans, sans-serif",
            }}
          >
            Origin
          </text>
        </g>

        {/* ─────────────────────────────────────────────────── */}
        {/* DESTINATION NODE: Abuja (1240, 320) [Safely below navbar] */}
        {/* ─────────────────────────────────────────────────── */}
        <g ref={destNodeRef} transform="translate(1240,320)" style={{ opacity: 0 }}>
          <circle r="28" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="2" filter="url(#markerShadow)" />
          <circle ref={destFillRef} r="10" fill="#34D186" />
          <circle r="4" fill="#FFFFFF" />
          <path
            ref={destCheckRef}
            d="M -5 0 L -1 4 L 7 -4"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0 }}
          />
          <text
            y="48"
            textAnchor="middle"
            style={{
              fontSize: "16px",
              fontWeight: 600,
              fill: "#1F2937",
              fontFamily: "Work Sans, sans-serif",
              letterSpacing: "-0.01em",
            }}
          >
            Abuja
          </text>
          <text
            y="66"
            textAnchor="middle"
            style={{
              fontSize: "12px",
              fontWeight: 500,
              fill: "#7A7F87",
              fontFamily: "Work Sans, sans-serif",
            }}
          >
            Destination
          </text>
        </g>

        {/* ─────────────────────────────────────────────────── */}
        {/* TRAVELLER MARKER                                   */}
        {/* ─────────────────────────────────────────────────── */}
        <g
          ref={travellerGRef}
          transform="translate(160,340)"
          style={{ opacity: 0 }}
          className="will-change-transform"
        >
          <circle r="34" fill="#EAF5F0" opacity="0.75" />
          <circle r="22" fill="#27AB6B" filter="url(#markerShadow)" />
          <circle cx="0" cy="-6" r="6" fill="#FFFFFF" />
          <path d="M -9 11 C -9 4, 9 4, 9 11 Z" fill="#FFFFFF" />
          {/* Verified Badge */}
          <g transform="translate(16,-18)">
            <circle r="9" fill="#34D186" stroke="#FFFFFF" strokeWidth="2" />
            <path
              d="M -3.5 0.5 L -1 3 L 4 -2.5"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>

        {/* ─────────────────────────────────────────────────── */}
        {/* PACKAGE MARKER                                     */}
        {/* ─────────────────────────────────────────────────── */}
        <g
          ref={packageGRef}
          transform="translate(180,740)"
          style={{ opacity: 0 }}
          className="will-change-transform"
        >
          <circle r="22" fill="#FFFFFF" filter="url(#markerShadow)" />
          <rect
            x="-11"
            y="-11"
            width="22"
            height="22"
            rx="4"
            fill="#FFFFFF"
            stroke="#1F2937"
            strokeWidth="2"
          />
          <line x1="-11" y1="0" x2="11" y2="0" stroke="#1F2937" strokeWidth="1.5" />
          <line x1="0" y1="-11" x2="0" y2="11" stroke="#1F2937" strokeWidth="1.5" />
        </g>

        {/* ─────────────────────────────────────────────────── */}
        {/* MICROCOPY CHIPS                                     */}
        {/* ─────────────────────────────────────────────────── */}
        {/* Needs delivery - near Jos */}
        <g
          ref={chipNeedsRef}
          transform="translate(180, 680)"
          style={{ opacity: 0 }}
        >
          <rect x="-64" y="-15" width="128" height="30" rx="15" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" filter="url(#markerShadow)" />
          <text
            x="0" y="5"
            textAnchor="middle"
            style={{ fontSize: "12px", fontWeight: 500, fill: "#4B5563", fontFamily: "Work Sans, sans-serif" }}
          >
            Needs delivery
          </text>
        </g>

        {/* Already going - near traveller */}
        <g
          ref={chipAlreadyRef}
          transform="translate(200, 290)"
          style={{ opacity: 0 }}
        >
          <rect x="-56" y="-15" width="112" height="30" rx="15" fill="#1F2937" filter="url(#markerShadow)" />
          <text
            x="0" y="5"
            textAnchor="middle"
            style={{ fontSize: "12px", fontWeight: 500, fill: "#FFFFFF", fontFamily: "Work Sans, sans-serif" }}
          >
            Already going
          </text>
        </g>

        {/* Same way - at rendezvous under text */}
        <g
          ref={chipSameRef}
          transform="translate(680, 405)"
          style={{ opacity: 0 }}
        >
          <rect x="-48" y="-15" width="96" height="30" rx="15" fill="#EAF5F0" stroke="#63CF9A" strokeWidth="1" filter="url(#markerShadow)" />
          <text
            x="0" y="5"
            textAnchor="middle"
            style={{ fontSize: "12px", fontWeight: 600, fill: "#248A56", fontFamily: "Work Sans, sans-serif" }}
          >
            Same way
          </text>
        </g>

        {/* ─────────────────────────────────────────────────── */}
        {/* DELIVERED BADGE (Safely 160px+ below top navbar)    */}
        {/* ─────────────────────────────────────────────────── */}
        <g
          ref={deliveredRef}
          transform="translate(1240, 240) scale(0.85)"
          style={{ opacity: 0 }}
        >
          <rect
            x="-68" y="-18" width="136" height="36" rx="18"
            fill="#248A56"
            filter="url(#markerShadow)"
          />
          <g transform="translate(-44,0)">
            <circle r="8" fill="#34D186" />
            <path
              d="M -3.5 0.5 L -1 3 L 4 -2.5"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <text
            x="12" y="6"
            textAnchor="middle"
            style={{ fontSize: "14px", fontWeight: 700, fill: "#FFFFFF", fontFamily: "Work Sans, sans-serif", letterSpacing: "0.02em" }}
          >
            Delivered.
          </text>
        </g>
      </svg>
    </div>
  );
}
