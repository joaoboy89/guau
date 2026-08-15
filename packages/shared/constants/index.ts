export const COMMISSION_RATE_DEFAULT = 0.15;

// Ventanas de tiempo del ciclo de vida del paseo — ver docs/guau-politicas.md
// §2 y §7 para la justificacion completa de cada numero. El reloj NUNCA mueve
// un estado por si solo en este bloque: solo habilita, recuerda o congela.
// Los estados los mueve una persona apretando un boton.
export const WALK_TIMING = {
  // "Voy en camino" se habilita desde T-3h y NO tiene techo superior (una vez
  // abierta, la ventana queda abierta). Antes se habilitaba desde CONFIRMED
  // sin mirar la hora: eso permitia apretarlo tres dias antes y mandarle al
  // dueño "el paseador esta yendo a buscar a tu perro" con el paseo a 72
  // horas — el mismo bug que esta bloque arregla, al reves.
  ON_WAY_OPENS_MIN_BEFORE: 180,
  // Arranca de T-5m: la "zona dulce" (T-5m a T+5m) es el rango ideal para
  // iniciar, pero se deja margen porque alguien puede bajar tarde con
  // personas y un perro de por medio — la flexibilidad va en el diseño, no
  // en el reclamo despues.
  START_OPENS_MIN_BEFORE: 5,
  // Ya NO es un cierre — canStart no tiene techo superior (evidencia, no
  // candado: un corte duro no evita que el paseo pase, lo empuja afuera de
  // la app, y ahi se pierde el registro, el GPS y la comision). Sigue
  // siendo el umbral que separa un inicio a tiempo de uno tardio: pasado
  // T+10m, start() igual deja iniciar pero graba Walk.startedLate = true,
  // dato que alimenta la tasa de puntualidad del paseador.
  START_LATE_THRESHOLD_MIN_AFTER: 10,
  // finish se habilita 15 minutos antes del fin esperado (startedAt +
  // duracion del WalkType) — puede cerrar antes si no hay ningun problema,
  // no hay techo superior.
  FINISH_OPENS_MIN_BEFORE_END: 15,
  // Bloque C — recordatorios y vencimiento. El aviso y el momento esperado no
  // pueden coincidir, o se llega tarde por diseño: por eso T-1h15 y no T-1h.
  ONWAY_REMINDER_1_MIN_BEFORE: 75,
  ONWAY_REMINDER_2_MIN_BEFORE: 70,
  // T+5m: primer aviso al dueño ("¿todo bien?"). El job YA NO marca
  // WALKER_NO_SHOW en este instante — eso paso a T+D (ver
  // WalkExpirationService.markWalkerNoShow): marcar a los 5 minutos chocaba
  // con este mismo aviso ("¿todo bien?" y "el paseo no se realizo" llegando
  // juntos), y era apresurado — el aviso existe para que el paseador
  // reaccione, no para morir en el mismo instante en que sale.
  NOT_STARTED_ALERT_1_MIN_AFTER: 5,
  // T+10m: segundo aviso al dueño. Mismo instante en que el bloque B (no
  // implementado aca) va a habilitar su boton "el paseador no se presento"
  // — el dueño tiene que tener exactamente las mismas dos chances de
  // demorarse (5 y 10 min) que tiene el paseador para marcar "en camino".
  NOT_STARTED_ALERT_2_MIN_AFTER: 10,
} as const;

export const WALKER_RESPONSE_TIMEOUT_MINUTES = 15;

export const MAX_DOGS_PER_GROUP_WALK = 6;

export const SOCKET_EVENTS = {
  WALK_JOIN: "walk:join",
  WALK_LEAVE: "walk:leave",
  WALK_LOCATION: "walk:location",
  WALK_LOCATION_UPDATE: "walk:location:update",
  WALK_STATUS_CHANGED: "walk:status:changed",
  NOTIFICATION_NEW: "notification:new",
  MESSAGE_NEW: "message:new",
} as const;

export const NOTIFICATION_TYPES = {
  WALK_REQUESTED:         "walk_requested",
  WALK_CONFIRMED:         "walk_confirmed",
  WALK_REJECTED:          "walk_rejected",
  WALK_CANCELLED_WALKER:  "walk_cancelled_walker",
  WALK_CANCELLED_OWNER:   "walk_cancelled_owner",
  WALK_WALKER_ON_WAY:     "walk_walker_on_way",
  WALK_IN_PROGRESS:       "walk_in_progress",
  WALK_COMPLETED:         "walk_completed",
  // Recordatorios del job de vencimiento (bloque C) — dos avisos distintos
  // por destinatario, no el mismo tipo repetido: la idempotencia del job
  // busca "ya existe una notificacion de ESTE tipo para este walk", asi que
  // dos avisos con el mismo tipo se pisarian entre si y el segundo nunca
  // saldria.
  WALK_ONWAY_REMINDER_1:     "walk_onway_reminder_1",   // T-1h15, al paseador
  WALK_ONWAY_REMINDER_2:     "walk_onway_reminder_2",   // T-1h10, al paseador
  WALK_NOT_STARTED_ALERT_1:  "walk_not_started_alert_1", // T+5m, al dueño
  WALK_NOT_STARTED_ALERT_2:  "walk_not_started_alert_2", // T+15m, al dueño
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];

export const CONTACT_PATTERNS = [
  /\b\d{10,11}\b/,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  /whatsapp/i,
  /wasap/i,
  /instagram/i,
  /insta\b/i,
  /ig\b/i,
  /@[a-zA-Z0-9._]+/,
] as const;
