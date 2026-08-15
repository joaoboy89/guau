import { canCancelWalk, isActiveWalk, nextWalkAction, walkActionAvailability } from "./walk-status";

describe("canCancelWalk", () => {
  it("permite cancelar un paseo PENDING sin pagar", () => {
    expect(canCancelWalk("PENDING", false)).toBe(true);
  });

  it("permite cancelar un paseo CONFIRMED sin pagar", () => {
    expect(canCancelWalk("CONFIRMED", false)).toBe(true);
  });

  it("NO permite cancelar un paseo CONFIRMED ya pagado", () => {
    expect(canCancelWalk("CONFIRMED", true)).toBe(false);
  });

  it("NO permite cancelar un paseo en un estado no cancelable (ej. IN_PROGRESS)", () => {
    expect(canCancelWalk("IN_PROGRESS", false)).toBe(false);
  });

  it("NO permite cancelar un paseo ya COMPLETED", () => {
    expect(canCancelWalk("COMPLETED", false)).toBe(false);
  });

  it("NO permite cancelar un paseo ya cancelado", () => {
    expect(canCancelWalk("CANCELLED_OWNER", false)).toBe(false);
    expect(canCancelWalk("CANCELLED_WALKER", false)).toBe(false);
  });
});

describe("nextWalkAction", () => {
  it("CONFIRMED ofrece salir hacia el pickup", () => {
    expect(nextWalkAction("CONFIRMED")).toEqual({
      label: "Voy en camino",
      action: "onWay",
      needsConfirm: false,
    });
  });

  it("WALKER_ON_WAY ofrece iniciar el paseo", () => {
    expect(nextWalkAction("WALKER_ON_WAY")).toEqual({
      label: "Iniciar paseo",
      action: "start",
      needsConfirm: false,
    });
  });

  it("IN_PROGRESS ofrece finalizar, y pide confirmacion porque es irreversible", () => {
    expect(nextWalkAction("IN_PROGRESS")).toEqual({
      label: "Finalizar paseo",
      action: "finish",
      needsConfirm: true,
    });
  });

  it("PENDING no tiene accion del paseador aca — se confirma o se rechaza arriba", () => {
    expect(nextWalkAction("PENDING")).toBeNull();
  });

  it("los estados terminales no ofrecen ninguna accion", () => {
    expect(nextWalkAction("COMPLETED")).toBeNull();
    expect(nextWalkAction("CANCELLED_OWNER")).toBeNull();
    expect(nextWalkAction("CANCELLED_WALKER")).toBeNull();
  });

  it("un estado desconocido no revienta, devuelve null", () => {
    expect(nextWalkAction("EXPIRED")).toBeNull();
  });
});

describe("isActiveWalk", () => {
  it("son activos exactamente los tres estados con accion pendiente", () => {
    expect(isActiveWalk("CONFIRMED")).toBe(true);
    expect(isActiveWalk("WALKER_ON_WAY")).toBe(true);
    expect(isActiveWalk("IN_PROGRESS")).toBe(true);
  });

  it("PENDING no es activo: vive en su propia seccion, no en la de trabajo en curso", () => {
    expect(isActiveWalk("PENDING")).toBe(false);
  });

  it("los terminales no son activos", () => {
    expect(isActiveWalk("COMPLETED")).toBe(false);
    expect(isActiveWalk("CANCELLED_OWNER")).toBe(false);
    expect(isActiveWalk("CANCELLED_WALKER")).toBe(false);
  });

  it("NOT_PERFORMED no es activo — sale de 'Paseos activos' y va al historial", () => {
    expect(isActiveWalk("NOT_PERFORMED")).toBe(false);
  });
});

