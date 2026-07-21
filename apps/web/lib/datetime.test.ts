import { toDatetimeLocalValue } from "./datetime";

describe("toDatetimeLocalValue", () => {
  it("formatea usando los componentes de hora LOCAL, no UTC", () => {
    // 31 de diciembre 23:30 hora local — si usara toISOString (UTC) en un huso
    // horario negativo (ej. Argentina, UTC-3) esto se correría al 1 de enero.
    const date = new Date(2026, 11, 31, 23, 30);
    expect(toDatetimeLocalValue(date)).toBe("2026-12-31T23:30");
  });

  it("rellena con ceros mes, día, hora y minuto de un solo dígito", () => {
    const date = new Date(2026, 0, 5, 9, 5);
    expect(toDatetimeLocalValue(date)).toBe("2026-01-05T09:05");
  });

  it("produce un valor compatible con el atributo min de <input type=\"datetime-local\">", () => {
    const date = new Date(2026, 6, 21, 14, 0);
    expect(toDatetimeLocalValue(date)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
