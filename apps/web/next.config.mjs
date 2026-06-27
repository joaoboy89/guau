import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Monorepo root: necesario para que el file-tracing incluya node_modules del root
  outputFileTracingRoot: path.join(__dirname, "../../"),
  experimental: {
    // Forzar inclusión de styled-jsx en standalone (no se traza automáticamente en monorepos)
    outputFileTracingIncludes: {
      "/**": ["../../node_modules/styled-jsx/**/*"],
    },
  },
  transpilePackages: ["@guau/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
    ],
  },
};

export default nextConfig;
