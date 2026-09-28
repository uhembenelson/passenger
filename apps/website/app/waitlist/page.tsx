"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Check, ArrowLeft, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JourneyStory, JourneyStoryRef } from "@/components/hero/journey-story";

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT - Abuja", "Gombe", "Imo",
  "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa",
  "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba",
  "Yobe", "Zamfara",
];

type Step = "name" | "email" | "state";

const STEP_CONFIG: Record<Step, { placeholder: string; buttonLabel: string }> = {
  name:  { placeholder: "What's your name?", buttonLabel: "Next" },
  email: { placeholder: "you@wherever.com", buttonLabel: "Almost done" },
  state: { placeholder: "Select your state", buttonLabel: "I'm in" },
};

const STEPS: Step[] = ["name", "email", "state"];

export default function WaitlistPage() {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Custom state dropdown controls
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [stateSearch, setStateSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Background journey animation ref
  const storyRef = useRef<JourneyStoryRef>(null);

  // Auto-play the journey animation softly in the background
  useEffect(() => {
    let animId: number;
    const startTime = performance.now();
    const PERIOD = 28000; // 28s smooth loop

    const render = (now: number) => {
      const elapsed = now - startTime;
      const progress = 0.5 * (1 - Math.cos((2 * Math.PI * elapsed) / PERIOD));
      if (storyRef.current) {
        storyRef.current.updateProgress(progress);
      }
      animId = window.requestAnimationFrame(render);
    };

    animId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animId);
  }, []);

  // Close custom dropdown on outside click or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Auto-focus search input when state dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      searchInputRef.current?.focus();
    } else {
      setStateSearch("");
    }
  }, [dropdownOpen]);

  const currentValue = step === "name" ? name : step === "email" ? email : state;
  const isValid = currentValue.trim().length > 0;
  const config = STEP_CONFIG[step];

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    const currentIndex = STEPS.indexOf(step);
    if (currentIndex < STEPS.length - 1) {
      setStep(STEPS[currentIndex + 1]);
    } else {
      setSubmitted(true);
    }
  };

  const filteredStates = NIGERIAN_STATES.filter((s) =>
    s.toLowerCase().includes(stateSearch.toLowerCase())
  );

  return (
    <div className="relative min-h-screen flex flex-col bg-[#FAFAFC] overflow-hidden select-none">
      {/* ── Background Journey Animation (Reused from Hero) ── */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
        <JourneyStory storyRef={storyRef} />
      </div>

      {/* ── Minimal top bar ── */}
      <header className="relative z-10 w-full px-6 sm:px-10 py-6 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight text-[#1F2937] uppercase">
          Passenger
        </Link>
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-medium text-[#6B7280] hover:text-[#1F2937] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back home
        </Link>
      </header>

      {/* ── Main content — vertically centered ── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-5 sm:px-10 py-8">
        <div className="w-full max-w-2xl flex flex-col items-center text-center gap-10 sm:gap-12">
          {!submitted ? (
            <>
              {/* Tagline */}
              <div className="flex flex-col gap-5 sm:gap-6">
                <h1
                  className="font-bold tracking-tight text-[#1F2937] leading-[1.04]"
                  style={{
                    fontSize: "clamp(2.2rem, 7vw + 0.25rem, 7rem)",
                    letterSpacing: "-0.04em",
                  }}
                >
                  <span className="whitespace-nowrap">We&apos;re cooking</span>
                  <br />
                  <span className="whitespace-nowrap">something good.</span>
                </h1>
                <p
                  className="text-[#4B5563] leading-[1.35] max-w-xl mx-auto font-medium"
                  style={{
                    fontSize: "clamp(1.05rem, 2vw + 0.15rem, 1.45rem)",
                  }}
                >
                  A new way to send things with real people already heading where your package needs to go.
                </p>
              </div>

              {/* Single-input flow with customized pill form */}
              <div className="w-full max-w-md flex flex-col items-center gap-3">
                <form
                  onSubmit={handleNext}
                  className="relative w-full flex items-center bg-white/90 backdrop-blur-md rounded-full p-1.5 border border-[#E5E7EB] shadow-sm hover:shadow-md transition-all focus-within:border-[#1F2937] focus-within:shadow-md"
                >
                  {step === "state" ? (
                    <div ref={dropdownRef} className="relative flex-1">
                      {/* Custom dropdown trigger */}
                      <button
                        type="button"
                        onClick={() => setDropdownOpen((prev) => !prev)}
                        className="w-full h-12 px-5 flex items-center justify-between text-left text-base bg-transparent border-none outline-none cursor-pointer"
                      >
                        <span className={state ? "text-[#1F2937] font-medium" : "text-[#9CA3AF]"}>
                          {state || config.placeholder}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-[#6B7280] transition-transform duration-200 ${
                            dropdownOpen ? "rotate-180 text-[#1F2937]" : ""
                          }`}
                        />
                      </button>

                      {/* Customized Floating Dropdown Menu */}
                      {dropdownOpen && (
                        <div className="absolute left-0 bottom-full mb-3 w-full bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl p-2 z-50 text-left animate-in fade-in zoom-in-95 duration-150">
                          {/* Search bar inside dropdown */}
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#F3F4F6] mb-1">
                            <Search className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                            <input
                              ref={searchInputRef}
                              type="text"
                              value={stateSearch}
                              onChange={(e) => setStateSearch(e.target.value)}
                              placeholder="Search state..."
                              className="w-full bg-transparent text-sm text-[#1F2937] placeholder:text-[#9CA3AF] border-none outline-none"
                            />
                          </div>

                          {/* Scrollable states list */}
                          <div className="max-h-56 overflow-y-auto overscroll-contain py-1 space-y-0.5">
                            {filteredStates.length > 0 ? (
                              filteredStates.map((s) => {
                                const isSelected = state === s;
                                return (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => {
                                      setState(s);
                                      setDropdownOpen(false);
                                    }}
                                    className={`w-full px-3 py-2.5 rounded-xl text-sm flex items-center justify-between text-left transition-colors cursor-pointer ${
                                      isSelected
                                        ? "bg-[#EAF5F0] text-[#248A56] font-semibold"
                                        : "text-[#374151] hover:bg-[#F9FAFB] hover:text-[#111827]"
                                    }`}
                                  >
                                    <span>{s}</span>
                                    {isSelected && <Check className="w-4 h-4 text-[#248A56]" />}
                                  </button>
                                );
                              })
                            ) : (
                              <p className="px-3 py-4 text-xs text-[#9CA3AF] text-center">
                                No state found
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <input
                      type={step === "email" ? "email" : "text"}
                      placeholder={config.placeholder}
                      required
                      autoFocus
                      value={step === "name" ? name : email}
                      onChange={(e) =>
                        step === "name"
                          ? setName(e.target.value)
                          : setEmail(e.target.value)
                      }
                      className="flex-1 bg-transparent border-none outline-none ring-0 focus:ring-0 focus:outline-none px-5 text-[#1F2937] placeholder:text-[#9CA3AF] text-base h-12 w-full"
                    />
                  )}

                  <Button
                    type="submit"
                    disabled={!isValid}
                    className="h-11 px-6 rounded-full bg-[#1F2937] hover:bg-[#111827] text-white font-medium text-sm shrink-0 disabled:bg-[#D1D5DB] transition-colors gap-2 cursor-pointer"
                  >
                    {config.buttonLabel}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>

                <p className="text-[#9CA3AF] text-xs">
                  No spam. Just the good stuff.
                </p>
              </div>
            </>
          ) : (
            /* Success state */
            <div className="flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-16 h-16 rounded-full bg-[#ECFDF5] flex items-center justify-center">
                <Check className="w-8 h-8 text-[#34D186]" />
              </div>
              <div className="flex flex-col gap-3">
                <h1
                  className="font-bold tracking-tight text-[#1F2937] leading-[1.08]"
                  style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", letterSpacing: "-0.03em" }}
                >
                  You&apos;re in, {name.split(" ")[0]}.
                </h1>
                <p className="text-[#6B7280] text-base sm:text-lg leading-relaxed max-w-sm mx-auto">
                  We&apos;ll hit you up when things are ready in <span className="text-[#1F2937] font-semibold">{state}</span>. Keep an eye on <span className="text-[#1F2937] font-medium">{email}</span>.
                </p>
              </div>
              <Link
                href="/"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#1F2937] hover:text-[#34D186] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to the homepage
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* ── Minimal footer ── */}
      <footer className="relative z-10 px-6 sm:px-10 py-8 text-center">
        <p className="text-[#9CA3AF] text-xs">
          &copy; {new Date().getFullYear()} Passenger · Lagos, Nigeria
        </p>
      </footer>
    </div>
  );
}
