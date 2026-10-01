"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const StoryPhone = dynamic(() => import("./story-phone").then(module => module.StoryPhone), { ssr: false });

export function PassengerPhoneStage() {
  const host = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState<[number, number, number]>([0.04, -0.2, -0.12]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!host.current) return;
      if (reduced.matches) { setRotation([0, 0, 0]); return; }
      const rect = host.current.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (window.innerHeight + rect.height)));
      const turn = Math.max(0, Math.min(1, (progress - 0.08) / 0.35));
      const eased = turn * turn * (3 - 2 * turn);
      setRotation([0.04, Math.PI * 2 * eased - 0.2, -0.12 + eased * 0.2]);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
    };
  }, []);
  return <div ref={host} className="passenger-phone-stage">
    <StoryPhone screenSrc="/media/trips-poster.webp" videoSrc="/media/passenger-app.mp4" rotation={rotation} perspective label="Passenger app showing real home and trip history" />
  </div>;
}
