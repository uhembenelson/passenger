import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@passenger/core", "@passenger/design-tokens"],
  poweredByHeader: false,
};

export default nextConfig;
