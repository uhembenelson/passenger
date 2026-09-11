import type { Metadata, Viewport } from "next";
import { Work_Sans } from "next/font/google";
import { rootCssVariables } from "@passenger/design-tokens";
import "./globals.css";

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-work-sans",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Passenger — Peer-to-Peer Delivery Going Your Way",
  description:
    "Good things move with people. Send packages with verified travellers already heading in the right direction, or monetize your extra luggage space.",
  keywords: [
    "peer to peer delivery",
    "send package",
    "traveller delivery",
    "same day parcel",
    "nigeria courier",
    "passenger app",
  ],
  authors: [{ name: "Passenger" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${workSans.variable} scroll-smooth`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: rootCssVariables }} />
      </head>
      <body className="min-h-screen flex flex-col bg-[#FAFAFC] text-[#1F2937] font-sans antialiased selection:bg-[#BCF0D7] selection:text-[#153B27]">
        {children}
      </body>
    </html>
  );
}
