// Espejo del enum del backend (schema.prisma) — cuatro estados, no tres
// (docs/diseños/verificacion-de-paseadores.md §6).
export type VerificationStatus = "PENDING" | "VERIFIED" | "SUSPENDED" | "REJECTED";

export type VerifyAction = "approve" | "reject" | "suspend" | "reinstate";

export const STATUS_TABS: Array<{ status: VerificationStatus; label: string }> = [
  { status: "PENDING", label: "Pendientes" },
  { status: "VERIFIED", label: "Verificados" },
  { status: "SUSPENDED", label: "Suspendidos" },
  { status: "REJECTED", label: "Rechazados" },
];

export const STATUS_BADGE: Record<
  VerificationStatus,
  { label: string; variant: "success" | "warning" | "error" | "default" }
> = {
  PENDING: { label: "Pendiente", variant: "warning" },
  // "Identidad verificada", no "Verificado" — decir exactamente qué se hizo,
  // no lo que suena bien (docs/diseños/verificacion-de-paseadores.md §5).
  VERIFIED: { label: "Identidad verificada", variant: "success" },
  SUSPENDED: { label: "Suspendido", variant: "warning" },
  REJECTED: { label: "Rechazado", variant: "error" },
};

export const ACTION_LABEL: Record<VerifyAction, string> = {
  // "Verificar", no "Aprobar" — la pantalla ya dice "Verificar paseadores"
  // y la insignia dice "Identidad verificada" (docs/diseños/
  // verificacion-de-paseadores.md §8: "Tres acciones: verificar / suspender
  // / dar de baja"). Tres palabras para una sola accion confundio a Joa
  // mismo probando la pantalla — si le paso a el, le pasa a cualquiera.
  approve: "Verificar",
  reject: "Rechazar",
  suspend: "Suspender",
  reinstate: "Reactivar",
};

// Espejo exacto de las transiciones que permite AdminService.verifyWalker —
// no una regla nueva del front. REJECTED es terminal: sin acciones. approve
// no aparece desde SUSPENDED porque ese camino de vuelta es "reinstate"
// (exige nota, no se puede saltear).
export const AVAILABLE_ACTIONS: Record<VerificationStatus, VerifyAction[]> = {
  PENDING: ["approve", "suspend", "reject"],
  VERIFIED: ["suspend", "reject"],
  SUSPENDED: ["reinstate", "reject"],
  REJECTED: [],
};

export function actionRequiresNotes(action: VerifyAction): boolean {
  return action === "reject" || action === "suspend" || action === "reinstate";
}

// Unico caso con confirmación extra: REJECTED es terminal, no hay vuelta
// atrás (docs/diseños/verificacion-de-paseadores.md §6).
export function actionRequiresExtraConfirmation(action: VerifyAction): boolean {
  return action === "reject";
}

// El historial de notas es texto plano con una línea por evento, nunca se
// pisa (ver AdminService.appendNote) — acá solo se separa para mostrarlo
// como lista, no se interpreta el contenido de cada línea.
export function parseNotesHistory(notes: string | null): string[] {
  if (!notes) return [];
  return notes.split("\n").filter((line) => line.trim().length > 0);
}
