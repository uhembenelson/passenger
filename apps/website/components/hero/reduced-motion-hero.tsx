import React from "react";
import { Button } from "@/components/ui/button";
import { Package, UserCheck, CheckCircle2, ArrowRight } from "lucide-react";

export function ReducedMotionHero() {
  return (
    <section className="relative w-full py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-[#FAFAFC] border-b border-[#F3F3F3]">
      <div className="max-w-4xl mx-auto text-center">
        <h1
          className="font-bold tracking-tight text-[#1F2937] leading-[1.04]"
          style={{
            fontSize: "clamp(2.4rem, 6vw + 0.5rem, 5rem)",
            letterSpacing: "-0.035em",
          }}
        >
          Send it with someone <br className="hidden sm:inline" />
          already going your way.
        </h1>

        <div className="mt-8 flex flex-row items-center justify-center gap-4">
          <Button
            asChild
            className="h-12 px-7 rounded-full bg-[#1F2937] hover:bg-[#111827] text-white font-medium text-base shadow-sm"
          >
            <a href="#senders-travellers">Send something</a>
          </Button>

          <Button
            asChild
            variant="outline"
            className="h-12 px-7 rounded-full border-[#D1D5DB] hover:bg-[#F7F7F8] text-[#1F2937] font-medium text-base bg-white"
          >
            <a href="#how-it-works">I&apos;m travelling</a>
          </Button>
        </div>

        {/* Static accessible narrative */}
        <div className="mt-16 pt-12 border-t border-[#E5E7EB] grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="p-5 rounded-2xl bg-white border border-[#E5E7EB]/80 shadow-xs flex flex-col gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F5F4F7] text-[#1F2937] flex items-center justify-center">
              <Package className="w-5 h-5 text-[#248A56]" />
            </div>
            <div>
              <span className="text-xs font-semibold text-[#7A7F87] uppercase tracking-wider">
                Package
              </span>
              <h3 className="text-base font-semibold text-[#1F2937] mt-0.5">
                Something needs to go
              </h3>
              <p className="text-sm text-[#4B5563] mt-1">
                Your package is ready at the origin city waiting for transit.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-[#E5E7EB]/80 shadow-xs flex flex-col gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EAF5F0] text-[#248A56] flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-[#27AB6B] uppercase tracking-wider">
                Traveller
              </span>
              <h3 className="text-base font-semibold text-[#1F2937] mt-0.5">
                Already going your way
              </h3>
              <p className="text-sm text-[#4B5563] mt-1">
                A verified traveller heading there takes the parcel along.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-[#E5E7EB]/80 shadow-xs flex flex-col gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EAF5F0] text-[#248A56] flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-[#248A56] uppercase tracking-wider">
                Delivered
              </span>
              <h3 className="text-base font-semibold text-[#1F2937] mt-0.5">
                Arrives safely
              </h3>
              <p className="text-sm text-[#4B5563] mt-1">
                Handed over securely at the destination with OTP confirmation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
