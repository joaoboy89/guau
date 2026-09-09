import { shortWalkId } from "./walk-id";

describe("shortWalkId", () => {
  it("recorta un UUID a los primeros 8 caracteres", () => {
    expect(shortWalkId("a3f1b2c4-5d6e-7f89-0123-456789abcdef")).toBe("a3f1b2c4");
  });

  it("no rompe con un string más corto que 8 — devuelve lo que hay", () => {
    expect(shortWalkId("abc")).toBe("abc");
  });
});
