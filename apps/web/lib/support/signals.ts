import { formatDateTimeBA } from "@/lib/format-date";
import type { SupportWalkCase } from "./api";

// Motivo por el que el job/el paseador marcaron el paseo como NO REALIZADO.
// Valores reales de NotPerformedReason (schema.prisma) — no se inventan
// nombres. ON_WAY_NEVER_STARTED no estaba en la lista original que se le
// paso a este archivo la primera vez (el bug que este commit corrige: las
// señales originales nunca miraban `status` ni `notPerformedReason`), asi
// que el texto es criterio propio, con el mismo tono que los otros cuatro.
const NOT_PERFORMED_REASON_TEXT: Record<string, string> = {
  WALKER_NO_SHOW: "El paseador nunca marcó en camino y pasó la hora",
  OWNER_NO_SHOW: "El paseador declaró que el dueño no se presentó",
  NOBODY_ACTED: "Nadie apareció: ninguna de las dos partes actuó",
  NEVER_CONFIRMED: "El paseador nunca confirmó la reserva",
  ON_WAY_NEVER_STARTED: 'El paseador marcó "en camino" y después no inició el paseo',
};

const TERMINAL_NON_COMPLETED_STATUSES = ["NOT_PERFORMED", "CANCELLED_OWNER", "CANCELLED_WALKER"];

/**
 * La franja de señales (docs/diseños/modulo-soporte.md §7bis): solo lo
 * anómalo, nunca los ~25 campos del caso con el mismo peso. Cada línea sale
 * de un campo que ya existe — nada se calcula, solo se decide si se muestra.
 *
 * Encontrado probando en staging (2026-09-11): la primera versión de esta
 * función calculaba exactamente seis señales y ninguna miraba `status` ni
 * `notPerformedReason` — un paseo NOT_PERFORMED (que literalmente no se
 * hizo) mostraba "Sin señales, transcurrió normal". Las cuatro señales de
 * arriba (el desenlace del paseo y la plata) van primero: son el contexto
 * que explica por qué el caso está abierto, antes que los detalles menores
 * de cómo transcurrió.
 *
 * Funcion pura, testeable sin montar el componente (mismo criterio que
 * canCancelWalk/nextWalkAction en lib/walk-status.ts).
 */
export function getSupportSignals(walk: SupportWalkCase): string[] {
  const signals: string[] = [];

  if (walk.status === "NOT_PERFORMED") {
    const reason = walk.notPerformedReason;
    const reasonText = reason === null
      ? "sin motivo registrado"
      : (NOT_PERFORMED_REASON_TEXT[reason] ?? reason);
    signals.push(`El paseo NO SE REALIZÓ — ${reasonText}`);
  }

  if (walk.status === "CANCELLED_OWNER" || walk.status === "CANCELLED_WALKER") {
    const who = walk.status === "CANCELLED_OWNER" ? "el dueño" : "el paseador";
    signals.push(
      walk.cancellationReason
        ? `Cancelado por ${who} — ${walk.cancellationReason}`
        : `Cancelado por ${who}`,
    );
  }

  // "No se completó" acá significa un estado FINAL distinto de COMPLETED
  // (no realizado o cancelado) — no un paseo simplemente en curso. Un
  // CONFIRMED pago y todavía sin pasar es el caso de todos los días, no una
  // señal: marcarlo como anómalo llenaría de ruido cada paseo normal en
  // camino a completarse.
  if (TERMINAL_NON_COMPLETED_STATUSES.includes(walk.status) && walk.estabaPago) {
    signals.push("Había plata adentro y el paseo no se completó");
  }

  if (walk.refundedAt) {
    signals.push(`Ya se devolvió la plata (${formatDateTimeBA(new Date(walk.refundedAt))})`);
  }

  const startedWithoutCode = walk.startVerification === "NONE";

  if (startedWithoutCode) {
    signals.push(`Arrancó sin código — motivo: "${walk.startVerifyReason ?? "sin especificar"}"`);
  }

  if (walk.pickupCodeAttempts > 0) {
    const n = walk.pickupCodeAttempts;
    signals.push(`${n} intento${n === 1 ? "" : "s"} fallido${n === 1 ? "" : "s"} del código de retiro`);
  }

  if (walk.closedBy === "OWNER") {
    signals.push("Lo cerró el dueño, no el paseador");
  }

  if (walk.startedLate) {
    signals.push("Inicio tardío");
  }

  if (walk.endedLate) {
    signals.push("Cierre tardío");
  }

  if (startedWithoutCode && !walk.ownerAcknowledgedNoCodeAt) {
    signals.push("El dueño todavía no dio conformidad del arranque sin código");
  }

  return signals;
}

/**
 * Regla que ordena la franja entera (docs/diseños/modulo-soporte.md §7bis):
 * "Sin señales" SOLO puede aparecer si el paseo llegó a COMPLETED. Cualquier
 * otro estado final ES una diferencia entre lo pactado y lo ocurrido — un
 * paseo que no ocurrió nunca "transcurrió normal". Si el paseo está EN
 * CURSO, el texto tampoco puede decir eso: todavía no transcurrió.
 *
 * En la práctica, con getSupportSignals() de arriba, un estado NOT_PERFORMED
 * o CANCELLED_* siempre deja al menos una señal (la del desenlace) — así
 * que un array vacío + status !== COMPLETED solo puede pasar con un paseo
 * en curso. Igual esta función no depende de esa garantía implícita: decide
 * explícito por status, no por longitud de array.
 */
export function getEmptySignalsMessage(status: string): string {
  if (status === "COMPLETED") {
    return "Sin señales — este paseo transcurrió normal.";
  }
  return "Sin novedades todavía — el paseo está en curso, todavía no terminó.";
}
