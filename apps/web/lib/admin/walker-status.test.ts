import {
  AVAILABLE_ACTIONS,
  actionRequiresNotes,
  actionRequiresExtraConfirmation,
  parseNotesHistory,
} from "./walker-status";

describe("AVAILABLE_ACTIONS", () => {
  it("REJECTED es terminal: no tiene ninguna acción disponible", () => {
    expect(AVAILABLE_ACTIONS.REJECTED).toEqual([]);
  });

  it("SUSPENDED solo puede reactivar o rechazar — no aprobar (ese camino es reinstate)", () => {
    expect(AVAILABLE_ACTIONS.SUSPENDED).toContain("reinstate");
    expect(AVAILABLE_ACTIONS.SUSPENDED).not.toContain("approve");
  });

  it("PENDING puede aprobar, suspender o rechazar, pero no reactivar", () => {
    expect(AVAILABLE_ACTIONS.PENDING).toEqual(
      expect.arrayContaining(["approve", "suspend", "reject"]),
    );
    expect(AVAILABLE_ACTIONS.PENDING).not.toContain("reinstate");
  });
});

describe("actionRequiresNotes", () => {
  it("approve no requiere notas", () => {
    expect(actionRequiresNotes("approve")).toBe(false);
  });

  it("reject, suspend y reinstate requieren notas", () => {
    expect(actionRequiresNotes("reject")).toBe(true);
    expect(actionRequiresNotes("suspend")).toBe(true);
    expect(actionRequiresNotes("reinstate")).toBe(true);
  });
});

describe("actionRequiresExtraConfirmation", () => {
  it("solo reject exige la confirmación extra (es terminal)", () => {
    expect(actionRequiresExtraConfirmation("reject")).toBe(true);
    expect(actionRequiresExtraConfirmation("approve")).toBe(false);
    expect(actionRequiresExtraConfirmation("suspend")).toBe(false);
    expect(actionRequiresExtraConfirmation("reinstate")).toBe(false);
  });
});

describe("parseNotesHistory", () => {
  it("null devuelve lista vacía", () => {
    expect(parseNotesHistory(null)).toEqual([]);
  });

  it("una sola línea devuelve un solo elemento", () => {
    expect(parseNotesHistory("[2026-09-11] RECHAZADO por a@a.com: motivo")).toEqual([
      "[2026-09-11] RECHAZADO por a@a.com: motivo",
    ]);
  });

  it("varias líneas (historial acumulado) se separan en orden", () => {
    const notes = "[2026-08-01] SUSPENDIDO por a@a.com: denuncia\n[2026-09-01] REACTIVADO por a@a.com: se aclaro";
    expect(parseNotesHistory(notes)).toEqual([
      "[2026-08-01] SUSPENDIDO por a@a.com: denuncia",
      "[2026-09-01] REACTIVADO por a@a.com: se aclaro",
    ]);
  });
});
