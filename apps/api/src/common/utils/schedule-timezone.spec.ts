import { toBusinessDayAndTime, startOfBusinessDay, endOfBusinessDay } from './schedule-timezone';

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

describe('startOfBusinessDay / endOfBusinessDay', () => {
  // El bug que esto reemplaza (fix del filtro de fechas de soporte): new
  // Date("2026-09-10") es medianoche UTC — 21:00 del día anterior en ART —
  // así que "desde = hasta = 2026-09-10" con la implementación vieja
  // buscaba el rango [00:00 UTC, 00:00 UTC), que en ART es [21:00 del 9,
  // 21:00 del 9): un instante de duración cero. CUALQUIER paseo, sin
  // importar la hora, quedaba afuera. Es la segunda vez que la TZ del
  // proceso se cuela donde tenía que ir la del negocio (la primera fue
  // "fix(walks): validacion de horarios usaba la TZ del proceso, no ART").

  it('startOfBusinessDay: el instante es medianoche EN ART, no en UTC', () => {
    const start = startOfBusinessDay('2026-09-10');
    // 2026-09-10T00:00:00 ART = 2026-09-10T03:00:00Z (ART = UTC-3)
    expect(start.toISOString()).toBe('2026-09-10T03:00:00.000Z');
  });

  it('endOfBusinessDay: el instante es el último milisegundo del día EN ART', () => {
    const end = endOfBusinessDay('2026-09-10');
    // 2026-09-10T23:59:59.999 ART = 2026-09-11T02:59:59.999Z
    expect(end.toISOString()).toBe('2026-09-11T02:59:59.999Z');
  });

  it('EL CASO MAS COMUN: desde = hasta = un mismo día devuelve ese día entero, no un rango vacío', () => {
    const start = startOfBusinessDay('2026-09-10');
    const end = endOfBusinessDay('2026-09-10');
    expect(start.getTime()).toBeLessThan(end.getTime());
    // Con el bug viejo (new Date(desde) === new Date(hasta), las dos a
    // medianoche UTC) start === end: un rango de duración cero.
  });

  it('un paseo a las 23:30 ART de ese día ENTRA en el rango', () => {
    // 23:30 ART = 2026-09-11T02:30:00Z
    const walkAt = new Date('2026-09-11T02:30:00.000Z');
    const start = startOfBusinessDay('2026-09-10');
    const end = endOfBusinessDay('2026-09-10');
    expect(walkAt.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(walkAt.getTime()).toBeLessThanOrEqual(end.getTime());
  });

  it('un paseo a las 00:30 ART del día SIGUIENTE queda AFUERA del rango de "hasta"', () => {
    // 2026-09-11T00:30:00 ART = 2026-09-11T03:30:00Z
    const walkNextDay = new Date('2026-09-11T03:30:00.000Z');
    const end = endOfBusinessDay('2026-09-10');
    expect(walkNextDay.getTime()).toBeGreaterThan(end.getTime());
  });

  it('acepta el prefijo de un ISO mas largo, no solo "YYYY-MM-DD" pelado', () => {
    const start = startOfBusinessDay('2026-09-10T15:00:00.000Z');
    expect(start.toISOString()).toBe('2026-09-10T03:00:00.000Z');
  });
});
