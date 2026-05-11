import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kmediaz.nyc3.digitaloceanspaces.com",
      },
    ],
  },
};

export default nextConfig;
