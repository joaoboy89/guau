import type { captureRequestError } from "@sentry/nextjs";

// Next.js llama a register() una vez al arrancar (nodejs) y otra vez por
// runtime edge, si lo hay — requiere experimental.instrumentationHook:true
// en next.config.mjs en Next 14 (en 15+ ya es default). Guau hoy no tiene
// middleware ni rutas edge, pero el chequeo de NEXT_RUNTIME es gratis y
// evita un agujero silencioso el dia que aparezca una.
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  // Sin DSN, Sentry no se inicializa y el front arranca igual — mismo
  // criterio que apps/api/src/instrument.ts. Necesario para local, donde
  // no hay DSN configurado.
  if (!dsn) return;

  const Sentry = await import("@sentry/nextjs");
  const environment =
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";

  Sentry.init({
    dsn,
    environment,
    // Sin tracing ni profiling — mismo criterio que el backend.
    tracesSampleRate: 0,
    // Sin Session Replay a proposito: grabaria la pantalla de un usuario
    // cargando su direccion de casa. No se agrega ni siquiera comentada.
    sendDefaultPii: false,
    beforeSend(event) {
      const req = event.request as { cookies?: unknown; headers?: Record<string, unknown> } | undefined;
      if (req) {
        delete req.cookies;
        if (req.headers) {
          delete req.headers["cookie"];
          delete req.headers["Cookie"];
          delete req.headers["authorization"];
          delete req.headers["Authorization"];
        }
      }
      scrubSensitiveFields(event as unknown as Record<string, unknown>);
      return event;
    },
  });
}

// Reportar errores no capturados de Server Components / route handlers —
// ver captureRequestError de @sentry/nextjs.
export async function onRequestError(...args: Parameters<typeof captureRequestError>) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(...args);
}

// Campos que nunca deben salir del proceso, sin importar donde aparezcan
// en el evento — misma logica que apps/api/src/instrument.ts.
const SENSITIVE_FIELDS = ["password", "token", "accesstoken", "mpaccesstoken"];

function scrubSensitiveFields(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object") return;
  if (seen.has(value as object)) return;
  seen.add(value as object);

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
      obj[key] = "[Filtered]";
    } else {
      scrubSensitiveFields(obj[key], seen);
    }
  }
}
