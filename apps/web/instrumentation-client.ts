import * as Sentry from "@sentry/nextjs";

// Nombre de archivo fijo por el SDK (no "sentry.client.config.ts", que es
// la convencion vieja) — @sentry/nextjs busca exactamente
// "instrumentation-client.ts" para inyectarlo como entrypoint del cliente.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Sin DSN, Sentry no se inicializa y el front arranca igual — mismo
// criterio que apps/api/src/instrument.ts. Necesario para local, donde no
// hay DSN configurado.
if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    // Sin tracing ni profiling — mismo criterio que el backend.
    tracesSampleRate: 0,
    // Sin Session Replay a proposito: grabaria la pantalla de un usuario
    // cargando su direccion de casa. No se agrega ni siquiera comentada.
    sendDefaultPii: false,
    beforeSend(event) {
      scrubSensitiveFields(event as unknown as Record<string, unknown>);
      return event;
    },
  });
}

// Campos que nunca deben salir del navegador, sin importar donde aparezcan
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
