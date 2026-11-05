import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets a production build for testing live beside a running `next dev` (which owns .next).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The catalog is read from db/seed at runtime; make sure serverless bundles include it.
  outputFileTracingIncludes: {
    "/**": ["./db/seed/**/*"],
  },
  // Pages and answers that carry or handle a secret are never cached and never send a Referer.
  async headers() {
    const secret = [
      { key: "Cache-Control", value: "no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ];
    return [
      { source: "/reset-password", headers: secret },
      { source: "/verify-email", headers: secret },
      { source: "/password-reset/:path*", headers: secret },
      { source: "/buyer/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/api/buyer/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/api/auth/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.finbynkart.com",
      },
    ],
  },
};

export default nextConfig;
