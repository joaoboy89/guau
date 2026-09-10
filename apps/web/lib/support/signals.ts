import type { SupportWalkCase } from "./api";

/**
 * La franja de señales (docs/diseños/modulo-soporte.md §7bis): solo lo
 * anómalo, nunca los ~25 campos del caso con el mismo peso. Cada línea sale
 * de un campo que ya existe — nada se calcula, solo se decide si se muestra.
 *
 * Funcion pura, testeable sin montar el componente (mismo criterio que
 * canCancelWalk/nextWalkAction en lib/walk-status.ts).
 */
export function getSupportSignals(walk: SupportWalkCase): string[] {
  const signals: string[] = [];

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
