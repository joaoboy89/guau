import { toBusinessDayAndTime } from './schedule-timezone';

describe('toBusinessDayAndTime', () => {
  it('convierte un instante UTC que NO cruza el día a hora argentina (día normal, franja 9-18)', () => {
    // 2026-07-06 (lunes) 12:00 UTC = 09:00 ART (mismo día)
    const result = toBusinessDayAndTime(new Date('2026-07-06T12:00:00.000Z'));
    expect(result).toEqual({ dayOfWeek: 1, timeStr: '09:00' }); // 1 = Lun
  });

  it('convierte un instante UTC que SÍ cruza el día — martes 21:00 ART es miércoles 00:00 UTC', () => {
    // 2026-07-08 (miércoles) 00:00 UTC = martes 21:00 ART
    const result = toBusinessDayAndTime(new Date('2026-07-08T00:00:00.000Z'));
    expect(result).toEqual({ dayOfWeek: 2, timeStr: '21:00' }); // 2 = Mar
  });

  it('medianoche exacta en ART da "00:00", no "24:00" (quirk histórico de hour12 en ICU)', () => {
    // 2026-07-08T03:00:00Z = 2026-07-08T00:00:00 ART
    const result = toBusinessDayAndTime(new Date('2026-07-08T03:00:00.000Z'));
    expect(result.timeStr).toBe('00:00');
  });

  it('rellena hora/minuto de un solo dígito con cero a la izquierda', () => {
    // 2026-07-06T12:05:00Z = 09:05 ART
    const result = toBusinessDayAndTime(new Date('2026-07-06T12:05:00.000Z'));
    expect(result.timeStr).toBe('09:05');
  });

  // Nota sobre el bug que esto reemplaza: Date.prototype.getDay()/toTimeString()
  // usan la TZ LOCAL DEL PROCESO, no una TZ fija. En el contenedor de producción
  // (que corre en UTC) esas llamadas para el instante de arriba habrían devuelto
  // miércoles 00:00 en vez de martes 21:00 — un día de más. toBusinessDayAndTime
  // usa Intl con timeZone explícito, así que el resultado no depende de en qué TZ
  // esté corriendo el proceso (a diferencia de forzar process.env.TZ en un test,
  // que no es fiable: V8 cachea la TZ resuelta y no siempre la re-lee en caliente).
});
