import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The catalog is read from db/seed at runtime; make sure serverless bundles include it.
  outputFileTracingIncludes: {
    "/**": ["./db/seed/**/*"],
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
