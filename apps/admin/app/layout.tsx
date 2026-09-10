import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import { adminRootCssVariables } from "@passenger/design-tokens";
import "./globals.css";

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-work-sans",
});

export const metadata: Metadata = {
  title: "Passenger — Operations",
  description: "The trust and safety workspace for deliveries going your way.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={workSans.variable}><body><style dangerouslySetInnerHTML={{ __html: adminRootCssVariables }} />{children}</body></html>;
}
