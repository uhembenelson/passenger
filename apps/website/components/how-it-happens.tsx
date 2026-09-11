"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

const MOMENTS = [
  {
    title: "A trip is shared",
    body: "Someone already going your way puts their journey up.",
  },
  {
    title: "Your package joins",
    body: "A verified traveller carries it along with their own luggage.",
  },
  {
    title: "It arrives. You settle.",
    body: "The receiver gets it, and payment releases.",
  },
];

const WASH = "#F8F4FB";

interface HowItHappensProps {
  sectionRef?: React.RefObject<HTMLElement | null>;
}

export function HowItHappens({ sectionRef: externalRef }: HowItHappensProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const momentRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const fill = fillRef.current;
    if (!section || !fill) return;

    const settle = () => {
      const bg = bgRef.current;
      if (bg) bg.style.opacity = "1";
      fill.style.width = "100%";
      fill.style.background = "linear-gradient(90deg, #34D186, #248A56)";
      dotRefs.current.forEach((d) => {
        if (d) d.style.backgroundColor = "#34D186";
      });
      momentRefs.current.forEach((m) => {
        if (m) {
          m.style.opacity = "1";
          m.style.transform = "translateY(0)";
        }
      });
    };

    // Reduced motion: settled section, nothing moves.
    if (reduced) {
      settle();
      return;
    }

    let visible = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    io.observe(section);

    let raf = 0;
    let lit = -1;
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const smooth = (t: number) => t * t * (3 - 2 * t);

    const loop = () => {
      if (visible) {
        const rect = section.getBoundingClientRect();
        const vh = window.innerHeight;
        const p = clamp((vh - rect.top) / rect.height);

        fill.style.width = `${p * 100}%`;

        // Lavender wash fades in gently — starting slightly below the section
        // top so the top stays white and blends with the white above.
        const raw = clamp((p - 0.15) / 0.4);
        const bg = bgRef.current;
        if (bg) bg.style.opacity = String(smooth(raw));

        const active = "#34D186";
        const idle = "#D1D5DB";

        const litCount =
          p >= 0.06 ? (p >= 0.4 ? (p >= 0.72 ? 3 : 2) : 1) : 0;
        if (litCount !== lit) {
          lit = litCount;
          for (let i = 0; i < 3; i++) {
            const m = momentRefs.current[i];
            if (m) {
              m.style.opacity = i < litCount ? "1" : "0";
              m.style.transform =
                i < litCount ? "translateY(0)" : "translateY(10px)";
            }
          }
        }
        dotRefs.current.forEach((d, i) => {
          if (d) d.style.backgroundColor = i < litCount ? active : idle;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <section
      ref={(el) => {
        sectionRef.current = el;
        if (externalRef) externalRef.current = el;
      }}
      id="how-it-works"
      className="relative bg-[#FAFAFC] pt-14 md:pt-20 pb-24 md:pb-32 overflow-hidden"
    >
      {/* Lavender wash — fades in with scroll */}
      <div
        ref={bgRef}
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: WASH, opacity: 0 }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#248A56]">
            The whole thing
          </p>
          <h2
            className="mt-5 font-bold text-[#1F2937] leading-[1.05]"
            style={{
              fontSize: "clamp(2.15rem, 4.5vw + 0.5rem, 3.75rem)",
              letterSpacing: "-0.03em",
            }}
          >
            It happens like this.
          </h2>
          <p className="mt-6 text-[#4B5563] text-lg leading-relaxed max-w-xl">
            Three quiet things happen. Everything else is Passenger&apos;s.
          </p>
        </div>

        {/* Journey line */}
        <div className="mt-16 md:mt-24 max-w-4xl">
          <div className="relative">
            <div className="absolute inset-x-0 top-2 h-px bg-[#E5E7EB]" />
            <div
              ref={fillRef}
              className="absolute left-0 top-2 h-[3px] -translate-y-[1px] rounded-full"
              style={{
                width: 0,
                background: "linear-gradient(90deg, #34D186, #248A56)",
              }}
            />

            <div className="grid grid-cols-3">
              {MOMENTS.map((_, i) => (
                <div key={String(i)} className="flex justify-center">
                  <span
                    ref={(el) => {
                      dotRefs.current[i] = el;
                    }}
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: "#D1D5DB" }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-9 md:mt-10 grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-10 text-center md:text-left">
            {MOMENTS.map((m, i) => (
              <div
                key={m.title}
                ref={(el) => {
                  momentRefs.current[i] = el;
                }}
                className="transition-all duration-500"
                style={{ opacity: 0, transform: "translateY(10px)" }}
              >
                <h3 className="font-semibold text-[#1F2937]">{m.title}</h3>
                <p className="mt-2.5 text-[#7A7F87] leading-relaxed">
                  {m.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Two doors */}
        <div
          id="senders-travellers"
          className="mt-20 md:mt-28 max-w-4xl mx-auto border-t border-[#E5E7EB] pt-12 md:pt-14"
        >
          <p className="text-center text-sm text-[#7A7F87]">
            Only two doors. Pick yours.
          </p>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 sm:divide-x">
            <div className="pb-8 sm:pr-10 sm:pb-0">
              <p className="text-lg font-semibold text-[#1F2937]">
                You&apos;re sending
              </p>
              <a
                href="#"
                className="inline-flex items-center gap-1.5 mt-2 text-base font-semibold text-[#248A56] border-b border-[#248A56]/40 hover:border-[#248A56]"
              >
                Send something
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
            <div className="sm:pl-10">
              <p className="text-lg font-semibold text-[#1F2937]">
                You&apos;re travelling
              </p>
              <a
                href="#"
                className="inline-flex items-center gap-1.5 mt-2 text-base font-semibold text-[#248A56] border-b border-[#248A56]/40 hover:border-[#248A56]"
              >
                I&apos;m travelling
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}