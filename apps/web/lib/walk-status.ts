export const STATUS_LABEL: Record<string, string> = {
  PENDING:          "Pendiente de confirmación",
  CONFIRMED:        "Confirmado",
  WALKER_ON_WAY:    "Paseador en camino",
  IN_PROGRESS:      "Paseo en curso",
  COMPLETED:        "Completado",
  CANCELLED_OWNER:  "Cancelado por el dueño",
  CANCELLED_WALKER: "Cancelado por el paseador",
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
 * llega cinco minutos tarde. El backend tampoco mira la fecha en ninguna de
 * las tres transiciones. La tolerancia y el no-show del dueño son un bloque
 * propio, todavia sin diseñar (ver backlog).
 */
export function isActiveWalk(status: string): boolean {
  return nextWalkAction(status) !== null;
}
