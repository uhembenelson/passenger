"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronDown, Menu, X } from "lucide-react";

type NavItem = { label: string; href: string };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Products",
    items: [
      { label: "Send something", href: "#senders-travellers" },
      { label: "I'm travelling", href: "#senders-travellers" },
    ],
  },
  {
    label: "Learn",
    items: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Trust & safety", href: "#safety" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "About", href: "#about" },
      { label: "Contact", href: "#contact" },
      { label: "Terms", href: "#terms" },
      { label: "Privacy", href: "#privacy" },
    ],
  },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenGroup(null);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full bg-white/90 backdrop-blur-md border-b border-[#F3F3F3]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center group">
          <span className="text-xl font-bold tracking-tight text-[#1F2937] uppercase">
            Passenger
          </span>
        </Link>

        {/* Desktop Nav Clusters */}
        <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-[#4B5563]">
          {NAV_GROUPS.map((group) => {
            const isOpen = openGroup === group.label;
            return (
              <div
                key={group.label}
                className="relative"
                onMouseEnter={() => setOpenGroup(group.label)}
                onMouseLeave={() => setOpenGroup(null)}
              >
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={isOpen}
                  onClick={() => setOpenGroup(isOpen ? null : group.label)}
                  className="flex items-center gap-1 rounded-full px-3 py-2 transition-colors hover:text-[#27AB6B]"
                >
                  {group.label}
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen && (
                  <div className="absolute left-0 top-full pt-2">
                    <div className="min-w-[210px] rounded-2xl border border-[#F3F3F3] bg-white p-2 shadow-lg shadow-black/5">
                      {group.items.map((item) => (
                        <Link
                          key={item.label}
                          href={item.href}
                          onClick={() => setOpenGroup(null)}
                          className="block rounded-xl px-3 py-2 text-sm text-[#4B5563] transition-colors hover:bg-[#F7F7F8] hover:text-[#1F2937]"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center">
          <Button
            asChild
            className="bg-[#34D186] hover:bg-[#2FA968] text-white font-semibold rounded-full shadow-sm text-sm h-10 px-5"
          >
            <a href="#download">
              Get the app
            </a>
          </Button>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-[#4B5563] hover:bg-[#F7F7F8]"
          aria-label="Toggle Navigation Menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[#F3F3F3] bg-white px-4 pt-4 pb-6">
          <div className="space-y-6">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="px-1 text-xs font-semibold uppercase tracking-wider text-[#7A7F87]">
                  {group.label}
                </p>
                <div className="mt-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block rounded-xl px-1 py-3 text-base font-medium text-[#1F2937] transition-colors hover:text-[#27AB6B]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="pt-5 mt-5 border-t border-[#F3F3F3]">
            <Button
              asChild
              className="w-full bg-[#34D186] hover:bg-[#2FA968] text-white font-semibold rounded-full"
            >
              <a href="#download" onClick={() => setMobileMenuOpen(false)}>
                Get the app
              </a>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