describe("walkActionAvailability", () => {
  const SCHEDULED_AT = new Date("2026-08-14T18:00:00.000Z"); // T

  describe("onWay — se habilita desde T-3h, sin techo", () => {
    const opensAt = new Date("2026-08-14T15:00:00.000Z"); // T-3h

    it("antes de T-3h: no disponible, availableAt apunta a la apertura", () => {
      const result = walkActionAvailability("onWay", {
        scheduledAt: SCHEDULED_AT, startedAt: null, durationMinutes: 30,
        now: new Date(opensAt.getTime() - 1),
      });
      expect(result).toEqual({ available: false, availableAt: opensAt });
    });

    it("exactamente en T-3h: disponible", () => {
      const result = walkActionAvailability("onWay", {
        scheduledAt: SCHEDULED_AT, startedAt: null, durationMinutes: 30, now: opensAt,
      });
      expect(result).toEqual({ available: true, availableAt: null });
    });
  });

  // Bloque C (segunda parte): start() dejo de cerrarse en T+10m — un inicio
  // tardio ahora se deja pasar y se registra aparte (Walk.startedLate) en
  // vez de bloquearse (evidencia, no candado). Por eso esta ventana ya no
  // tiene "despues de T+10m: no disponible" — nunca deja de estar
  // disponible una vez abierta, igual que onWay.
  describe("start — se habilita desde T-5m, sin techo", () => {
    const opensAt = new Date("2026-08-14T17:55:00.000Z"); // T-5m

    it("antes de T-5m: no disponible, availableAt apunta a la apertura", () => {
      const result = walkActionAvailability("start", {
        scheduledAt: SCHEDULED_AT, startedAt: null, durationMinutes: 30,
        now: new Date(opensAt.getTime() - 1),
      });
      expect(result).toEqual({ available: false, availableAt: opensAt });
    });

    it("exactamente en T-5m: disponible", () => {
      const result = walkActionAvailability("start", {
        scheduledAt: SCHEDULED_AT, startedAt: null, durationMinutes: 30, now: opensAt,
      });
      expect(result).toEqual({ available: true, availableAt: null });
    });

    it("mucho despues de T (paseo agendado hace semanas, inicio tardio): sigue disponible — el inicio tardio se registra, no se bloquea", () => {
      const muchoDespues = new Date(SCHEDULED_AT.getTime() + 21 * 24 * 60 * 60 * 1000);
      const result = walkActionAvailability("start", {
        scheduledAt: SCHEDULED_AT, startedAt: null, durationMinutes: 30, now: muchoDespues,
      });
      expect(result).toEqual({ available: true, availableAt: null });
    });
  });

  describe("finish — se habilita fin esperado - 15m, sin techo", () => {
    const startedAt = new Date("2026-08-14T18:00:00.000Z");
    const durationMinutes = 60;
    const opensAt = new Date("2026-08-14T18:45:00.000Z"); // fin esperado 19:00, menos 15m

    it("antes de fin esperado - 15m: no disponible, availableAt apunta a la apertura", () => {
      const result = walkActionAvailability("finish", {
        scheduledAt: SCHEDULED_AT, startedAt, durationMinutes,
        now: new Date(opensAt.getTime() - 1),
      });
      expect(result).toEqual({ available: false, availableAt: opensAt });
    });

    it("exactamente en fin esperado - 15m: disponible", () => {
      const result = walkActionAvailability("finish", {
        scheduledAt: SCHEDULED_AT, startedAt, durationMinutes, now: opensAt,
      });
      expect(result).toEqual({ available: true, availableAt: null });
    });

    it("mucho despues del fin esperado: sigue disponible, no tiene techo", () => {
      const muchoDespues = new Date(opensAt.getTime() + 21 * 24 * 60 * 60 * 1000);
      const result = walkActionAvailability("finish", {
        scheduledAt: SCHEDULED_AT, startedAt, durationMinutes, now: muchoDespues,
      });
      expect(result).toEqual({ available: true, availableAt: null });
    });

    it("sin startedAt (no deberia pasar en la practica — IN_PROGRESS siempre lo tiene): no disponible y sin horario", () => {
      const result = walkActionAvailability("finish", {
        scheduledAt: SCHEDULED_AT, startedAt: null, durationMinutes, now: SCHEDULED_AT,
      });
      expect(result).toEqual({ available: false, availableAt: null });
    });
  });
});
