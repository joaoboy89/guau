import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { QuerySupportWalksDto } from "./query-support-walks.dto";

// Prueba a nivel DTO porque el ValidationPipe global (que sí aplica estas
// reglas) no se ejecuta en los tests de SupportService — esos llaman al
// método directo, salteando el pipe. Mismo criterio que query-walks.dto.spec.ts.
describe("QuerySupportWalksDto", () => {
  it("sin parámetros: aplican los defaults (page 1, limit 20)", async () => {
    const dto = plainToInstance(QuerySupportWalksDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it("rechaza idPrefix de menos de 8 caracteres — sin ese minimo, ?idPrefix=a devolveria media base", async () => {
    const dto = plainToInstance(QuerySupportWalksDto, { idPrefix: "a3f1b2c" }); // 7
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "idPrefix")).toBe(true);
  });

  it("acepta idPrefix de exactamente 8 caracteres", async () => {
    const dto = plainToInstance(QuerySupportWalksDto, { idPrefix: "a3f1b2c4" }); // 8
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("acepta idPrefix de 36 caracteres (un UUID completo)", async () => {
    const dto = plainToInstance(QuerySupportWalksDto, {
      idPrefix: "a3f1b2c4-5d6e-7f89-0123-456789abcdef",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rechaza idPrefix de mas de 36 caracteres", async () => {
    const dto = plainToInstance(QuerySupportWalksDto, {
      idPrefix: "a3f1b2c4-5d6e-7f89-0123-456789abcdef-extra",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "idPrefix")).toBe(true);
  });

  it("rechaza un email invalido", async () => {
    const dto = plainToInstance(QuerySupportWalksDto, { email: "no-es-un-mail" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "email")).toBe(true);
  });

  it("acepta un email valido", async () => {
    const dto = plainToInstance(QuerySupportWalksDto, { email: "dueno@test.com" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rechaza una fecha invalida en desde/hasta", async () => {
    const dto = plainToInstance(QuerySupportWalksDto, { desde: "no-es-una-fecha" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "desde")).toBe(true);
  });

  it("acepta limit 50 (el maximo)", async () => {
    const dto = plainToInstance(QuerySupportWalksDto, { limit: "50" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rechaza limit 51 — el techo explicito, no solo un default", async () => {
    const dto = plainToInstance(QuerySupportWalksDto, { limit: "51" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "limit")).toBe(true);
  });

  it("rechaza page 0", async () => {
    const dto = plainToInstance(QuerySupportWalksDto, { page: "0" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "page")).toBe(true);
  });
});
