import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { QueryWalksDto } from "./query-walks.dto";

// Prueba a nivel DTO porque el ValidationPipe global (que sí aplica estas
// reglas) no se ejecuta en los tests de WalksService — esos llaman al
// método directo, salteando el pipe.
describe("QueryWalksDto", () => {
  it("acepta sin parámetros — aplican los defaults (page 1, limit 50, days 30)", async () => {
    const dto = plainToInstance(QueryWalksDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(50);
    expect(dto.days).toBe(30);
  });

  it("acepta limit 100 (el máximo)", async () => {
    const dto = plainToInstance(QueryWalksDto, { limit: "100" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rechaza limit 500 — sin techo, ?limit=500 es 'traeme todo' con otro nombre", async () => {
    const dto = plainToInstance(QueryWalksDto, { limit: "500" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "limit")).toBe(true);
  });

  it("acepta days 365 (el máximo)", async () => {
    const dto = plainToInstance(QueryWalksDto, { days: "365" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rechaza days 99999 — mismo problema que limit sin techo", async () => {
    const dto = plainToInstance(QueryWalksDto, { days: "99999" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "days")).toBe(true);
  });

  it("rechaza page 0", async () => {
    const dto = plainToInstance(QueryWalksDto, { page: "0" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "page")).toBe(true);
  });
});
