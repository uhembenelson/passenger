import React from "react";
import Link from "next/link";

const PRODUCT_LINKS = [
  { label: "Send something", href: "#senders-travellers" },
  { label: "I'm travelling", href: "#senders-travellers" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Trust & safety", href: "#safety" },
  { label: "FAQ", href: "#faq" },
];

const COMPANY_LINKS = [
  { label: "About", href: "#" },
  { label: "Contact", href: "#" },
  { label: "Terms", href: "#" },
  { label: "Privacy", href: "#" },
];

export function Footer() {
  return (
    <footer className="bg-[#FAFAFC] border-t border-[#E5E7EB]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          {/* Brand */}
          <div className="md:col-span-5">
            <Link href="/" className="flex items-center">
              <span className="text-lg font-bold tracking-tight text-[#1F2937] uppercase">
                Passenger
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm text-[#7A7F87] leading-relaxed">
              Your package rides along on trips people were already taking.
            </p>
          </div>

          {/* Product */}
          <div className="md:col-span-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#7A7F87]">
              The app
            </h4>
            <ul className="mt-4 space-y-2.5">
              {PRODUCT_LINKS.map((l) => (
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
              Get the app
            </h4>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="#download"
                  className="text-sm text-[#4B5563] hover:text-[#1F2937] transition-colors"
                >
                  App Store
                </Link>
              </li>
              <li>
                <Link
                  href="#download"
                  className="text-sm text-[#4B5563] hover:text-[#1F2937] transition-colors"
                >
                  Google Play
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-[#E5E7EB] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#7A7F87]">
          <p>© 2026 Passenger</p>
          <p>Delivered on trips that were happening anyway.</p>
        </div>
      </div>
    </footer>
  );
}