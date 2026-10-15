import type { Metadata } from "next";

// The studio is a working surface for building animation sequences, not a public
// page: it is kept out of the sitemap and out of search results.
export const metadata: Metadata = {
  title: "Studio",
  description: "A private workspace for building and exporting animation sequences.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
