/**
 * `mpPaymentId` guarda el preference id (string con guiones) al iniciar el
 * checkout y recién el payment id (numérico) cuando el webhook acredita.
 * Solo el numérico significa "pagado": un checkout abandonado deja el
 * preference id ahí y no hay un peso cobrado.
 */
export function isWalkPaid(mpPaymentId: string | null | undefined): boolean {
  return /^\d+$/.test(mpPaymentId ?? "");
}
