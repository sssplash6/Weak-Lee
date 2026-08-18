import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root (a stray lockfile exists in the home directory).
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      // The payroll filing form uploads expense receipts (≤4MB each, capped in
      // lib/payrollTypes.ts) inside one action body; the 1MB default would
      // reject them. Multipart overhead needs headroom on top.
      bodySizeLimit: "16mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
