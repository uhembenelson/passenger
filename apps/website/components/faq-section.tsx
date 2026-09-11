"use client";

import React, { useEffect, useRef, useState } from "react";

const FAQS = [
  {
    q: "How does the handover actually work?",
    a: "The traveller confirms who they are. You hand the package over, at a meeting point or from where you are. From there it travels with them, and a quiet update tells you when it&#39;s with the receiver.",
  },
  {
    q: "What can I send?",
    a: "Most things that fit in standard luggage — clothing, gifts, documents, groceries. Sizes, weights and anything restricted are listed right on the traveller&#39;s trip, before you agree.",
  },
  {
    q: "When does the traveller get paid?",
    a: "The moment the receiver confirms the package arrived. Payment is already held aside, and releases then — everyone sees it happen.",
  },
  {
    q: "What if something goes wrong?",
    a: "Both sides are ID-checked, so there is always a real person accountable. And because payment is held until confirmation, nothing settles until the package is where it should be.",
  },
  {
    q: "Who can carry for me?",
    a: "Anyone who&#39;s going that way anyway. Travellers post their own trips — they&#39;re not couriers, just people already heading toward your destination.",
  },
  {
    q: "How do I know it arrived?",
    a: "Hand-off updates at each point, then a final confirmation the moment the receiver has it. No silence, no guessing.",
  },
];

export function FaqSection() {
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
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={rootRef}
      id="faq"
      className="relative bg-[#FAFAFC] border-t border-[#E5E7EB]/60 pt-24 md:pt-32 pb-24 md:pb-32"
    >
      <div
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-1000 ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#248A56]">
            FAQ
          </p>
          <h2
            className="mt-6 font-bold text-[#1F2937] leading-[1.05]"
            style={{
              fontSize: "clamp(2rem, 3.8vw + 0.5rem, 3.25rem)",
              letterSpacing: "-0.03em",
            }}
          >
            Asked and answered.
          </h2>
          <p className="mt-6 text-[#4B5563] text-lg leading-relaxed">
            The questions people usually have, answered plainly.
          </p>
        </div>

        <div className="mt-16 md:mt-20 mx-auto max-w-3xl border-t border-[#E5E7EB] text-left">
          {FAQS.map((f) => (
            <div
              key={f.q}
              className="py-7 md:py-8 border-b border-[#E5E7EB]"
            >
              <h3 className="font-semibold text-[#1F2937] text-lg leading-snug">
                {f.q}
              </h3>
              <p className="mt-2.5 text-[#7A7F87] leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-3xl text-center text-sm text-[#7A7F87]">
          Something else on your mind?{" "}
          <a
            href="mailto:hello@passenger.app"
            className="font-semibold text-[#248A56] border-b border-[#248A56]/40 hover:border-[#248A56] transition-colors"
          >
            hello@passenger.app
          </a>
        </p>
      </div>
    </section>
  );
}