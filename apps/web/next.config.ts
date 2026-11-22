import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen Docker mínima (T1.6): solo el servidor y las dependencias que usa.
  output: "standalone",
  // No revelar la tecnología del servidor (cabecera X-Powered-By).
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
