import React from "react";
import Link from "next/link";
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
        className="h-11 sm:h-12 px-6 sm:px-7 rounded-full bg-[#34D186] hover:bg-[#2FA968] text-white font-medium text-sm sm:text-base shadow-sm hover:shadow transition-all cursor-pointer"
      >
        <Link href="/waitlist">Join our wait list</Link>
      </Button>
    </div>
  );
}
