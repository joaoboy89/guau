export const COMMISSION_RATE_DEFAULT = 0.15;

// Ventanas de tiempo del ciclo de vida del paseo — ver docs/guau-politicas.md
// §2 y §7 para la justificacion completa de cada numero. El reloj NUNCA mueve
// un estado por si solo en este bloque: solo habilita, recuerda o congela.
// Los estados los mueve una persona apretando un boton.
export const WALK_TIMING = {
  // "Voy en camino" se habilita desde T-2h y NO tiene techo superior (una vez
  // abierta, la ventana queda abierta). Antes se habilitaba desde CONFIRMED
  // sin mirar la hora: eso permitia apretarlo tres dias antes y mandarle al
  // dueño "el paseador esta yendo a buscar a tu perro" con el paseo a 72
  // horas — el mismo bug que esta bloque arregla, al reves.
  // Bajado de T-3h a T-2h en el bloque B: la direccion exacta se revela
  // recien al apretar este boton (anti-desintermediacion, ver
  // packages/shared/geo/pickup-zone.ts) — dos horas alcanzan de sobra para
  // reacomodarse los ~200m de la zona aproximada, y cuanto mas corta la
  // ventana, menos margen para arreglar el paseo por afuera de la app.
  ON_WAY_OPENS_MIN_BEFORE: 120,
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
  // T+10m: segundo aviso al dueño. Mismo instante que
  // OWNER_NO_SHOW_BUTTON_MIN_AFTER, a proposito: el dueño tiene que tener
  // exactamente las mismas dos chances de demorarse (5 y 10 min) que tiene
  // el paseador para marcar "en camino".
  NOT_STARTED_ALERT_2_MIN_AFTER: 10,
  // Cota inferior (la UNICA) de WalkRemindersService.remindOwner — sesion
  // 15: el aviso "¿todo bien?" habia quedado atado primero a la duracion
  // del WalkType, el mismo reloj que usa WalkExpirationService para decidir
  // si un paseo "ya se puede dar por muerto" — una pregunta distinta a la
  // de este aviso, que es sobre el ENCUENTRO que no paso a horario, no
  // sobre el paseo en si.
  //
  // No manda el aviso si el momento (scheduledAt + minutesAfter) ya paso
  // hace mas de esto:
  //  - Decision de producto (docs/guau-politicas.md §5): la pregunta
  //    "¿todo bien?" tambien va a vivir en la pantalla del dueño, asi que
  //    un ping tardio (el job estuvo caido y vuelve horas despues) no
  //    suma, solo confunde — el momento ya paso.
  //  - El valor cubre exactamente UNA corrida perdida del cron de 5
  //    minutos (2 x 5min): mas que eso empieza a tolerar un job realmente
  //    roto como si fuera normal, que no es la intencion.
  //
  // Por que alcanza con esta sola cota, sin un piso generico aparte: al
  // vivir en minutos (no en horas), la ventana de la consulta ya queda
  // acotada a minutos por diseño — nunca escanea historia vieja de la
  // base. Sin NINGUNA cota inferior (el bug original), con backlog mayor a
  // BATCH_SIZE y orden ascendente por scheduledAt, el lote se llena de
  // paseos viejos y un candidato reciente legitimo se queda sin cupo — en
  // silencio, sin error, sin log: el job informa "0 recordatorios" y nadie
  // se entera. Hubo un piso generico de 13h agregado ademas de este, y se
  // saco: 13h siempre es mas laxo que minutesAfter + esta tolerancia (a lo
  // sumo ~25 minutos), asi que esa rama nunca podia ganar — y un limite
  // que nunca se ejecuta pero sigue ahi es peor que no tenerlo, es una
  // trampa: el dia que alguien suba este numero pensando que existe ese
  // backstop de 13h, se encuentra con que lo recorta en silencio, sin
  // ningun error que avise por que.
  NOT_STARTED_ALERT_STALE_TOLERANCE_MIN: 10,
  // Bloque B — el boton del dueño "el paseador no se presento" se habilita
  // desde T+10m y NO vence (dura hasta que el paseo llegue a un estado
  // final): un boton para reportar un problema no necesita vencimiento, si
  // el paseo se hizo esta en COMPLETED y el boton no se muestra.
  OWNER_NO_SHOW_BUTTON_MIN_AFTER: 10,
  // Umbral compartido por dos mecanismos distintos, a proposito (evita que
  // "que tan tarde es demasiado tarde" tenga dos respuestas en el mismo
  // codebase): (1) Walk.endedLate — true si endedAt quedo mas de 60 min
  // despues del fin esperado (startedAt + duracion), para poder excluir esos
  // paseos de cualquier metrica de duracion. (2) define cuando un
  // IN_PROGRESS cuenta como "vencido" para el bloqueo del bloque B (ver
  // WalksService.assertNoOverdueInProgress) — el disparador del bloqueo es
  // SIEMPRE el vencido, nunca el IN_PROGRESS abierto y normal.
  END_LATE_THRESHOLD_MIN_AFTER: 60,
  // Recordatorios de cierre (bloque B) — al paseador "acordate de cerrar el
  // paseo de Lolo", al dueño "¿ya te devolvieron a Lolo?". Offset 0 = en el
  // instante del fin esperado; +30m un segundo aviso mas insistente. El
  // bloqueo de aceptar solicitudes nuevas llega recien a los 60 min (ver
  // END_LATE_THRESHOLD_MIN_AFTER) — un paseo se puede pasar unos minutos
  // sin drama, el bloqueo no es al primer minuto de demora.
  CLOSE_REMINDER_1_MIN_AFTER: 0,
  CLOSE_REMINDER_2_MIN_AFTER: 30,
} as const;

