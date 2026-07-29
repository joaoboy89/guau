import { canCancelWalk } from "./walk-status";

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
