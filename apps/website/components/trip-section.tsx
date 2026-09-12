"use client";

import React, { useEffect, useRef, useState } from "react";
import { RoadStrip } from "./road-strip";

interface TripSectionProps {
  nextSectionRef?: React.RefObject<HTMLElement | null>;
}

export function TripSection({ nextSectionRef }: TripSectionProps) {
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
      id="about"
      className="relative bg-[#FAFAFC] pt-14 md:pt-20"
    >
      <div
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 md:pt-24 pb-24 md:pb-32 text-center transition-all duration-1000 ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#248A56]">
          The idea
        </p>

        <h2
          className="mx-auto mt-6 max-w-4xl font-bold text-[#1F2937] leading-[1.05]"
          style={{
            fontSize: "clamp(2.4rem, 5vw + 0.5rem, 4.25rem)",
            letterSpacing: "-0.033em",
          }}
        >
          The trip was <br className="hidden sm:inline" />
          happening anyway.
        </h2>

        <p className="mx-auto mt-8 max-w-2xl text-[#4B5563] text-lg md:text-xl leading-relaxed">
          Somewhere right now, someone is already heading to that town.
          Passenger finds them — and your package rides along.
        </p>

        <div className="mx-auto mt-16 md:mt-20 max-w-2xl space-y-5 text-left md:text-center">
          <p className="text-[#4B5563] leading-relaxed">
            <span className="font-semibold text-[#1F2937]">
              Accounts are ID-checked.
            </span>{" "}
            You always know who&apos;s carrying your package.
          </p>
          <p className="text-[#4B5563] leading-relaxed">
            <span className="font-semibold text-[#1F2937]">
              Money is held safely.
            </span>{" "}
            Payment releases only when your receiver confirms.
          </p>
          <p className="text-[#4B5563] leading-relaxed">
            <span className="font-semibold text-[#1F2937]">
              You can follow along.
            </span>{" "}
            Quiet updates from hand-off to handover.
          </p>
        </div>

        <div className="mx-auto mt-20 md:mt-28 max-w-2xl pt-14 border-t border-[#E5E7EB]">
          <p className="text-[#7A7F87] text-sm">Travelling somewhere soon?</p>
          <a
            href="#download"
            className="inline-block mt-1.5 text-base font-semibold text-[#248A56] border-b border-[#248A56]/30 hover:border-[#248A56] transition-colors"
          >
            Post your trip
          </a>
        </div>
      </div>

      <RoadStrip sectionRef={rootRef} fadeRef={nextSectionRef} />
    </section>
  );
}