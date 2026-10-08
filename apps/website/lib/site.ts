/** Canonical public site origin for metadata, sitemap, and absolute URLs. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://usepassenger.com";

export const SITE_NAME = "Passenger";