// Radio de ofuscacion del punto de encuentro (bloque B, anti-
// desintermediacion) — no es un WALK_TIMING porque no es un offset de
// tiempo, es una distancia. "Maximo 200 metros" es el techo que pide la
// politica; el piso evita que el offset colapse cerca de 0 y el punto
// aproximado termine pegado al real por pura casualidad del hash.
export const PICKUP_ZONE_MIN_OFFSET_METERS = 50;
export const PICKUP_ZONE_MAX_OFFSET_METERS = 200;

export const WALKER_RESPONSE_TIMEOUT_MINUTES = 15;

// Bloque D1 — código de retiro (docs/guau-politicas.md §3, "Verificación de
// inicio"). 4 dígitos, 10.000 combinaciones: sin techo de intentos, un
// paseador podría probar hasta acertar y "demostrar" que fue a un paseo al
// que nunca fue. El límite es la defensa real, no la longitud del código.
export const PICKUP_CODE = {
  LENGTH: 4,
  MAX_ATTEMPTS: 5,
} as const;

// Motivos predefinidos para "iniciar sin código" — evidencia, no candado
// (el paseo SIEMPRE puede arrancar). OTHER habilita el texto libre, que es
// una ventana nueva (ver StartWalkDto: @MaxLength, sanitizado). Vive en
// shared porque el front arma el selector con las mismas claves que el
// backend valida — un motivo que el dropdown no ofrece no puede llegar
// nunca al backend por otro camino que no sea OTHER.
export const START_WITHOUT_CODE_REASON = {
  BUILDING_STAFF:     "BUILDING_STAFF",
  NEIGHBOR_OR_FAMILY: "NEIGHBOR_OR_FAMILY",
  OWNER_HAS_NO_CODE:  "OWNER_HAS_NO_CODE",
  OTHER:              "OTHER",
} as const;

export type StartWithoutCodeReason =
  typeof START_WITHOUT_CODE_REASON[keyof typeof START_WITHOUT_CODE_REASON];

export const START_WITHOUT_CODE_REASON_LABEL: Record<StartWithoutCodeReason, string> = {
  BUILDING_STAFF:     "Me lo entregó el encargado o portero",
  NEIGHBOR_OR_FAMILY: "Me lo entregó un vecino o familiar del dueño",
  OWNER_HAS_NO_CODE:  "El dueño no tenía el código a mano",
  OTHER:              "Otro motivo",
};

