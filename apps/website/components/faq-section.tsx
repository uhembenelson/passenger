"use client";

import React, { useEffect, useRef, useState } from "react";

const FAQS = [
  {
    q: "How does the handover actually work?",
    a: "Agree on a meeting point with the traveller. Confirmation codes record collection and delivery, so both sides can follow the handover.",
  },
  {
    q: "What can I send?",
    a: "Declare the contents, weight and value of your parcel. Check the trip's accepted categories and luggage limits before agreeing. Restricted items cannot travel.",
  },
  {
    q: "When does the traveller get paid?",
    a: "The moment the receiver confirms the package arrived. Payment is already held aside, and releases then — everyone sees it happen.",
  },
  {
    q: "What if something goes wrong?",
    a: "Use Report an issue on the delivery to contact support. Keep handover details and evidence in Passenger. Support reviews the circumstances before resolving a dispute.",
  },
  {
    q: "Who can carry for me?",
    a: "Travellers who complete the required identity checks can post their trips. Check their route and available space before choosing someone to carry your parcel.",
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
        className={`landing-faq-layout max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-1000 ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        <div className="mx-auto max-w-3xl text-center">
          <h2
            className="mt-6 font-bold text-[#1F2937] leading-[1.05]"
            style={{
              fontSize: "clamp(2rem, 3.8vw + 0.5rem, 3.25rem)",
              letterSpacing: "-0.03em",
            }}
          >
            Asked and answered.
          </h2>
        </div>

        <div className="mt-16 md:mt-20 mx-auto max-w-3xl border-t border-[#E5E7EB] text-left">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="py-7 md:py-8 border-b border-[#E5E7EB]"
            >
              <summary className="cursor-pointer font-semibold text-[#1F2937] text-lg leading-snug">
                {f.q}
              </summary>
              <p className="mt-2.5 text-[#7A7F87] leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-3xl text-center text-sm text-[#7A7F87]">
          Something else on your mind?{" "}
          <a
            href="mailto:support@usepassenger.com"
            className="font-semibold text-[#248A56] border-b border-[#248A56]/40 hover:border-[#248A56] transition-colors"
          >
            support@usepassenger.com
          </a>
        </p>
      </div>
    </section>
  );
}
