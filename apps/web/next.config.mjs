import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // En Next 14 esta clave va DENTRO de experimental; a nivel raiz es ignorada
    // (warning "Unrecognized key") y el file-tracing colapsa la raiz a apps/web,
    // dejando server.js mal ubicado y sin node_modules en el standalone.
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },
  transpilePackages: ["@guau/shared"],
  eslint: {
    // El lint es un gate explícito del workflow de CI (`npm run lint`,
    // paso propio antes del build), no un efecto colateral escondido
    // adentro de `next build`. Antes de arreglar la config de ESLint esto
    // no importaba porque el lint interno de next build ni cargaba y no
    // frenaba nada; ahora que carga, dejarlo activo acá duplicaría el gate
    // de forma implícita — un gate que no sabés que tenés es peor que no
    // tenerlo.
    ignoreDuringBuilds: true,
  },
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
