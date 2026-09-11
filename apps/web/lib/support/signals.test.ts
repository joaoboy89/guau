import { getSupportSignals, getEmptySignalsMessage } from "./signals";
import type { SupportWalkCase } from "./api";

const PERSON = { id: "p-1", firstName: "Juan", lastName: "Pérez", email: "juan@test.com", phone: "111" };

const BASE_WALK: SupportWalkCase = {
  id: "walk-1",
  status: "COMPLETED",
  mode: "GRUPAL",
  scheduledAt: "2026-09-10T17:00:00Z",
  createdAt: "2026-09-08T10:00:00Z",
  onWayAt: "2026-09-10T16:45:00Z",
  startedAt: "2026-09-10T17:02:00Z",
  endedAt: "2026-09-10T18:00:00Z",
  notPerformedAt: null,
  startedLate: false,
  endedLate: false,
  closedBy: "WALKER",
  notPerformedReason: null,
  startVerification: "CODE",
  startVerifyReason: null,
  ownerAcknowledgedNoCodeAt: null,
  pickupCode: "1234",
  pickupCodeAttempts: 0,
  pickupAddress: "Av. Santa Fe 1234",
  pickupLat: -34.5885,
  pickupLng: -58.4233,
  totalAmount: 3000,
  walkerAmount: 2420.91,
  cancellationReason: null,
  estabaPago: true,
  refundedAt: null,
  walkType: { label: "Paseo básico", durationMinutes: 45 },
  walker: PERSON,
  owner: PERSON,
  dogs: [{ name: "Toto", size: "MEDIANO" }],
};

