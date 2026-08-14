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
  // Cierra en T+10m: el paseador tiene otros paseos agendados, asi que
  // retrasarlo sin techo es malo para el negocio y para los siguientes
  // clientes. Entre T+5m y T+10m conviven "iniciar" y "el dueño no vino", y
  // el paseador elige.
  START_CLOSES_MIN_AFTER: 10,
  // finish se habilita 15 minutos antes del fin esperado (startedAt +
  // duracion del WalkType) — puede cerrar antes si no hay ningun problema,
  // no hay techo superior.
  FINISH_OPENS_MIN_BEFORE_END: 15,
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
