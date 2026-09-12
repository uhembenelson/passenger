"use client";

import React, { useEffect, useRef, useState } from "react";
import { Apple, Play } from "lucide-react";

const STORES = [
  {
    icon: Apple,
    top: "Download on the",
    bottom: "App Store",
  },
  {
    icon: Play,
    top: "Get it on",
    bottom: "Google Play",
  },
];

export function ClosingCta() {
  const rootRef = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={rootRef}
      id="download"
      className="relative bg-[#FAFAFC] pt-24 md:pt-32 pb-24 md:pb-32 overflow-hidden"
    >
      <div
        className={`max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center transition-all duration-1000 ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#248A56]">
          Get the app
        </p>
        <h2
          className="mt-6 font-bold text-[#1F2937] leading-[1.05]"
          style={{
            fontSize: "clamp(2.2rem, 4.6vw + 0.5rem, 4rem)",
            letterSpacing: "-0.035em",
          }}
        >
          Send it with someone
          <br />
          already going your way.
        </h2>
        <p className="mx-auto mt-7 max-w-xl text-[#4B5563] text-lg leading-relaxed">
          Post a trip or send a package — from your phone, in a couple of
          minutes.
        </p>

        {/* Two doors */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="#senders-travellers"
            className="h-12 px-7 rounded-full bg-[#1F2937] hover:bg-[#111827] text-white font-medium text-base shadow-sm inline-flex items-center justify-center transition-colors"
          >
            Send something
          </a>
          <a
            href="#senders-travellers"
            className="h-12 px-7 rounded-full border border-[#D1D5DB] hover:border-[#1F2937] hover:bg-[#F7F7F8] text-[#1F2937] font-medium text-base bg-white inline-flex items-center justify-center transition-colors"
          >
            I&apos;m travelling
          </a>
        </div>

        {/* Store badges */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-3">
          {STORES.map((s) => (
            <a
              key={s.bottom}
              href="#download"
              className="inline-flex items-center gap-3 rounded-xl border border-[#D1D5DB] bg-white px-5 py-2.5 text-left shadow-xs transition-colors hover:border-[#1F2937]"
            >
              <s.icon className="w-6 h-6 text-[#1F2937]" />
              <span className="leading-tight">
                <span className="block text-[10px] text-[#7A7F87] uppercase tracking-wide">
                  {s.top}
                </span>
                <span className="block text-sm font-semibold text-[#1F2937]">
                  {s.bottom}
                </span>
              </span>
            </a>
          ))}
        </div>

        <p className="mt-8 text-sm text-[#7A7F87]">
          iPhone and Android. Sending a package never felt ordinary.
        </p>
      </div>
    </section>
  );
}