import { buildSearchQuery } from "./search-params";

describe("buildSearchQuery", () => {
  it("EL TEST MAS IMPORTANTE: los cuatro campos vacios devuelven null — no se llama a la API", () => {
    expect(buildSearchQuery({ idPrefix: "", email: "", desde: "", hasta: "" })).toBeNull();
  });

  it("campos con solo espacios cuentan como vacios", () => {
    expect(buildSearchQuery({ idPrefix: "   ", email: "  ", desde: " ", hasta: "" })).toBeNull();
  });

  it("con idPrefix solo: arma la query con ese unico campo", () => {
    expect(buildSearchQuery({ idPrefix: "a3f1b2c4", email: "", desde: "", hasta: "" })).toEqual({
      idPrefix: "a3f1b2c4",
    });
  });

  it("con email solo: arma la query con ese unico campo", () => {
    expect(buildSearchQuery({ idPrefix: "", email: "juan@test.com", desde: "", hasta: "" })).toEqual({
      email: "juan@test.com",
    });
  });

  it("con solo 'desde' (sin 'hasta'): alcanza para disparar la busqueda", () => {
    expect(buildSearchQuery({ idPrefix: "", email: "", desde: "2026-09-01", hasta: "" })).toEqual({
      desde: "2026-09-01",
    });
  });

  it("combina varios campos a la vez", () => {
    expect(
      buildSearchQuery({ idPrefix: "", email: "juan@test.com", desde: "2026-09-01", hasta: "2026-09-30" }),
    ).toEqual({
      email: "juan@test.com",
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
  });

  it("recorta espacios sueltos alrededor de los valores", () => {
    expect(buildSearchQuery({ idPrefix: "  a3f1b2c4  ", email: "", desde: "", hasta: "" })).toEqual({
      idPrefix: "a3f1b2c4",
    });
  });
});
