"use client";

import React, { useEffect, useRef, useState } from "react";

interface RoadStripProps {
  sectionRef?: React.RefObject<HTMLElement | null>;
  fadeRef?: React.RefObject<HTMLElement | null>;
}

export function RoadStrip({ sectionRef, fadeRef }: RoadStripProps) {
  const roadRef = useRef<HTMLDivElement>(null);
  const carRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const road = roadRef.current;
    const car = carRef.current;
    const host = sectionRef?.current ?? road;
    if (!road || !car || !host) return;

    let visible = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    io.observe(host);

    let raf = 0;
    const loop = () => {
      if (visible) {
        // Progress is driven by the section's passage through the viewport,
        // not the road's (the road is pinned to the viewport base).
        // 0 = section just entering from below; 1 = section bottom hits the
        // viewport bottom (the section is fully scrolled past).
        const rect = host.getBoundingClientRect();
        const vh = window.innerHeight;
        const p = Math.max(0, Math.min(1, (vh - rect.top) / rect.height));

        const carW = car.offsetWidth;
        const roadW = road.clientWidth;
        const xStart = roadW - carW - 24;
        const xEnd = -24;
        car.style.transform = `translate3d(${xStart + (xEnd - xStart) * p}px, 0, 0)`;

        // Fade the road out as "The whole thing" section enters from below.
        // Starts the instant its top crosses the viewport bottom and finishes
        // ~200px in — so the road stays fully visible until that section
        // actually begins to slide over it.
        const next = fadeRef?.current;
        if (next) {
          const nr = next.getBoundingClientRect();
          const fade = Math.max(0, Math.min(1, 1 - (vh - nr.top) / 200));
          road.style.opacity = String(fade);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduced, sectionRef, fadeRef]);

  return (
    <div
      ref={roadRef}
      className="sticky bottom-0 z-10 w-full h-24 md:h-28 bg-[#F8F4FB] overflow-hidden"
      aria-hidden="true"
    >
      {/* Shoulder lines */}
      <div className="absolute inset-x-0 top-2.5 h-px bg-[#2D362F]/10" />
      <div className="absolute inset-x-0 bottom-2.5 h-px bg-[#2D362F]/10" />

      {/* Dashed centre line */}
      <div className="absolute inset-x-0 top-1/2 border-t-4 border-dashed border-[#2D362F]/15" />

      {/* Car — position is driven by section scroll progress */}
      <div
        ref={carRef}
        className="absolute left-0 will-change-transform"
        style={{ top: "50%", marginTop: -28 }}
      >
        <svg
          width="140"
          height="56"
          viewBox="0 0 140 56"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Soft ground shadow */}
          <ellipse cx="70" cy="49" rx="62" ry="6" fill="#000000" opacity="0.18" />

          {/* Body silhouette (facing left) */}
          <path
            d="M 20 41 H 9 C 5 41, 3 37, 5 33 L 12 26 C 17 21, 25 19, 31 19 L 44 16 C 52 11, 66 10, 76 13 L 100 16 C 112 18, 120 23, 126 29 L 131 34 C 135 37, 134 42, 129 43 L 22 43 Z"
            fill="#183E32"
          />

          {/* Cabin glass */}
          <path
            d="M 42 28 L 50 17 C 56 14, 66 13, 74 15 L 98 17 L 102 28 Z"
            fill="#EAF5F0"
            opacity="0.9"
          />

          {/* Accent line */}
          <path
            d="M 16 35 L 124 35"
            stroke="#34D186"
            strokeOpacity="0.75"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Headlight (front, left) */}
          <rect x="5" y="28" width="5" height="4" rx="1.5" fill="#D8ED93" />

          {/* Tail light (rear, right) */}
          <rect x="130" y="30" width="5" height="4" rx="1.5" fill="#FFFFFF" opacity="0.85" />

          {/* Wheels */}
          <circle cx="38" cy="43" r="9" fill="#1F2937" />
          <circle cx="38" cy="43" r="3.5" fill="#7A7F87" />
          <circle cx="104" cy="43" r="9" fill="#1F2937" />
          <circle cx="104" cy="43" r="3.5" fill="#7A7F87" />
        </svg>
      </div>
    </div>
  );
}