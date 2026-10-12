import type { UserRole } from "./store";

// ─── Destino de una notificacion al hacer click — funcion pura, testeable
// sin montar NotificationsBell (mismo criterio que classifyAuthMeError en
// lib/auth.ts) ────────────────────────────────────────────────────────────
//
// La regla es por ROL, no por tipo de notificacion: el paseador no tiene
// pantalla de detalle de paseo (su unica ruta es /walker/dashboard) y al
// dueño todas sus notificaciones lo mandan al mismo lugar, /walks/{walkId}.
// Una tabla tipo → destino habria que mantenerla cada vez que nace un tipo
// de notificacion nuevo; la regla por rol cubre sola los tipos que todavia
// no existen, sin que nadie tenga que acordarse de agregar una fila.
//
// Falla cerrado: si no hay walkId usable, no hay link. Un link a
// /walks/undefined es peor que no tener link — manda a una pantalla rota
// en vez de dejar al usuario donde estaba.
export function notificationHref(role: UserRole, data: unknown): string | null {
  if (role === "walker") return "/walker/dashboard";

  if (role === "owner") {
    const walkId = extractWalkId(data);
    return walkId ? `/walks/${walkId}` : null;
  }

  // admin (o cualquier rol futuro sin regla propia): sin destino conocido
  // todavia — no se inventa uno.
  return null;
}

function extractWalkId(data: unknown): string | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const walkId = (data as Record<string, unknown>).walkId;
  return typeof walkId === "string" && walkId.length > 0 ? walkId : null;
}
