import { WALK_TIMING, canMarkOnWay, canStart, canFinish, expectedEndAt } from "@guau/shared";

export const STATUS_LABEL: Record<string, string> = {
  PENDING:          "Pendiente de confirmación",
  CONFIRMED:        "Confirmado",
  WALKER_ON_WAY:    "Paseador en camino",
  IN_PROGRESS:      "Paseo en curso",
  COMPLETED:        "Completado",
  CANCELLED_OWNER:  "Cancelado por el dueño",
  CANCELLED_WALKER: "Cancelado por el paseador",
  NOT_PERFORMED:    "No realizado",
};

type BadgeVariant = "success" | "warning" | "error" | "info" | "default";

/**
 * Color del estado, centralizado acá junto con la etiqueta.
 *
 * Antes cada pantalla pintaba el estado con el mismo terracota, sin importar
 * cuál fuera: un paseo cancelado se veía igual que uno completado. El color
 * es información, no decoración — que la lea de un vistazo evita que alguien
 * crea que un paseo sigue en pie cuando ya se cayó.
 */
export const STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING:          "warning",
  CONFIRMED:        "info",
  WALKER_ON_WAY:    "info",
  IN_PROGRESS:      "info",
  COMPLETED:        "success",
  CANCELLED_OWNER:  "error",
  CANCELLED_WALKER: "error",
  NOT_PERFORMED:    "error",
};

/**
 * Extraída como función pura (en vez de dejarla inline en el JSX de
 * walks/[id] y walker/dashboard) específicamente para poder testearla
 * barato: el proyecto no tiene infraestructura de render de componentes
 * (ningún test monta React todavía, solo lógica de lib/*), así que esta es
 * la forma de cubrir la condición sin agregar esa infraestructura para un
 * solo caso.
 *
 * El guard real vive en el backend (WalksService.cancel rechaza un paseo
 * pagado); esto solo decide si mostrar el botón.
 */
export function canCancelWalk(status: string, isPaid: boolean): boolean {
  return (status === "PENDING" || status === "CONFIRMED") && !isPaid;
}

/** Las tres transiciones que puede disparar el paseador desde su panel. */
export type WalkTransition = "onWay" | "start" | "finish";

export interface NextWalkAction {
  label:  string;
  action: WalkTransition;
  /**
   * Si la transicion merece un dialogo de confirmacion antes de dispararse.
   * Solo `finish`: COMPLETED es terminal y no hay ninguna ruta de vuelta, ni
   * en la app ni en el backend. El riesgo no es que el paseador quiera
   * terminar antes —no tiene ningun incentivo, se perjudica solo— sino que
   * un toque accidental le avise al dueño "paseo completado" con el perro
   * todavia en la calle, y nadie pueda revertirlo.
   *
   * Los otros dos van directos: son de bajo riesgo y el paseador los usa con
   * el celular en una mano y la correa en la otra. Cada toque de mas ahi es
   * friccion real.
   */
  needsConfirm: boolean;
}

/**
 * Un solo boton por tarjeta, el que corresponde al estado — nunca tres con
 * dos deshabilitados. El paseador tiene una intencion ("ya salgo", "arranco",
 * "termine") y el sistema ya sabe en que estado esta el paseo: mostrarle las
 * tres opciones seria obligarlo a leer el estado interno para elegir bien.
 * Mismo criterio que el boton de cancelar.
 */
const NEXT_ACTION: Record<string, NextWalkAction> = {
  CONFIRMED:     { label: "Voy en camino",   action: "onWay",  needsConfirm: false },
  WALKER_ON_WAY: { label: "Iniciar paseo",   action: "start",  needsConfirm: false },
  IN_PROGRESS:   { label: "Finalizar paseo", action: "finish", needsConfirm: true  },
};

/**
 * Extraida como funcion pura por la misma razon que `canCancelWalk`: el
 * proyecto no monta componentes en los tests, asi que esta es la forma de
 * cubrir "que boton va en que estado" sin traer infraestructura de render
 * para un solo caso.
 *
 * El guard real vive en el backend (`assertStatus` rechaza cualquier
 * transicion desde un estado que no corresponde); esto solo decide que
 * mostrar.
 */
export function nextWalkAction(status: string): NextWalkAction | null {
  return NEXT_ACTION[status] ?? null;
}

