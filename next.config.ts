import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: [],
  // instrumentation.ts is auto-detected by Next.js 14+
};

export default nextConfig;
