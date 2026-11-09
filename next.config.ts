import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Import files are limited to 1 MB; multipart overhead needs headroom above the 1 MB default.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default nextConfig;
