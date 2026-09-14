export const BUENOS_AIRES_TIMEZONE = "America/Argentina/Buenos_Aires";

/**
 * Toda hora que se le muestra a un humano tiene que ser la de Buenos Aires,
 * sin importar en que huso este el dispositivo. `toLocaleString("es-AR", ...)`
 * sin `timeZone` usa la zona del DISPOSITIVO con formato argentino — misma
 * pinta, hora equivocada si el celular esta en otro huso o mal configurado.
 */
export function formatDateTimeBA(date: Date): string {
  return date.toLocaleString("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: BUENOS_AIRES_TIMEZONE,
  });
}

/**
 * "23 jul 2026" en hora de Buenos Aires — para listados donde la fecha
 * completa (formatDateTimeBA) rompe el alto de fila. `dateStyle: "medium"`
 * en es-AR devuelve "23 de jul de 2026" (con los "de" intercalados); se arma
 * a mano con formatToParts para sacarlos sin perder el mes en letras ni la
 * zona horaria correcta.
 */
export function formatDateShortBA(date: Date): string {
  const parts = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: BUENOS_AIRES_TIMEZONE,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}`;
}

/** Solo "HH:MM" en hora de Buenos Aires — para leyendas cortas. */
export function formatTimeBA(date: Date): string {
  return date.toLocaleString("es-AR", {
    timeStyle: "short",
    timeZone: BUENOS_AIRES_TIMEZONE,
  });
}

/** "YYYY-MM-DD" en hora de Buenos Aires — clave de dia, no para mostrar. */
export function dateKeyBA(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: BUENOS_AIRES_TIMEZONE });
}

/**
 * Si `date` cae en el mismo dia que "ahora", ambos en hora de Buenos Aires.
 * Comparar `date.getDate()`/`new Date()` a secas usa el dia del DISPOSITIVO:
 * mismo bug que formatDateTimeBA evita, pero para "hoy" en vez de la hora —
 * alguien con el celular en otro huso veria "hoy" cuando en Buenos Aires ya
 * es otro dia (o todavia no llego).
 */
export function isTodayBA(date: Date): boolean {
  return dateKeyBA(date) === dateKeyBA(new Date());
}
