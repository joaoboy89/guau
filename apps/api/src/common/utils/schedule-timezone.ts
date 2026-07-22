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
