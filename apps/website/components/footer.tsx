import React from "react";
import Link from "next/link";

const PRODUCT_LINKS = [
  { label: "Send something", href: "#senders-travellers", soon: true },
  { label: "I'm travelling", href: "#senders-travellers", soon: true },
  { label: "How it works", href: "#how-it-works", soon: false },
  { label: "Trust & safety", href: "#safety", soon: false },
  { label: "FAQ", href: "#faq", soon: false },
];

const COMPANY_LINKS = [
  { label: "About", href: "#about" },
  { label: "Contact", href: "mailto:support@usepassenger.com" },
];

export function Footer() {
  return (
    <footer className="bg-[#FAFAFC] border-t border-[#E5E7EB]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          {/* Brand */}
          <div className="md:col-span-5">
            <Link href="/" className="flex items-center" aria-label="Passenger home">
              <img
                src="/logopp.png"
                alt="Passenger"
                className="h-8 w-auto"
                width={2844}
                height={840}
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm text-[#7A7F87] leading-relaxed">
              Send it with someone going your way.
            </p>
          </div>

          {/* Product */}
          <div className="md:col-span-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#7A7F87]">
              The app
            </h4>
            <ul className="mt-4 space-y-2.5">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.label} className="flex items-center gap-2">
                  {l.soon ? (
                    <span className="text-sm text-[#9CA3AF]">{l.label}</span>
                  ) : (
                    <Link
                      href={l.href}
                      className="text-sm text-[#4B5563] hover:text-[#1F2937] transition-colors"
                    >
                      {l.label}
                    </Link>
                  )}
                  {l.soon && (
                    <span className="inline-flex items-center rounded-full bg-[#EAF5F0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#248A56]">
                      Coming soon
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div className="md:col-span-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#7A7F87]">
              Company
            </h4>
            <ul className="mt-4 space-y-2.5">
              {COMPANY_LINKS.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-[#4B5563] hover:text-[#1F2937] transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* App */}
          <div className="md:col-span-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#7A7F87]">
              Passenger
            </h4>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="/waitlist"
                  className="text-sm text-[#4B5563] hover:text-[#1F2937] transition-colors"
                >
                  Join our wait list
                </Link>
              </li>
              <li>
                <Link
                  href="#app-preview"
                  className="text-sm text-[#4B5563] hover:text-[#1F2937] transition-colors"
                >
                  See the app
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-[#E5E7EB] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#7A7F87]">
          <p>© 2026 Passenger</p>
        </div>
      </div>
    </footer>
  );
}
