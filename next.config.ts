import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.100.68"],
  images: {
    qualities: [75, 90],
  },
};

export default nextConfig;
