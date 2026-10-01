import React from "react";

interface HeroCopyProps {
  headlineRef?: React.RefObject<HTMLHeadingElement | null>;
}

export function HeroCopy({ headlineRef }: HeroCopyProps) {
  return (
    <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 text-center select-none">
      <h1
        ref={headlineRef}
        className="font-bold tracking-tight text-[#1F2937] leading-[1.04] will-change-transform"
        style={{
          fontSize: "clamp(3.05rem, 7.2vw + 0.25rem, 8rem)",
          letterSpacing: "-0.04em",
        }}
      >
        Send it with someone <br className="hidden sm:inline" />
        already going your way.
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-[#4B5563]">
        Send a parcel between cities with a verified traveller.
        Agree on the handover and follow its journey in Passenger.
      </p>
    </div>
  );
}
