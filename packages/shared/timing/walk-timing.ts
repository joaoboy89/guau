import { WALK_TIMING } from "../constants/index";

const MINUTE_MS = 60_000;

/**
 * Todas las comparaciones de este archivo son entre dos instantes absolutos
 * (`now` contra `scheduledAt`/`startedAt` con un offset) — el resultado es el
 * mismo en cualquier zona horaria, asi que no hay conversion de TZ que hacer
 * aca (a diferencia de `toBusinessDayAndTime`, que existe para franjas de
 * pared de `WalkerSchedule`). Ver payments.service.ts:83 para el mismo
 * criterio ya aplicado.
 */

/**
 * "Voy en camino" se habilita desde T-3h y no tiene techo: una vez abierta la
 * ventana, queda abierta. Ver WALK_TIMING.ON_WAY_OPENS_MIN_BEFORE.
 */
export function canMarkOnWay(scheduledAt: Date, now: Date): boolean {
  return now.getTime() >= scheduledAt.getTime() - WALK_TIMING.ON_WAY_OPENS_MIN_BEFORE * MINUTE_MS;
}

/**
 * Se habilita desde T-5m y no tiene techo superior — mismo criterio que
 * `canMarkOnWay`: evidencia, no candado. Un corte duro no evita que el
 * paseo pase, lo empuja afuera de la app (y ahi se pierde el registro, el
 * GPS y la comision). Quien llega tarde igual puede iniciar; que llego
 * tarde queda registrado aparte (ver WALK_TIMING.START_LATE_THRESHOLD_MIN_AFTER
 * y Walk.startedLate), no bloqueado.
 */
export function canStart(scheduledAt: Date, now: Date): boolean {
  const opensAt = scheduledAt.getTime() - WALK_TIMING.START_OPENS_MIN_BEFORE * MINUTE_MS;
  return now.getTime() >= opensAt;
}

/** Fin esperado del paseo: cuando arranco mas la duracion de su WalkType. */
export function expectedEndAt(startedAt: Date, durationMinutes: number): Date {
  return new Date(startedAt.getTime() + durationMinutes * MINUTE_MS);
}

/**
 * finish se habilita 15 minutos antes del fin esperado y no tiene techo
 * superior (puede cerrar antes si no hay ningun problema). Ver
 * WALK_TIMING.FINISH_OPENS_MIN_BEFORE_END.
 */
export function canFinish(startedAt: Date, durationMinutes: number, now: Date): boolean {
  const opensAt = expectedEndAt(startedAt, durationMinutes).getTime() - WALK_TIMING.FINISH_OPENS_MIN_BEFORE_END * MINUTE_MS;
  return now.getTime() >= opensAt;
}
