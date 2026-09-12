import React from "react";
import { Button } from "@/components/ui/button";

interface HeroActionsProps {
  actionsRef?: React.RefObject<HTMLDivElement | null>;
}

export function HeroActions({ actionsRef }: HeroActionsProps) {
  return (
    <div
      ref={actionsRef}
      className="mt-8 sm:mt-10 flex flex-row items-center justify-center gap-3 sm:gap-4 will-change-transform"
    >
      <Button
        asChild
        size="default"
        className="h-11 sm:h-12 px-6 sm:px-7 rounded-full bg-[#1F2937] hover:bg-[#111827] text-white font-medium text-sm sm:text-base shadow-sm hover:shadow transition-all cursor-pointer"
      >
        <a href="#senders-travellers">Send something</a>
      </Button>

      <Button
        asChild
        variant="outline"
        size="default"
        className="h-11 sm:h-12 px-6 sm:px-7 rounded-full border-[#D1D5DB] hover:border-[#1F2937] hover:bg-[#F7F7F8] text-[#1F2937] font-medium text-sm sm:text-base bg-white/80 backdrop-blur-xs transition-all cursor-pointer"
      >
        <a href="#how-it-works">I&apos;m travelling</a>
      </Button>
    </div>
  );
}
