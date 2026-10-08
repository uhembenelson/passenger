"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Check, ArrowLeft, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT - Abuja", "Gombe", "Imo",
  "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa",
  "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba",
  "Yobe", "Zamfara",
];

type Step = "name" | "email" | "state";

const STEP_CONFIG: Record<Step, { placeholder: string; buttonLabel: string }> = {
  name: { placeholder: "What's your name?", buttonLabel: "Next" },
  email: { placeholder: "you@wherever.com", buttonLabel: "Almost done" },
  state: { placeholder: "Select your state", buttonLabel: "I'm in" },
};

const STEPS: Step[] = ["name", "email", "state"];

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t));
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function Parcel({
  x,
  y,
  highlight = false,
  scale = 1,
}: {
  x: number;
  y: number;
  highlight?: boolean;
  scale?: number;
}) {
  const stroke = highlight ? "#1F2937" : "#34D186";
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect width="44" height="36" rx="8" fill="#FAFAFC" stroke={stroke} strokeWidth="2" />
      <line x1="22" y1="6" x2="22" y2="30" stroke={stroke} strokeWidth="1.4" />
      <line x1="8" y1="18" x2="36" y2="18" stroke={stroke} strokeWidth="1.4" />
    </g>
  );
}

function Person({
  x,
  facing = 1,
  walking = false,
  phase = 0,
  tone = "traveller",
}: {
  x: number;
  facing?: 1 | -1;
  walking?: boolean;
  phase?: number;
  tone?: "traveller" | "sender";
}) {
  const stroke = tone === "traveller" ? "#1F2937" : "#248A56";
  const stride = walking ? Math.sin(phase * Math.PI * 2) * 6 : 0;
  return (
    <g transform={`translate(${x} 0) scale(${facing} 1)`}>
      <circle cx="0" cy="118" r="14" fill="#FAFAFC" stroke={stroke} strokeWidth="2" />
      <rect x="-16" y="134" width="32" height="46" rx="12" fill="#FAFAFC" stroke={stroke} strokeWidth="2" />
      <line x1="-8" y1="184" x2={-10 - stride} y2="218" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="8" y1="184" x2={10 + stride} y2="218" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="-16" y1="148" x2={-28 - stride * 0.4} y2="168" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="148" x2={26 + stride * 0.35} y2="166" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

/**
 * Person A comes from the left with the parcel.
 * Person B waits. At the meet, A hands over, walks back left.
 * B continues right with the parcel.
 */
function JourneyAtmosphere() {
  const [t, setT] = useState(0.42);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion.current) {
      setT(0.44);
      return;
    }
    let frame = 0;
    let start = 0;
    const duration = 16000;
    const tick = (now: number) => {
      if (!start) start = now;
      setT(((now - start) % duration) / duration);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const meetX = 600;
  const aStartX = 90;
  const aMeetX = meetX - 36;
  const bWaitX = meetX + 56;
  const bEndX = 1140;

  // Person A: arrives with parcel → handover → returns left
  let aX: number;
  let aFacing: 1 | -1 = 1;
  let aWalking = false;
  let aOpacity = 1;
  if (t < 0.36) {
    aX = lerp(aStartX, aMeetX, easeInOut(t / 0.36));
    aFacing = 1;
    aWalking = true;
  } else if (t < 0.5) {
    aX = aMeetX;
    aFacing = 1;
  } else {
    const back = easeInOut((t - 0.5) / 0.5);
    aX = lerp(aMeetX, aStartX, back);
    aFacing = -1;
    aWalking = true;
    aOpacity = lerp(1, 0.3, back);
  }

  // Person B: waits → receives → continues right with parcel
  let bX: number;
  let bFacing: 1 | -1 = -1;
  let bWalking = false;
  if (t < 0.5) {
    bX = bWaitX;
    bFacing = -1;
  } else {
    bX = lerp(bWaitX, bEndX, easeInOut((t - 0.5) / 0.5));
    bFacing = 1;
    bWalking = true;
  }

  const approaching = t < 0.36;
  const handingOver = t >= 0.36 && t < 0.5;
  const continuing = t >= 0.5;
  const walkPhase = reducedMotion.current ? 0 : t * 10;

  // Parcel: with A → pass to B → travels with B
  let parcelX: number;
  let parcelY = 162;
  let parcelHighlight = false;
  const parcelWithA = aX + 28;
  if (t < 0.38) {
    parcelX = parcelWithA;
  } else if (t < 0.48) {
    const p = easeInOut((t - 0.38) / 0.1);
    parcelX = lerp(parcelWithA, bWaitX - 52, p);
    parcelY = lerp(162, 150, Math.sin(p * Math.PI));
    parcelHighlight = true;
  } else {
    parcelX = continuing ? bX + 28 : bWaitX - 52;
    parcelY = 160;
    parcelHighlight = continuing;
  }

  const pathDash = reducedMotion.current ? 0 : t * 240;

  // Caption timing is independent so the middle line can be read
  const beat =
    t < 0.28
      ? "Someone is already travelling the route your parcel needs"
      : t < 0.62
        ? "Passenger connects that journey with someone who needs to send"
        : "The sender goes home. The parcel keeps moving on a trip already happening";

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#FAFAFC_0%,#FAFAFC_45%,#F2F6F3_78%,#EEF4F0_100%)]" />
      {/* Scene above the footer; caption sits under the road */}
      <div className="absolute inset-x-0 bottom-14 flex w-full flex-col sm:bottom-16">
        <div className="h-[min(36vh,340px)] w-full">
          <svg className="h-full w-full" viewBox="0 0 1200 260" preserveAspectRatio="xMidYMax meet" fill="none">
            <line x1="40" y1="230" x2="1160" y2="230" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />
            <line
              x1="40"
              y1="230"
              x2="1160"
              y2="230"
              stroke="#34D186"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="14 16"
              strokeDashoffset={-pathDash}
            />
            <circle cx="70" cy="230" r="5" fill="#EAF5F0" stroke="#34D186" strokeWidth="1.75" />
            <circle cx={meetX} cy="230" r={handingOver ? 8 : 5} fill="#EAF5F0" stroke="#1F2937" strokeWidth="1.75" />
            <circle cx="1130" cy="230" r="5" fill="#EAF5F0" stroke="#34D186" strokeWidth="1.75" />

            {handingOver ? (
              <circle cx={meetX} cy="170" r="54" fill="#34D186" opacity="0.08" />
            ) : null}

            <g opacity={aOpacity}>
              <Person
                x={aX}
                facing={aFacing}
                walking={aWalking}
                phase={walkPhase}
                tone="traveller"
              />
            </g>

            <Person
              x={bX}
              facing={bFacing}
              walking={bWalking}
              phase={walkPhase}
              tone="sender"
            />
            {approaching ? (
              <circle cx={bWaitX + 26} cy={128} r="3.5" fill="#34D186" className="waitlist-need-pulse" />
            ) : null}

            <Parcel
              x={parcelX}
              y={parcelY}
              highlight={parcelHighlight}
              scale={handingOver ? 1.08 : 1}
            />
          </svg>
        </div>
        <p className="px-4 pb-1 pt-1 text-center text-xs font-medium text-[#6B7280] sm:text-sm">
          {beat}
        </p>
      </div>
    </div>
  );
}

export default function WaitlistPage() {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [ready, setReady] = useState(false);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [stateSearch, setStateSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

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

  useEffect(() => {
    if (dropdownOpen) {
      searchInputRef.current?.focus();
    } else {
      setStateSearch("");
    }
  }, [dropdownOpen]);

  useEffect(() => {
    setFieldError("");
    setDropdownOpen(false);
    if (step !== "state") {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [step]);

  const currentValue = step === "name" ? name : step === "email" ? email : state;
  const config = STEP_CONFIG[step];
  const stepIndex = STEPS.indexOf(step);

  const isValid =
    step === "email"
      ? isValidEmail(email)
      : currentValue.trim().length > 0;

  const goBack = () => {
    if (stepIndex <= 0 || submitting) return;
    setSubmitError("");
    setFieldError("");
    setStep(STEPS[stepIndex - 1]);
  };

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitError("");

    if (step === "email" && !isValidEmail(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    if (!isValid) {
      setFieldError(
        step === "state" ? "Choose the state you’re based in." : "This field is required."
      );
      return;
    }
    setFieldError("");

    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1]);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, state }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(result?.error || "We could not add you right now. Please try again.");
      }
      setSubmitted(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "We could not add you right now. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filteredStates = NIGERIAN_STATES.filter((s) =>
    s.toLowerCase().includes(stateSearch.toLowerCase())
  );

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#EEF4F0] select-none">
      <JourneyAtmosphere />

      <header className="relative z-10 flex w-full items-center justify-between px-6 py-6 sm:px-10">
        <Link
          href="/"
          className="text-sm font-medium text-[#6B7280] transition-colors hover:text-[#1F2937]"
        >
          Passenger
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#6B7280] transition-colors hover:text-[#1F2937]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back home
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div
          className={`flex w-full max-w-xl flex-col items-center text-center transition-all duration-700 ease-out ${
            ready ? "-translate-y-[50px] opacity-100" : "-translate-y-[34px] opacity-0"
          }`}
        >
          {!submitted ? (
            <>
              <div className="flex w-full flex-col items-center gap-5 sm:gap-6">
                <h1
                  className="font-bold leading-[1.04] tracking-tight text-[#1F2937]"
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
                  className="max-w-xl text-[#4B5563] font-medium leading-[1.35]"
                  style={{ fontSize: "clamp(1.05rem, 2vw + 0.15rem, 1.45rem)" }}
                >
                  We connect people who need to send a parcel with travellers already heading
                  that way — so packages ride journeys that are already happening.
                </p>
              </div>

              <div className="mt-10 flex w-full max-w-md flex-col items-center gap-3 sm:mt-12">
                {stepIndex > 0 ? (
                  <div className="flex w-full justify-end">
                    <button
                      type="button"
                      onClick={goBack}
                      disabled={submitting}
                      className="text-xs font-semibold text-[#248A56] transition-colors hover:text-[#1F2937] disabled:opacity-50"
                    >
                      Edit previous
                    </button>
                  </div>
                ) : null}

                <form
                  onSubmit={handleNext}
                  className="relative flex w-full items-center rounded-full border border-[#E5E7EB] bg-white/90 p-1.5 shadow-[0_10px_40px_rgba(31,41,55,0.06)] backdrop-blur-md transition-shadow focus-within:border-[#1F2937] focus-within:shadow-[0_14px_44px_rgba(31,41,55,0.1)]"
                >
                  {step === "state" ? (
                    <div ref={dropdownRef} className="relative flex-1">
                      <button
                        type="button"
                        onClick={() => setDropdownOpen((prev) => !prev)}
                        aria-expanded={dropdownOpen}
                        aria-haspopup="listbox"
                        className="flex h-12 w-full cursor-pointer items-center justify-between border-none bg-transparent px-5 text-left text-base outline-none"
                      >
                        <span className={state ? "font-medium text-[#1F2937]" : "text-[#9CA3AF]"}>
                          {state || config.placeholder}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-[#6B7280] transition-transform duration-200 ${
                            dropdownOpen ? "rotate-180 text-[#1F2937]" : ""
                          }`}
                        />
                      </button>

                      {dropdownOpen ? (
                        <div className="absolute left-0 top-full z-50 mt-3 w-full animate-in fade-in zoom-in-95 rounded-2xl border border-[#E5E7EB] bg-white p-2 text-left shadow-2xl duration-150">
                          <div className="mb-1 flex items-center gap-2 border-b border-[#F3F4F6] px-3 py-2">
                            <Search className="h-4 w-4 shrink-0 text-[#9CA3AF]" />
                            <input
                              ref={searchInputRef}
                              type="text"
                              value={stateSearch}
                              onChange={(e) => setStateSearch(e.target.value)}
                              placeholder="Search state…"
                              className="w-full border-none bg-transparent text-sm text-[#1F2937] outline-none placeholder:text-[#9CA3AF]"
                            />
                          </div>
                          <div
                            role="listbox"
                            className="max-h-56 space-y-0.5 overflow-y-auto overscroll-contain py-1"
                          >
                            {filteredStates.length > 0 ? (
                              filteredStates.map((s) => {
                                const isSelected = state === s;
                                return (
                                  <button
                                    key={s}
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => {
                                      setState(s);
                                      setDropdownOpen(false);
                                      setFieldError("");
                                    }}
                                    className={`flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                                      isSelected
                                        ? "bg-[#EAF5F0] font-semibold text-[#248A56]"
                                        : "text-[#374151] hover:bg-[#F9FAFB] hover:text-[#111827]"
                                    }`}
                                  >
                                    <span>{s}</span>
                                    {isSelected ? <Check className="h-4 w-4 text-[#248A56]" /> : null}
                                  </button>
                                );
                              })
                            ) : (
                              <p className="px-3 py-4 text-center text-xs text-[#9CA3AF]">
                                No state found
                              </p>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <input
                      ref={inputRef}
                      key={step}
                      type={step === "email" ? "email" : "text"}
                      name={step}
                      autoComplete={step === "email" ? "email" : "name"}
                      placeholder={config.placeholder}
                      required
                      value={step === "name" ? name : email}
                      onChange={(e) => {
                        setFieldError("");
                        if (step === "name") setName(e.target.value);
                        else setEmail(e.target.value);
                      }}
                      className="h-12 w-full flex-1 border-none bg-transparent px-5 text-base text-[#1F2937] outline-none ring-0 placeholder:text-[#9CA3AF] focus:outline-none focus:ring-0"
                    />
                  )}

                  <Button
                    type="submit"
                    disabled={!isValid || submitting}
                    className="h-11 shrink-0 cursor-pointer gap-2 rounded-full bg-[#1F2937] px-5 text-sm font-medium text-white transition-colors hover:bg-[#111827] disabled:bg-[#D1D5DB] sm:px-6"
                  >
                    {submitting ? "Joining…" : config.buttonLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </form>

                <div className="mt-3 min-h-5" aria-live="polite">
                  {fieldError || submitError ? (
                    <p className="text-sm text-red-600" role="alert">
                      {fieldError || submitError}
                    </p>
                  ) : (
                    <p className="text-xs text-[#9CA3AF]">No spam. Just the good stuff.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex animate-in fade-in slide-in-from-bottom-4 flex-col items-center gap-6 duration-500">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ECFDF5] ring-8 ring-[#34D186]/10">
                <Check className="h-8 w-8 text-[#34D186]" strokeWidth={2.5} />
              </div>
              <div className="flex flex-col gap-3">
                <h1
                  className="font-bold leading-[1.08] tracking-tight text-[#1F2937]"
                  style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", letterSpacing: "-0.03em" }}
                >
                  You&apos;re in, {name.split(" ")[0]}.
                </h1>
                <p className="mx-auto max-w-sm text-base leading-relaxed text-[#6B7280] sm:text-lg">
                  We&apos;ll hit you up when things are ready in{" "}
                  <span className="font-semibold text-[#1F2937]">{state}</span>. Keep an eye on{" "}
                  <span className="font-medium text-[#1F2937]">{email}</span>.
                </p>
              </div>
              <Link
                href="/"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#1F2937] transition-colors hover:text-[#34D186]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to the homepage
              </Link>
            </div>
          )}
        </div>
      </main>

      <footer className="relative z-20 bg-transparent px-6 py-5 text-center sm:px-10">
        <p className="text-xs text-[#9CA3AF]">
          &copy; {new Date().getFullYear()} Passenger · Jos, Plateau State, Nigeria
        </p>
      </footer>
    </div>
  );
}