describe("getSupportSignals", () => {
  it("un paseo sin nada anomalo no devuelve ninguna señal", () => {
    expect(getSupportSignals(BASE_WALK)).toEqual([]);
  });

  it("arranco sin codigo: señal con el motivo", () => {
    const signals = getSupportSignals({
      ...BASE_WALK,
      startVerification: "NONE",
      startVerifyReason: "me lo dejo el encargado",
      ownerAcknowledgedNoCodeAt: "2026-09-10T18:30:00Z",
    });
    expect(signals).toContain('Arrancó sin código — motivo: "me lo dejo el encargado"');
  });

  it("intentos fallidos del codigo: singular con 1, plural con mas de 1", () => {
    expect(getSupportSignals({ ...BASE_WALK, pickupCodeAttempts: 1 }))
      .toContain("1 intento fallido del código de retiro");
    expect(getSupportSignals({ ...BASE_WALK, pickupCodeAttempts: 4 }))
      .toContain("4 intentos fallidos del código de retiro");
  });

  it("cero intentos fallidos: no aparece la señal", () => {
    expect(getSupportSignals({ ...BASE_WALK, pickupCodeAttempts: 0 }).join(" ")).not.toContain("intento");
  });

  it("lo cerro el dueño: señal", () => {
    expect(getSupportSignals({ ...BASE_WALK, closedBy: "OWNER" }))
      .toContain("Lo cerró el dueño, no el paseador");
  });

  it("lo cerro el paseador: NO aparece esa señal", () => {
    expect(getSupportSignals({ ...BASE_WALK, closedBy: "WALKER" }))
      .not.toContain("Lo cerró el dueño, no el paseador");
  });

  it("inicio tardio y cierre tardio: señales independientes", () => {
    expect(getSupportSignals({ ...BASE_WALK, startedLate: true })).toContain("Inicio tardío");
    expect(getSupportSignals({ ...BASE_WALK, endedLate: true })).toContain("Cierre tardío");
  });

  it("arranco sin codigo y el dueño no dio conformidad todavia: señal aparte", () => {
    const signals = getSupportSignals({
      ...BASE_WALK,
      startVerification: "NONE",
      startVerifyReason: "motivo",
      ownerAcknowledgedNoCodeAt: null,
    });
    expect(signals).toContain("El dueño todavía no dio conformidad del arranque sin código");
  });

  it("arranco sin codigo pero el dueño YA dio conformidad: esa señal puntual no aparece", () => {
    const signals = getSupportSignals({
      ...BASE_WALK,
      startVerification: "NONE",
      startVerifyReason: "motivo",
      ownerAcknowledgedNoCodeAt: "2026-09-10T18:30:00Z",
    });
    expect(signals).not.toContain("El dueño todavía no dio conformidad del arranque sin código");
  });

  it("arranco CON codigo: ninguna de las dos señales de 'sin codigo' aparece, aunque no haya conformidad", () => {
    const signals = getSupportSignals({
      ...BASE_WALK,
      startVerification: "CODE",
      ownerAcknowledgedNoCodeAt: null,
    });
    expect(signals.join(" ")).not.toContain("código");
  });

  it("varias señales a la vez, todas presentes", () => {
    const signals = getSupportSignals({
      ...BASE_WALK,
      startedLate: true,
      endedLate: true,
      closedBy: "OWNER",
      pickupCodeAttempts: 2,
    });
    expect(signals).toHaveLength(4);
  });

  // ─── El bug que este bloque corrige: NOT_PERFORMED/CANCELLED nunca ─────
  // ─── pueden quedar sin ninguna señal ─────────────────────────────────

  describe("el paseo NO SE REALIZO — nunca puede quedar sin señales", () => {
    const NOT_PERFORMED_BASE: SupportWalkCase = {
      ...BASE_WALK,
      status: "NOT_PERFORMED",
      startedAt: null,
      endedAt: null,
      notPerformedAt: "2026-09-10T19:00:00Z",
      estabaPago: false,
    };

    it("EL TEST MAS IMPORTANTE DEL BLOQUE: NOT_PERFORMED NUNCA devuelve señales vacias", () => {
      const signals = getSupportSignals({ ...NOT_PERFORMED_BASE, notPerformedReason: null });
      expect(signals.length).toBeGreaterThan(0);
    });

    it("motivo WALKER_NO_SHOW", () => {
      const signals = getSupportSignals({ ...NOT_PERFORMED_BASE, notPerformedReason: "WALKER_NO_SHOW" });
      expect(signals).toContain("El paseo NO SE REALIZÓ — El paseador nunca marcó en camino y pasó la hora");
    });

    it("motivo OWNER_NO_SHOW", () => {
      const signals = getSupportSignals({ ...NOT_PERFORMED_BASE, notPerformedReason: "OWNER_NO_SHOW" });
      expect(signals).toContain("El paseo NO SE REALIZÓ — El paseador declaró que el dueño no se presentó");
    });

    it("motivo NOBODY_ACTED", () => {
      const signals = getSupportSignals({ ...NOT_PERFORMED_BASE, notPerformedReason: "NOBODY_ACTED" });
      expect(signals).toContain("El paseo NO SE REALIZÓ — Nadie apareció: ninguna de las dos partes actuó");
    });

    it("motivo NEVER_CONFIRMED", () => {
      const signals = getSupportSignals({ ...NOT_PERFORMED_BASE, notPerformedReason: "NEVER_CONFIRMED" });
      expect(signals).toContain("El paseo NO SE REALIZÓ — El paseador nunca confirmó la reserva");
    });

    it("motivo ON_WAY_NEVER_STARTED", () => {
      const signals = getSupportSignals({ ...NOT_PERFORMED_BASE, notPerformedReason: "ON_WAY_NEVER_STARTED" });
      expect(signals).toContain('El paseo NO SE REALIZÓ — El paseador marcó "en camino" y después no inició el paseo');
    });

    it("motivo null: 'sin motivo registrado', tambien es informacion", () => {
      const signals = getSupportSignals({ ...NOT_PERFORMED_BASE, notPerformedReason: null });
      expect(signals).toContain("El paseo NO SE REALIZÓ — sin motivo registrado");
    });
  });

  describe("cancelado — distingue quien", () => {
    it("CANCELLED_OWNER sin motivo", () => {
      const signals = getSupportSignals({
        ...BASE_WALK, status: "CANCELLED_OWNER", estabaPago: false, cancellationReason: null,
      });
      expect(signals).toContain("Cancelado por el dueño");
    });

    it("CANCELLED_WALKER con motivo: lo muestra", () => {
      const signals = getSupportSignals({
        ...BASE_WALK, status: "CANCELLED_WALKER", estabaPago: false, cancellationReason: "se enfermo",
      });
      expect(signals).toContain("Cancelado por el paseador — se enfermo");
    });
  });

  describe("plata: habia adentro y no se completo / ya se devolvio", () => {
    it("NOT_PERFORMED + estabaPago: señal fuerte", () => {
      const signals = getSupportSignals({
        ...BASE_WALK, status: "NOT_PERFORMED", notPerformedReason: null, estabaPago: true,
      });
      expect(signals).toContain("Había plata adentro y el paseo no se completó");
    });

    it("CANCELLED_OWNER + estabaPago: misma señal", () => {
      const signals = getSupportSignals({
        ...BASE_WALK, status: "CANCELLED_OWNER", cancellationReason: null, estabaPago: true,
      });
      expect(signals).toContain("Había plata adentro y el paseo no se completó");
    });

    it("COMPLETED + estabaPago: NO es señal — es el caso normal, pagar y completarse", () => {
      const signals = getSupportSignals({ ...BASE_WALK, status: "COMPLETED", estabaPago: true });
      expect(signals).not.toContain("Había plata adentro y el paseo no se completó");
    });

    it("un paseo EN CURSO (CONFIRMED) y ya pago: NO es señal — es el flujo normal, no un caso roto", () => {
      const signals = getSupportSignals({ ...BASE_WALK, status: "CONFIRMED", estabaPago: true });
      expect(signals).not.toContain("Había plata adentro y el paseo no se completó");
    });

    it("refundedAt con valor: señal con la fecha", () => {
      const signals = getSupportSignals({
        ...BASE_WALK, status: "NOT_PERFORMED", notPerformedReason: null, estabaPago: true,
        refundedAt: "2026-09-11T12:00:00Z",
      });
      expect(signals.some((s) => s.startsWith("Ya se devolvió la plata ("))).toBe(true);
    });

    it("refundedAt null: no aparece esa señal", () => {
      const signals = getSupportSignals({ ...BASE_WALK, refundedAt: null });
      expect(signals.join(" ")).not.toContain("devolvió");
    });
  });
});

describe("getEmptySignalsMessage", () => {
  it("COMPLETED: 'transcurrio normal'", () => {
    expect(getEmptySignalsMessage("COMPLETED")).toBe("Sin señales — este paseo transcurrió normal.");
  });

  it("un estado en curso (PENDING, CONFIRMED, WALKER_ON_WAY, IN_PROGRESS): NUNCA 'transcurrio normal'", () => {
    for (const status of ["PENDING", "CONFIRMED", "WALKER_ON_WAY", "IN_PROGRESS"]) {
      expect(getEmptySignalsMessage(status)).not.toContain("transcurrió normal");
    }
  });
});
