"use client";

import { useRef } from "react";
import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { TripSection } from "@/components/trip-section";
import { HowItHappens } from "@/components/how-it-happens";
import { TrustAndSafety } from "@/components/trust-safety";
import { FaqSection } from "@/components/faq-section";
import { ClosingCta } from "@/components/closing-cta";
import { Footer } from "@/components/footer";

export default function HomePage() {
  const nextSectionRef = useRef<HTMLElement>(null);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFC]">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <TripSection nextSectionRef={nextSectionRef} />
        <HowItHappens sectionRef={nextSectionRef} />
        <TrustAndSafety />
        <FaqSection />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}