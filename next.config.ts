import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every app page is per-user and dynamic, so Cache Components stays off.
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
