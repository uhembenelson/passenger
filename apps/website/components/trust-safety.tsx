"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

const TRUTHS = [
  {
    label: "Who's carrying it",
    body: "Accounts are ID-checked. Your package travels with a real, verified person — never a random driver or a seller you&apos;ve never heard of.",
  },
  {
    label: "Your money",
    body: "Payment is held before the trip starts, and only releases when your receiver confirms it arrived.",
  },
  {
    label: "The journey",
    body: "Quiet updates from hand-off to handover. You know where your package is and when to expect it.",
  },
];

export function TrustAndSafety() {
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
      id="safety"
      className="relative bg-[#FAFAFC] border-t border-[#E5E7EB]/60 pt-24 md:pt-32 pb-24 md:pb-32 overflow-hidden"
    >
      <div
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-1000 ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-20 gap-y-14">
          {/* Left: the promise */}
          <div className="lg:pr-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#248A56]">
              Trust &amp; safety
            </p>
            <h2
              className="mt-6 font-bold text-[#1F2937] leading-[1.05]"
              style={{
                fontSize: "clamp(2.15rem, 4vw + 0.5rem, 3.5rem)",
                letterSpacing: "-0.03em",
              }}
            >
              You always know who&apos;s carrying it.
            </h2>
            <p className="mt-7 text-[#4B5563] text-lg leading-relaxed max-w-md">
              A package is only ever in the hands of a person you can identify.
              That&apos;s the whole safety model — and it works.
            </p>
          </div>

          {/* Right: the three quiet guarantees */}
          <div>
            <ul className="border-t border-[#E5E7EB]">
              {TRUTHS.map((t) => (
                <li
                  key={t.label}
                  className="py-8 border-b border-[#E5E7EB]"
                >
                  <h3 className="font-semibold text-[#248A56]">{t.label}</h3>
                  <p className="mt-2.5 text-[#4B5563] leading-relaxed">
                    {t.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Closing reassurance */}
        <div className="mx-auto mt-20 md:mt-24 max-w-2xl pt-12 border-t border-[#E5E7EB] text-center">
          <p className="text-[#7A7F87] leading-relaxed">
            The traveller was going that way anyway.
            <br className="hidden sm:inline" />{" "}
            Passenger just makes it safe enough to ride along.
          </p>
          <a
            href="#senders-travellers"
            className="inline-flex items-center gap-1.5 mt-6 text-base font-semibold text-[#248A56] border-b border-[#248A56]/40 hover:border-[#248A56] transition-colors"
          >
            Pick your side
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}