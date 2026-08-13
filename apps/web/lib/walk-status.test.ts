import { canCancelWalk, isActiveWalk, nextWalkAction } from "./walk-status";

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
});
