import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Abrir el dev server desde otro equipo de la red local (la IP cambia con el router).
  allowedDevOrigins: ["192.168.100.*"],
  images: {
    qualities: [75, 90],
  },
};

export default nextConfig;
