import { getSupportSignals } from "./signals";
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
});
