"use client";

import React, { useEffect, useRef, useState } from "react";
import { HeroCopy } from "./hero-copy";
import { HeroActions } from "./hero-actions";
import { ScrollIndicator } from "./scroll-indicator";
import { JourneyStory, JourneyStoryRef } from "./journey-story";
import { ReducedMotionHero } from "./reduced-motion-hero";

export function Hero() {
  const containerRef   = useRef<HTMLDivElement>(null);
  const textOverlayRef = useRef<HTMLDivElement>(null);
  const indicatorRef   = useRef<HTMLDivElement>(null);
  const storyRef       = useRef<JourneyStoryRef>(null);

  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    let currentProgress = 0;
    let animId: number;

    // Visibility & Interaction state
    let isHeroInView = true;
    let lastUserInteractionTime = 0;
    let autoStartTime = 0;

    // IntersectionObserver to ensure auto-scroll runs ONLY when hero is in view
    const observer = new IntersectionObserver(
      ([entry]) => {
        isHeroInView = entry.isIntersecting;
      },
      { threshold: 0.05 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    const onUserInteract = () => {
      lastUserInteractionTime = performance.now();
      autoStartTime = 0;
    };

    window.addEventListener("scroll", onUserInteract, { passive: true });
    window.addEventListener("wheel", onUserInteract, { passive: true });
    window.addEventListener("touchmove", onUserInteract, { passive: true });
    window.addEventListener("touchstart", onUserInteract, { passive: true });
    window.addEventListener("keydown", onUserInteract, { passive: true });

    const calculateManualTarget = () => {
      if (!containerRef.current) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const totalScrollable = rect.height - window.innerHeight;
      const currentScroll = -rect.top;
      return Math.min(
        Math.max(currentScroll / (totalScrollable || 1), 0),
        1
      );
    };

    const render = (now: number) => {
      const scrollY = window.scrollY;
      const manualProgress = calculateManualTarget();

      // Auto-scroll runs ONLY when:
      // 1. Hero is in view
      // 2. User is at top of page (scrollY < 20px)
      // 3. User is idle (no touch/scroll for > 1500ms)
      const isIdle = (now - lastUserInteractionTime) > 1500;
      const shouldAutoPlay = isHeroInView && scrollY < 20 && isIdle;

      if (shouldAutoPlay) {
        if (autoStartTime === 0) {
          autoStartTime = now;
        }
        const elapsed = now - autoStartTime;
        const PERIOD = 30000; // 30-second complete loop (15s forward journey)

        // Smooth sinusoidal auto-demonstration
        const targetAutoP = 0.5 * (1 - Math.cos((2 * Math.PI * elapsed) / PERIOD));
        const diff = targetAutoP - currentProgress;
        currentProgress += diff * 0.1;
      } else {
        autoStartTime = 0;
        // When user scrolls themselves: 100% DIRECT, INSTANT 1:1 CONTROL!
        // No auto-speed restriction, tracks manual scroll immediately with zero lag
        currentProgress = manualProgress;
      }

      const p = currentProgress;

      /* ── Text Overlay: Directly proportional from p = 0 to destination ── */
      if (textOverlayRef.current) {
        const travelProg = Math.min(p / 0.88, 1);
        const translateY = -380 * travelProg;
        const opacity = Math.max(0, 1 - travelProg);

        textOverlayRef.current.style.transform = `translate3d(0, ${translateY}px, 0)`;
        textOverlayRef.current.style.opacity = `${opacity}`;
        textOverlayRef.current.style.pointerEvents = opacity < 0.1 ? "none" : "auto";
      }

      /* ── Scroll indicator removal ── */
      if (indicatorRef.current) {
        const pInd = Math.min(p / 0.05, 1);
        indicatorRef.current.style.opacity = `${1 - pInd}`;
      }

      /* ── Journey Story Canvas ── */
      if (storyRef.current) {
        storyRef.current.updateProgress(p);
      }

      animId = window.requestAnimationFrame(render);
    };

    currentProgress = calculateManualTarget();
    animId = window.requestAnimationFrame(render);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onUserInteract);
      window.removeEventListener("wheel", onUserInteract);
      window.removeEventListener("touchmove", onUserInteract);
      window.removeEventListener("touchstart", onUserInteract);
      window.removeEventListener("keydown", onUserInteract);
      window.cancelAnimationFrame(animId);
    };
  }, [reducedMotion]);

  if (reducedMotion) {
    return <ReducedMotionHero />;
  }

  return (
    <section
      ref={containerRef}
      className="relative w-full h-[450vh] bg-[#FAFAFC]"
    >
      {/* Pinned 100vh viewport container */}
      <div className="sticky top-0 h-screen w-full overflow-hidden select-none">
        {/* Full Viewport Journey Canvas (Z-0) */}
        <div className="absolute inset-0 w-full h-full z-0 flex items-center justify-center">
          <JourneyStory storyRef={storyRef} />
        </div>

        {/* Text Overlay (Z-10) — sits above the canvas with pure GPU transform */}
        <div
          ref={textOverlayRef}
          className="relative z-10 w-full h-full flex flex-col items-center justify-start pt-16 sm:pt-24 md:pt-32 pointer-events-none will-change-transform"
        >
          <div className="pointer-events-auto">
            <HeroCopy />
          </div>
          <div className="pointer-events-auto">
            <HeroActions />
          </div>
        </div>

        {/* Bottom Scroll Cue */}
        <ScrollIndicator indicatorRef={indicatorRef} />
      </div>
    </section>
  );
}
