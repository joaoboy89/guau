import path from "path";
import { fileURLToPath } from "url";
import { withSentryConfig } from "@sentry/nextjs/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // En Next 14 esta clave va DENTRO de experimental; a nivel raiz es ignorada
    // (warning "Unrecognized key") y el file-tracing colapsa la raiz a apps/web,
    // dejando server.js mal ubicado y sin node_modules en el standalone.
    outputFileTracingRoot: path.join(__dirname, "../../"),
    // Necesario en Next 14 (en 15+ ya es default) para que instrumentation.ts
    // se ejecute — sin esto register()/onRequestError de Sentry no corren.
    instrumentationHook: true,
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

export default withSentryConfig(nextConfig, {
  // Silencia el output promocional del plugin en cada build.
  silent: true,
  // No configuramos SENTRY_AUTH_TOKEN/ORG/PROJECT (no lo pidio nadie, y no
  // hace falta para reportar errores) — sin esto el plugin igual intentaria
  // subir source maps y fallar en silencio o tirar warnings de mas.
  // Deshabilitarlo explicito es mas claro que dejarlo a que se de cuenta solo.
  sourcemaps: { disable: true },
});