// Tope del texto libre de OTHER — la ventana nueva que abre este campo.
export const START_WITHOUT_CODE_OTHER_MAX_LENGTH = 200;

export const MAX_DOGS_PER_GROUP_WALK = 6;

// Salida de soporte provisoria. Se reemplaza por el chat interno cuando
// exista el front del modulo `chat` (backend completo, front en cero). No es
// variable de entorno: no cambia entre ambientes, no es secreto, y como
// NEXT_PUBLIC_* quedaria horneada en el bundle igual — una constante
// compartida hace lo mismo con menos piezas.
export const SUPPORT_EMAIL = "soporte@jbsaasapp.com";

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
  WALK_NOT_STARTED_ALERT_2:  "walk_not_started_alert_2", // T+10m, al dueño
  // Bloque B — reclamos y cierre. WALK_WALKER_NO_SHOW_REPORTED va SOLO al
  // paseador reportado (no es un recordatorio, es el resultado de que el
  // dueño ya reportó). WALK_CLOSED_BY_OWNER también va solo al paseador:
  // el dueño no necesita que le confirmen que él mismo confirmó.
  WALK_WALKER_NO_SHOW_REPORTED: "walk_walker_no_show_reported",
  WALK_CLOSED_BY_OWNER:         "walk_closed_by_owner",
  // Recordatorios de cierre — CUATRO tipos, no dos: cada milestone
  // (fin esperado, fin esperado+30m) le llega a las DOS partes, y si
  // paseador y dueño compartieran un solo `type` por milestone, el
  // mecanismo de idempotencia (type + data.walkId, sin columnas nuevas)
  // marcaría "ya avisé" con la notificación del primero y el segundo nunca
  // recibiría la suya.
  WALK_CLOSE_REMINDER_1_WALKER: "walk_close_reminder_1_walker",
  WALK_CLOSE_REMINDER_1_OWNER:  "walk_close_reminder_1_owner",
  WALK_CLOSE_REMINDER_2_WALKER: "walk_close_reminder_2_walker",
  WALK_CLOSE_REMINDER_2_OWNER:  "walk_close_reminder_2_owner",
  // Cierre del bloque D1 (docs/guau-politicas.md §3/§5) — las dos van al
  // dueño, una por paseo, nunca una por perro (un paseo tiene un solo
  // dueño; ver el comentario del punto 0 en walks.service.ts).
  WALK_PICKUP_CODE_EXHAUSTED: "walk_pickup_code_exhausted",
  WALK_STARTED_NO_CODE:       "walk_started_no_code",
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];

// GET /walks/pending-questions (cierre del bloque D1, guau-politicas.md §5)
// — cosas que el dueño tiene pendiente de responder, no un historial. Un
// solo tipo hoy; el campo `type` existe para que un segundo tipo entre sin
// romper el contrato, no para abstraer por adelantado un motor genérico.
export const PENDING_QUESTION_TYPES = {
  NO_CODE_START: "NO_CODE_START",
} as const;

export type PendingQuestionType = typeof PENDING_QUESTION_TYPES[keyof typeof PENDING_QUESTION_TYPES];

export interface PendingQuestion {
  walkId: string;
  type: PendingQuestionType;
  // Decide el estado A/B del cartel: IN_PROGRESS (paseo en curso) o
  // COMPLETED (ya cerrado, la pregunta sigue viva igual).
  status: "IN_PROGRESS" | "COMPLETED";
  dogsLabel: string;
  startVerifyReason: string;
  endedAt: string | null;
}

// Cuáles PendingQuestion IMPIDEN reservar un paseo nuevo (create(), en
// walks.service.ts) — lista con nombre, no un motor genérico ni un flag
// calculado. Hoy un solo miembro; el segundo (paseo sin pagar,
// guau-politicas.md §7 ter, bloqueado hasta el test de MercadoPago) entra
// agregando una línea acá, sin tocar create().
export const BLOCKING_PENDING_QUESTION_TYPES: readonly PendingQuestionType[] = [
  PENDING_QUESTION_TYPES.NO_CODE_START,
];

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
