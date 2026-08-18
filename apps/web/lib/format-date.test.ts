import { isTodayBA } from "./format-date";

describe("isTodayBA", () => {
  beforeEach(() => {
    // "ahora" = 2026-08-18T01:30:00Z = 17/08 22:30 en Buenos Aires (UTC-3).
    jest.useFakeTimers().setSystemTime(new Date("2026-08-18T01:30:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("es hoy si cae en el mismo dia en Buenos Aires, aunque el dia UTC ya cambio", () => {
    // 17/08 23:00 ART = 18/08 02:00 UTC: dia UTC distinto del "ahora" (18/08),
    // pero mismo dia en Buenos Aires (17/08) — es el caso que rompe si se
    // compara por dia UTC o por dia local del dispositivo en vez de BA.
    expect(isTodayBA(new Date("2026-08-17T23:00:00-03:00"))).toBe(true);
  });

  it("no es hoy si en Buenos Aires ya es el dia siguiente", () => {
    expect(isTodayBA(new Date("2026-08-18T00:30:00-03:00"))).toBe(false);
  });

  it("no es hoy para un paseo de varios dias despues (caso real de staging)", () => {
    // El bug real: un paseo agendado nueve dias despues mostraba "a las 8:15"
    // como si fuera hoy.
    expect(isTodayBA(new Date("2026-08-26T08:15:00-03:00"))).toBe(false);
  });
});
