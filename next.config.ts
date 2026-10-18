import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every app page is per-user and dynamic, so Cache Components stays off.
  experimental: {
    // Expenses carry a downscaled receipt photo (a few hundred KB as base64).
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
