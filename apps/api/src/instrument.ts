import * as Sentry from "@sentry/nestjs";

// Tiene que ser la PRIMERA cosa que corre el proceso — antes que cualquier
// otro import — para que la instrumentacion automatica de @sentry/nestjs
// pueda parchear los modulos que se importen despues. Por eso main.ts lo
// importa en su primera linea, antes que @nestjs/core.

// Sin SENTRY_DSN, Sentry.init() ni se llama: el SDK queda en no-op y la API
// arranca igual, sin warning ruidoso, sin crash — mismo criterio que el
// resto de los servicios opcionales del proyecto (MailService sin
// RESEND_API_KEY, R2 sin credenciales). Necesario para que ande en local,
// donde no hay DSN configurado.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",

    // Sin tracing ni profiling — decision explicita: este commit es
    // "enterarse cuando algo se rompe", no observabilidad de performance.
    tracesSampleRate: 0,

    // Guau guarda mails, telefonos y DIRECCIONES DE CASAS, y el
    // mpAccessToken del paseador que segun CLAUDE.md jamas debe salir del
    // backend. sendDefaultPii en true mandaria IP, cookies y headers
    // completos por defecto a un servidor en Europa — explicitamente en
    // false, y el beforeSend de abajo scrubea lo que Sentry igual capture
    // como contexto del request.
    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers["cookie"];
          delete event.request.headers["Cookie"];
          delete event.request.headers["authorization"];
          delete event.request.headers["Authorization"];
        }
      }
      scrubSensitiveFields(event);
      return event;
    },
  });
}

// Campos que nunca deben salir del proceso, sin importar en que parte del
// evento aparezcan — no alcanza con una lista fija de "donde puede
// aparecer" (headers, body): un objeto de Prisma serializado como `extra`,
// por ejemplo, podria traer mpAccessToken adentro sin pasar por ninguno de
// los dos casos de arriba.
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
