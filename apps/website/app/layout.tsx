import type { Metadata, Viewport } from "next";
import { Work_Sans } from "next/font/google";
import { rootCssVariables } from "@passenger/design-tokens";
import { SITE_NAME, SITE_URL } from "@/lib/site";
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

const rootDescription =
  "Good things move with people. Send packages with verified travellers already heading in the right direction, or monetize your extra luggage space.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Peer-to-Peer Delivery Going Your Way`,
    template: `%s | ${SITE_NAME}`,
  },
  description: rootDescription,
  applicationName: SITE_NAME,
  keywords: [
    "peer to peer delivery",
    "send package",
    "traveller delivery",
    "same day parcel",
    "nigeria courier",
    "passenger app",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Peer-to-Peer Delivery Going Your Way`,
    description: rootDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Peer-to-Peer Delivery Going Your Way`,
    description: rootDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
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
      <body className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)] font-sans antialiased selection:bg-[var(--brand-tint)] selection:text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
