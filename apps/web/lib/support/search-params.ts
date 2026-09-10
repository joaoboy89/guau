import type { SupportSearchQuery } from "./api";

export interface SupportSearchFields {
  idPrefix: string;
  email: string;
  desde: string;
  hasta: string;
}

/**
 * Deny-by-default en el front, ademas del backend (docs/diseños/modulo-
 * soporte.md §4: "es defensa en las dos capas, a proposito"). Si los cuatro
 * campos estan vacios, devuelve null y la pantalla NO llama a la API — ni
 * siquiera manda el request para que el backend conteste vacio.
 *
 * Extraida como funcion pura (no inline en el form) para poder testearla sin
 * montar el componente: el proyecto no tiene infraestructura de render de
 * componentes (ver el comentario de canCancelWalk en lib/walk-status.ts).
 */
export function buildSearchQuery(fields: SupportSearchFields): SupportSearchQuery | null {
  const idPrefix = fields.idPrefix.trim();
  const email = fields.email.trim();
  const desde = fields.desde.trim();
  const hasta = fields.hasta.trim();

  if (!idPrefix && !email && !desde && !hasta) return null;

  const query: SupportSearchQuery = {};
  if (idPrefix) query.idPrefix = idPrefix;
  if (email) query.email = email;
  if (desde) query.desde = desde;
  if (hasta) query.hasta = hasta;
  return query;
}
