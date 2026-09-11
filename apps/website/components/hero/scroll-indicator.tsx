import React from "react";

interface ScrollIndicatorProps {
  indicatorRef?: React.RefObject<HTMLDivElement | null>;
}

export function ScrollIndicator({ indicatorRef }: ScrollIndicatorProps) {
  return (
    <div
      ref={indicatorRef}
      className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none select-none transition-opacity duration-200"
    >
      <span className="text-[11px] font-medium tracking-widest uppercase text-[#7A7F87]">
        Scroll
      </span>
      <div className="w-[1px] h-6 sm:h-8 bg-[#E5E7EB] overflow-hidden relative">
        <div className="w-full h-1/2 bg-[#34D186] animate-pulse" />
      </div>
    </div>
  );
}
