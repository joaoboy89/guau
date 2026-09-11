import { getDateShortcutRange, matchingShortcut } from "./date-shortcuts";

// 2026-09-10T01:00:00Z es 2026-09-09T22:00:00 EN ART (UTC-3) — un dia
// ANTES en Buenos Aires que en UTC. Es a proposito: si la implementacion
// usara la fecha UTC (o la del navegador, segun este configurado el
// entorno donde corre el test) en vez de ART, "hoy" daria "2026-09-10" y
// estos tests fallarian. Asi se prueba la zona horaria sin mockear Intl ni
// el reloj global.
const NOW_UTC_NEXT_DAY_IN_ART = new Date("2026-09-10T01:00:00.000Z");

describe("getDateShortcutRange", () => {
  it("EL TEST MAS IMPORTANTE: 'hoy' usa la fecha ART, no la UTC del instante", () => {
    const range = getDateShortcutRange("hoy", NOW_UTC_NEXT_DAY_IN_ART);
    expect(range).toEqual({ desde: "2026-09-09", hasta: "2026-09-09" });
  });

  it("'ayer' tambien en ART: un dia antes del hoy de Buenos Aires", () => {
    const range = getDateShortcutRange("ayer", NOW_UTC_NEXT_DAY_IN_ART);
    expect(range).toEqual({ desde: "2026-09-08", hasta: "2026-09-08" });
  });

  it("'7dias': desde = hace 7 dias (ART), hasta = hoy (ART)", () => {
    const range = getDateShortcutRange("7dias", NOW_UTC_NEXT_DAY_IN_ART);
    expect(range).toEqual({ desde: "2026-09-02", hasta: "2026-09-09" });
  });

  it("con un instante donde UTC y ART coinciden en el dia, el resultado es el esperado igual", () => {
    // 2026-09-10T15:00:00Z = 2026-09-10T12:00:00 ART, mismo dia en las dos
    const now = new Date("2026-09-10T15:00:00.000Z");
    expect(getDateShortcutRange("hoy", now)).toEqual({ desde: "2026-09-10", hasta: "2026-09-10" });
  });
});

describe("matchingShortcut", () => {
  it("detecta 'hoy' cuando los dos campos coinciden con el rango de hoy", () => {
    expect(matchingShortcut("2026-09-09", "2026-09-09", NOW_UTC_NEXT_DAY_IN_ART)).toBe("hoy");
  });

  it("detecta 'ayer'", () => {
    expect(matchingShortcut("2026-09-08", "2026-09-08", NOW_UTC_NEXT_DAY_IN_ART)).toBe("ayer");
  });

  it("detecta '7dias'", () => {
    expect(matchingShortcut("2026-09-02", "2026-09-09", NOW_UTC_NEXT_DAY_IN_ART)).toBe("7dias");
  });

  it("un rango tipeado a mano que no coincide con ningun atajo: null", () => {
    expect(matchingShortcut("2026-01-01", "2026-01-15", NOW_UTC_NEXT_DAY_IN_ART)).toBeNull();
  });

  it("campos vacios: null, no matchea 'hoy' por accidente", () => {
    expect(matchingShortcut("", "", NOW_UTC_NEXT_DAY_IN_ART)).toBeNull();
  });
});
