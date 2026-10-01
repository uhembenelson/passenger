"use client";

import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { FaqSection } from "@/components/faq-section";
import { Footer } from "@/components/footer";
import { LandingStory, LandingClosing } from "@/components/landing-story";

export default function HomePage() {

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFC]">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <LandingStory />
        <FaqSection />
        <LandingClosing />
      </main>
      <Footer />
    </div>
  );
}
