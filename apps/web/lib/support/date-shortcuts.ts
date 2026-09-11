import { dateKeyBA } from "@/lib/format-date";
import type { SupportSearchFields } from "./search-params";

// Atajos de fecha (docs/diseños/modulo-soporte.md §7bis, decision de Joa
// 2026-09-11): lo que una persona dice no es una fecha, es "ayer" o "el 20
// de septiembre" — el problema es tipear una fecha correctamente, no la
// precision de la hora. NO son un mecanismo aparte: llenan los mismos dos
// campos de fecha que ya existen (desde/hasta), un atajo, no otra logica.
export type DateShortcut = "hoy" | "ayer" | "7dias";

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

/**
 * El "hoy"/"ayer" se calculan en HORA ARGENTINA, no en la del navegador de
 * quien mira (dateKeyBA usa Intl con timeZone explicito — mismo criterio que
 * el backend en schedule-timezone.ts, "la zona horaria del negocio vive en
 * un solo lugar"). Si alguien abre el panel desde otro pais, "ayer" tiene
 * que seguir siendo el ayer de Buenos Aires: el negocio pasa aca.
 *
 * `now` es parametro (default `new Date()`) para poder testear sin mockear
 * el reloj global.
 */
export function getDateShortcutRange(
  shortcut: DateShortcut,
  now: Date = new Date(),
): Pick<SupportSearchFields, "desde" | "hasta"> {
  const today = dateKeyBA(now);

  if (shortcut === "hoy") {
    return { desde: today, hasta: today };
  }

  if (shortcut === "ayer") {
    const yesterday = dateKeyBA(shiftDays(now, -1));
    return { desde: yesterday, hasta: yesterday };
  }

  // "7dias" — Ultimos 7 dias: desde = hace 7 dias, hasta = hoy.
  return { desde: dateKeyBA(shiftDays(now, -7)), hasta: today };
}

/**
 * Que atajo, si alguno, corresponde a los valores actuales de desde/hasta —
 * para que el boton se vea seleccionado cuando las fechas coinciden con su
 * rango. Sin esto, apretar un atajo llena los campos pero no pasa nada
 * visible.
 */
export function matchingShortcut(
  desde: string,
  hasta: string,
  now: Date = new Date(),
): DateShortcut | null {
  const shortcuts: DateShortcut[] = ["hoy", "ayer", "7dias"];
  for (const shortcut of shortcuts) {
    const range = getDateShortcutRange(shortcut, now);
    if (range.desde === desde && range.hasta === hasta) return shortcut;
  }
  return null;
}
