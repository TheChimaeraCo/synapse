import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [],
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // instrumentation.ts is auto-detected by Next.js 14+
};

export default nextConfig;
