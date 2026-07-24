import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.100.68"],
  images: {
    qualities: [75, 90],
  },
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
