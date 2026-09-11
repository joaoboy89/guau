// Convención de negocio: las franjas de WalkerSchedule (dayOfWeek/startTime/endTime)
// se cargan y se interpretan SIEMPRE en hora argentina — el producto es
// CABA/GBA exclusivamente, así que no hace falta que sea configurable por env var.
//
// Esto importa porque scheduledAt (y cualquier fecha que se compare contra una
// franja) se guarda como instante UTC. El contenedor de producción corre en UTC,
// así que Date.prototype.getDay()/toTimeString() (hora LOCAL DEL PROCESO) dan el
// día y la hora equivocados para una reserva nocturna — ej. martes 21:00 ART es
// miércoles 00:00 UTC, y ".getDay()" en un proceso UTC devolvería miércoles.
export const BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export interface BusinessDayAndTime {
  dayOfWeek: number; // 0=Dom ... 6=Sáb, igual que WalkerSchedule.dayOfWeek
  timeStr: string;   // "HH:MM", comparable directo contra WalkerSchedule.startTime/endTime
}

// Convierte un instante (Date, cualquier TZ de origen) al día de semana y la
// hora "HH:MM" que le corresponden en hora argentina — sin importar en qué TZ
// esté corriendo el proceso Node. hourCycle "h23" evita el viejo quirk de
// hour12:false devolviendo "24" en vez de "00" a medianoche en algunos motores ICU.
export function toBusinessDayAndTime(date: Date): BusinessDayAndTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  return {
    dayOfWeek: WEEKDAY_TO_INDEX[weekday] ?? date.getUTCDay(),
    timeStr: `${hour}:${minute}`,
  };
}

// Offset de una IANA timezone en un instante dado, en minutos, tal que
// wallClock(instante) === instante + offset (los dos leídos como el número
// de timestamp UTC-equivalente de esa fecha/hora). No hardcodea -03:00 a
// propósito: Argentina hoy no tiene horario de verano, pero lo tuvo y podría
// volver a tenerlo — un offset fijo es una bomba con retardo. Formatea el
// instante en la timezone pedida y vuelve a leerlo como si fuera UTC; la
// diferencia contra el instante real ES el offset.
function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUTC - date.getTime()) / 60_000;
}

// "YYYY-MM-DD" (o el prefijo de un ISO mas largo) interpretado como un DIA DE
// CALENDARIO EN HORA ARGENTINA, no como un instante UTC. `new Date("2026-09-
// 10")` da medianoche UTC — 21:00 del dia anterior en ART — que es
// exactamente el bug que esto reemplaza (ver el fix del filtro de fechas de
// soporte, y antes "fix(walks): validacion de horarios usaba la TZ del
// proceso, no ART": es la segunda vez que este mismo error se cuela).
function parseBusinessCalendarDate(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

// El offset se calcula SIEMPRE sobre un instante redondeado al segundo — los
// milisegundos se suman aparte, después. Intl.DateTimeFormat no reporta
// milisegundos, así que calcular el offset directo sobre un instante con
// .999ms (el fin del día) reintroducía esos .999ms como ruido en el propio
// offset (una resta de dos instantes que difieren solo en el redondeo del
// formatter) y corría el resultado casi un segundo entero. Separar "a qué
// hora entera" de "con qué milisegundo" evita el problema de raíz.
function businessCalendarInstant(
  y: number, m: number, d: number,
  hh: number, mm: number, ss: number, ms: number,
): Date {
  const naiveUTCSeconds = Date.UTC(y, m - 1, d, hh, mm, ss, 0);
  const offsetMin = getTimeZoneOffsetMinutes(new Date(naiveUTCSeconds), BUSINESS_TIMEZONE);
  return new Date(naiveUTCSeconds - offsetMin * 60_000 + ms);
}

/** El instante en que arranca ese día de calendario en hora argentina (00:00:00.000 ART). */
export function startOfBusinessDay(dateStr: string): Date {
  const { y, m, d } = parseBusinessCalendarDate(dateStr);
  return businessCalendarInstant(y, m, d, 0, 0, 0, 0);
}

/** El instante en que termina ese día de calendario en hora argentina (23:59:59.999 ART). */
export function endOfBusinessDay(dateStr: string): Date {
  const { y, m, d } = parseBusinessCalendarDate(dateStr);
  return businessCalendarInstant(y, m, d, 23, 59, 59, 999);
}
