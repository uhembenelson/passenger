import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const title = "Join the Passenger Waitlist";
const description =
  "Join the Passenger waitlist for peer-to-peer parcel delivery in Nigeria. We connect people who need to send a package with travellers already heading that way.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "Passenger waitlist",
    "peer to peer delivery Nigeria",
    "send package with travellers",
    "parcel delivery waitlist",
    "Nigeria courier alternative",
    "trip sharing delivery",
    "early access Passenger",
  ],
  alternates: {
    canonical: `${SITE_URL}/waitlist`,
  },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/waitlist`,
    siteName: SITE_NAME,
    title: `${title} | ${SITE_NAME}`,
    description,
    locale: "en_NG",
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} | ${SITE_NAME}`,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

const waitlistJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: title,
  description,
  url: `${SITE_URL}/waitlist`,
  isPartOf: {
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
  },
  about: {
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    description:
      "Peer-to-peer delivery that connects parcel senders with verified travellers already heading in the right direction.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "NGN",
      availability: "https://schema.org/PreOrder",
    },
  },
  mainEntity: {
    "@type": "Action",
    name: "Join waitlist",
    target: `${SITE_URL}/waitlist`,
  },
};

export default function WaitlistLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(waitlistJsonLd) }}
      />
      {children}
    </>
  );
}
