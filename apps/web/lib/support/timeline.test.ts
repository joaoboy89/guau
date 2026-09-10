import { buildTimeline, notPerformedReasonLabel } from "./timeline";
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

describe("buildTimeline", () => {
  it("EL TEST MAS IMPORTANTE: ordena por timestamp real, no por el orden de los campos del objeto", () => {
    // onWayAt (16:45) cae ANTES que createdAt del objeto declarado despues en
    // el tipo, y scheduledAt (17:00) antes que startedAt (17:02) — pero el
    // orden real cronologico es: createdAt (08/09) < onWayAt < scheduledAt < startedAt < endedAt.
    const timeline = buildTimeline(BASE_WALK);
    const keys = timeline.map((e) => e.key);
    expect(keys).toEqual(["createdAt", "onWayAt", "scheduledAt", "startedAt", "endedAt", "notPerformedAt"]);
  });

  it("detecta un caso con los campos MEZCLADOS en el objeto pero igual ordena por fecha real", () => {
    // onWayAt mas tarde que scheduledAt (el paseador arranco tarde) — el
    // orden cronologico correcto sigue siendo por timestamp, no por campo.
    const walk: SupportWalkCase = {
      ...BASE_WALK,
      scheduledAt: "2026-09-10T15:00:00Z",
      onWayAt: "2026-09-10T16:00:00Z",
      startedAt: "2026-09-10T16:10:00Z",
    };
    const timeline = buildTimeline(walk);
    const happenedKeys = timeline.filter((e) => e.at !== null).map((e) => e.key);
    expect(happenedKeys).toEqual(["createdAt", "scheduledAt", "onWayAt", "startedAt", "endedAt"]);
  });

  it("un hito que no ocurrio (at: null) va al final, con su propio missingLabel", () => {
    const walk: SupportWalkCase = { ...BASE_WALK, startedAt: null, endedAt: null };
    const timeline = buildTimeline(walk);
    const missing = timeline.filter((e) => e.at === null);
    expect(missing.map((e) => e.key)).toEqual(["startedAt", "endedAt", "notPerformedAt"]);
    expect(timeline.find((e) => e.key === "startedAt")?.missingLabel).toBe("— nunca inició");
    expect(timeline.find((e) => e.key === "endedAt")?.missingLabel).toBe("— nunca cerró");
  });

  it("caso NOT_PERFORMED: notPerformedAt tiene fecha y entra en el orden cronologico normal", () => {
    const walk: SupportWalkCase = {
      ...BASE_WALK,
      status: "NOT_PERFORMED",
      startedAt: null,
      endedAt: null,
      notPerformedAt: "2026-09-10T19:00:00Z",
      notPerformedReason: "WALKER_NO_SHOW",
    };
    const timeline = buildTimeline(walk);
    const happenedKeys = timeline.filter((e) => e.at !== null).map((e) => e.key);
    expect(happenedKeys[happenedKeys.length - 1]).toBe("notPerformedAt");
  });

  it("createdAt y scheduledAt nunca faltan (columnas obligatorias) — siempre entran como 'ocurridos'", () => {
    const timeline = buildTimeline(BASE_WALK);
    expect(timeline.find((e) => e.key === "createdAt")?.at).not.toBeNull();
    expect(timeline.find((e) => e.key === "scheduledAt")?.at).not.toBeNull();
  });
});

describe("notPerformedReasonLabel", () => {
  it("null devuelve null", () => {
    expect(notPerformedReasonLabel(null)).toBeNull();
  });

  it("traduce un motivo conocido", () => {
    expect(notPerformedReasonLabel("WALKER_NO_SHOW")).toBe("el paseador nunca llegó");
  });

  it("un motivo desconocido devuelve el string tal cual, no rompe", () => {
    expect(notPerformedReasonLabel("ALGO_NUEVO_SIN_MAPEAR")).toBe("ALGO_NUEVO_SIN_MAPEAR");
  });
});
