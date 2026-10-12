import { isTodayBA, formatDateShortBA, formatDateTimeBA } from "./format-date";

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

describe("formatDateShortBA", () => {
  it("da 'D mes YYYY' sin los 'de' que mete dateStyle: medium en es-AR", () => {
    expect(formatDateShortBA(new Date("2026-07-23T11:46:00Z"))).toBe("23 jul 2026");
  });

  it("interpreta la fecha en hora de Buenos Aires, no UTC", () => {
    // 23:30 UTC del 17/08 es 20:30 ART del mismo dia — no cruza al 18.
    expect(formatDateShortBA(new Date("2026-08-17T23:30:00Z"))).toBe("17 ago 2026");
    // 02:30 UTC del 18/08 es 23:30 ART del 17/08 — sí cruza para atrás.
    expect(formatDateShortBA(new Date("2026-08-18T02:30:00Z"))).toBe("17 ago 2026");
  });
});

describe("formatDateTimeBA", () => {
  // El motivo de este describe no es cobertura: es que `toLocaleString`
  // SIN `timeZone` usa el huso del DISPOSITIVO que corre el proceso. Si
  // alguien le sacara el `timeZone: BUENOS_AIRES_TIMEZONE` al helper, una
  // maquina ya en ART (como puede ser esta) daria la misma salida por
  // coincidencia y el test no detectaria nada. Forzamos TZ=UTC — el mismo
  // huso en el que corre el CI de GitHub Actions — para que un helper que
  // perdio el timeZone explicito falle acá, no en producción.
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "UTC";
  });

  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it("formatea en hora de Buenos Aires aunque el proceso corra en UTC", () => {
    // 2026-07-23T11:46:00Z = 8:46 ART (UTC-3). Con TZ=UTC, un helper sin
    // timeZone explicito daria "11:46", no "8:46".
    expect(formatDateTimeBA(new Date("2026-07-23T11:46:00Z"))).toBe(
      "23 de julio de 2026, 8:46 a. m.",
    );
  });

  it("cruza el dia para atrás igual que formatDateShortBA — Buenos Aires manda, no UTC", () => {
    // 2026-08-18T02:30:00Z es 23:30 ART del 17/08. Con TZ=UTC, un helper
    // sin timeZone explicito diria "18 de agosto", el dia siguiente.
    expect(formatDateTimeBA(new Date("2026-08-18T02:30:00Z"))).toBe(
      "17 de agosto de 2026, 11:30 p. m.",
    );
  });
});