/**
 * Un paseo es "trabajo pendiente" exactamente cuando le queda una accion por
 * hacer. Derivarlo de `nextWalkAction` en vez de mantener una segunda lista
 * de estados evita que las dos se despeguen: agregar un estado al mapa lo
 * suma a la seccion de activos sin tener que acordarse de tocar dos lugares.
 *
 * Ojo con `isExpired`: es `scheduledAt <= now`, asi que un paseo se marca
 * vencido en el instante en que llega su hora. Filtrar los activos por esa
 * bandera le sacaria el boton al paseador justo cuando lo necesita —un
 * IN_PROGRESS esta vencido siempre, por definicion— y dejaria afuera al que
 * llega cinco minutos tarde. El backend SI mira la fecha ahora (ver
 * `walkActionAvailability` mas abajo): la tarjeta se sigue mostrando igual,
 * pero el boton nace deshabilitado hasta que se abre su ventana. El no-show
 * del dueño sigue siendo un bloque propio, todavia sin diseñar (ver backlog).
 */
export function isActiveWalk(status: string): boolean {
  return nextWalkAction(status) !== null;
}

export interface WalkActionAvailability {
  available: boolean;
  /**
   * Instante en que se habilita. `null` si ya esta disponible, o si la
   * ventana se cerro y no va a volver a abrirse (ver `closed`) — un horario
   * de apertura que ya paso hace tres semanas no es informacion, es ruido.
   */
  availableAt: Date | null;
  /**
   * true si la accion tuvo una ventana con techo y ese techo ya paso (hoy,
   * solo `start`: `onWay` y `finish` no tienen techo superior). Antes de
   * este campo, un paseo del 24 de julio mostraba "Se habilita a las 8:55
   * a. m." — la hora de apertura de una ventana que se cerro hace semanas y
   * no va a volver. El backend ya distinguia los dos casos
   * (`assertCanStart` tiene un mensaje propio para "ya paso la ventana");
   * esto empareja al front.
   */
  closed: boolean;
}

export interface WalkActionTiming {
  scheduledAt: Date;
  startedAt: Date | null;
  durationMinutes: number;
  now: Date;
}

const MINUTE_MS = 60_000;

/**
 * Separada de `nextWalkAction` a proposito: esa decide QUE boton mostrar (una
 * funcion de estado, sin reloj); esta decide si ESE boton ya se puede
 * apretar (una funcion de tiempo). Combinarlas hubiera obligado a los tests
 * de "que boton va en que estado" a inventar horarios que no les importan.
 *
 * Las reglas exactas viven en `@guau/shared` (canMarkOnWay/canStart/
 * canFinish) — el mismo paquete que usa el backend, asi que un boton
 * habilitado del lado del front nunca choca con un 400 del backend.
 */
export function walkActionAvailability(
  action: WalkTransition,
  timing: WalkActionTiming,
): WalkActionAvailability {
  const { scheduledAt, startedAt, durationMinutes, now } = timing;

  if (action === "onWay") {
    const availableAt = new Date(scheduledAt.getTime() - WALK_TIMING.ON_WAY_OPENS_MIN_BEFORE * MINUTE_MS);
    return canMarkOnWay(scheduledAt, now)
      ? { available: true, availableAt: null, closed: false }
      : { available: false, availableAt, closed: false };
  }

  if (action === "start") {
    const opensAt = new Date(scheduledAt.getTime() - WALK_TIMING.START_OPENS_MIN_BEFORE * MINUTE_MS);
    const closesAt = new Date(scheduledAt.getTime() + WALK_TIMING.START_CLOSES_MIN_AFTER * MINUTE_MS);
    if (canStart(scheduledAt, now)) return { available: true, availableAt: null, closed: false };
    // Despues del cierre no hay "se habilita a las": esa hora ya paso y no
    // va a volver. Mismo criterio que assertCanStart en el backend.
    if (now.getTime() > closesAt.getTime()) return { available: false, availableAt: null, closed: true };
    return { available: false, availableAt: opensAt, closed: false };
  }

  // "finish": IN_PROGRESS siempre trae startedAt (start() lo escribe y es el
  // unico camino a ese estado). Si llegara null igual, no hay fin esperado
  // que calcular todavia. No tiene techo superior, asi que "closed" nunca
  // aplica.
  if (!startedAt) return { available: false, availableAt: null, closed: false };
  const availableAt = new Date(
    expectedEndAt(startedAt, durationMinutes).getTime() - WALK_TIMING.FINISH_OPENS_MIN_BEFORE_END * MINUTE_MS,
  );
  return canFinish(startedAt, durationMinutes, now)
    ? { available: true, availableAt: null, closed: false }
    : { available: false, availableAt, closed: false };
}
