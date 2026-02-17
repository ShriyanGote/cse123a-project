import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Explicitly set the root directory to avoid lockfile detection issues
  ...(process.env.NODE_ENV === 'development' && {
    experimental: {
      turbo: {
        root: process.cwd(),
      },
    },
  }),
};

export default nextConfig;
