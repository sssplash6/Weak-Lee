import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The guides are read from private/guidelines at request time. Without this
  // the tracer can't see which files those two routes need and warns that the
  // whole project may have to be bundled into the server trace; naming the
  // directory keeps the deployed bundle to the PDFs that are actually served.
  outputFileTracingIncludes: {
    "/guidelines": ["private/guidelines/**/*"],
    "/guidelines/file/\\[slug\\]": ["private/guidelines/**/*"],
  },
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
