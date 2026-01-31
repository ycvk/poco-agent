import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to avoid incorrect lockfile inference warnings.
    root: configDir,
  },
  // NOTE: added for Docker deployment
  output: "standalone",
  // Disable image optimization for local development
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
