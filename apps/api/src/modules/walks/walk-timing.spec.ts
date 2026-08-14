import { WALK_TIMING, canMarkOnWay, canStart, canFinish, expectedEndAt } from '@guau/shared';

// Tests de las funciones puras del bloque A (docs/guau-politicas.md §2).
// Viven acá y no en packages/shared porque ese paquete no tiene jest
// configurado — no se monta infraestructura de testing nueva ahí sin
// avisar. Todas usan fechas fijas (no Date.now()): son funciones puras, así
// que no hay motivo para depender del reloj real y arriesgar flakiness.

const SCHEDULED_AT = new Date('2026-08-14T18:00:00.000Z'); // T

describe('canMarkOnWay (@guau/shared)', () => {
  const opensAt = new Date(SCHEDULED_AT.getTime() - WALK_TIMING.ON_WAY_OPENS_MIN_BEFORE * 60_000); // T-3h

  it('justo antes de T-3h: false', () => {
    expect(canMarkOnWay(SCHEDULED_AT, new Date(opensAt.getTime() - 1))).toBe(false);
  });

  it('exactamente en T-3h: true (límite inclusive)', () => {
    expect(canMarkOnWay(SCHEDULED_AT, opensAt)).toBe(true);
  });

  it('justo después de T-3h: true', () => {
    expect(canMarkOnWay(SCHEDULED_AT, new Date(opensAt.getTime() + 1))).toBe(true);
  });

  it('no tiene techo superior: sigue true mucho después de T', () => {
    const muchoDespues = new Date(SCHEDULED_AT.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(canMarkOnWay(SCHEDULED_AT, muchoDespues)).toBe(true);
  });
});

describe('canStart (@guau/shared)', () => {
  const opensAt = new Date(SCHEDULED_AT.getTime() - WALK_TIMING.START_OPENS_MIN_BEFORE * 60_000); // T-5m
  const closesAt = new Date(SCHEDULED_AT.getTime() + WALK_TIMING.START_CLOSES_MIN_AFTER * 60_000); // T+10m

  it('justo antes de T-5m: false', () => {
    expect(canStart(SCHEDULED_AT, new Date(opensAt.getTime() - 1))).toBe(false);
  });

  it('exactamente en T-5m: true (límite inclusive)', () => {
    expect(canStart(SCHEDULED_AT, opensAt)).toBe(true);
  });

  it('justo después de T-5m: true', () => {
    expect(canStart(SCHEDULED_AT, new Date(opensAt.getTime() + 1))).toBe(true);
  });

  it('exactamente en T (zona dulce): true', () => {
    expect(canStart(SCHEDULED_AT, SCHEDULED_AT)).toBe(true);
  });

  it('justo antes de T+10m: true', () => {
    expect(canStart(SCHEDULED_AT, new Date(closesAt.getTime() - 1))).toBe(true);
  });

  it('exactamente en T+10m: true (límite inclusive)', () => {
    expect(canStart(SCHEDULED_AT, closesAt)).toBe(true);
  });

  it('justo después de T+10m: false', () => {
    expect(canStart(SCHEDULED_AT, new Date(closesAt.getTime() + 1))).toBe(false);
  });
});

describe('expectedEndAt (@guau/shared)', () => {
  it('suma la duración del WalkType al instante de inicio', () => {
    const startedAt = new Date('2026-08-14T18:05:00.000Z');
    expect(expectedEndAt(startedAt, 45)).toEqual(new Date('2026-08-14T18:50:00.000Z'));
  });

  it('duración 0 devuelve el mismo instante', () => {
    const startedAt = new Date('2026-08-14T18:05:00.000Z');
    expect(expectedEndAt(startedAt, 0)).toEqual(startedAt);
  });
});

describe('canFinish (@guau/shared)', () => {
  const startedAt = new Date('2026-08-14T18:00:00.000Z');
  const durationMinutes = 60;
  const expectedEnd = expectedEndAt(startedAt, durationMinutes); // 19:00
  const opensAt = new Date(expectedEnd.getTime() - WALK_TIMING.FINISH_OPENS_MIN_BEFORE_END * 60_000); // 18:45

  it('justo antes de fin esperado - 15m: false', () => {
    expect(canFinish(startedAt, durationMinutes, new Date(opensAt.getTime() - 1))).toBe(false);
  });

  it('exactamente en fin esperado - 15m: true (límite inclusive)', () => {
    expect(canFinish(startedAt, durationMinutes, opensAt)).toBe(true);
  });

  it('justo después de fin esperado - 15m: true', () => {
    expect(canFinish(startedAt, durationMinutes, new Date(opensAt.getTime() + 1))).toBe(true);
  });

  it('no tiene techo superior: sigue true mucho después del fin esperado', () => {
    const muchoDespues = new Date(expectedEnd.getTime() + 5 * 60 * 60 * 1000);
    expect(canFinish(startedAt, durationMinutes, muchoDespues)).toBe(true);
  });
});
