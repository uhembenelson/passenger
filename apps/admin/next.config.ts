import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@passenger/core", "@passenger/backend"],
  poweredByHeader: false,
};
export default nextConfig;
