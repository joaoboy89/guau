import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { StartWalkDto } from "./start-walk.dto";
import { START_WITHOUT_CODE_REASON } from "@guau/shared";

// Prueba a nivel DTO porque el ValidationPipe global (que sí aplica estas
// reglas) no se ejecuta en los tests de WalksService — esos llaman al
// método directo, salteando el pipe.
describe("StartWalkDto", () => {
  it("acepta un pickupCode de 4 dígitos", async () => {
    const dto = plainToInstance(StartWalkDto, { pickupCode: "4821" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("acepta sin ningún campo (el service es quien decide si falta código o motivo)", async () => {
    const dto = plainToInstance(StartWalkDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rechaza un pickupCode con menos de 4 dígitos", async () => {
    const dto = plainToInstance(StartWalkDto, { pickupCode: "482" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "pickupCode")).toBe(true);
  });

  it("rechaza un pickupCode con más de 4 dígitos", async () => {
    const dto = plainToInstance(StartWalkDto, { pickupCode: "48219" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "pickupCode")).toBe(true);
  });

  it("rechaza un pickupCode no numérico (misma longitud)", async () => {
    const dto = plainToInstance(StartWalkDto, { pickupCode: "abcd" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "pickupCode")).toBe(true);
  });

  it("acepta un motivo predefinido sin otherReason", async () => {
    const dto = plainToInstance(StartWalkDto, { reason: START_WITHOUT_CODE_REASON.BUILDING_STAFF });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rechaza un motivo que no está en la lista predefinida", async () => {
    const dto = plainToInstance(StartWalkDto, { reason: "SE_LO_COMIO_EL_PERRO" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "reason")).toBe(true);
  });

  it('reason OTHER exige otherReason', async () => {
    const dto = plainToInstance(StartWalkDto, { reason: START_WITHOUT_CODE_REASON.OTHER });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "otherReason")).toBe(true);
  });

  it('reason OTHER rechaza otherReason vacío (solo espacios)', async () => {
    const dto = plainToInstance(StartWalkDto, {
      reason: START_WITHOUT_CODE_REASON.OTHER, otherReason: "   ",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "otherReason")).toBe(true);
  });

  it('reason OTHER con otherReason válido: sin errores, y el texto queda recortado', async () => {
    const dto = plainToInstance(StartWalkDto, {
      reason: START_WITHOUT_CODE_REASON.OTHER, otherReason: "  Me lo dejó el portero  ",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.otherReason).toBe("Me lo dejó el portero");
  });

  it("rechaza un otherReason más largo que el tope (ventana nueva: @MaxLength)", async () => {
    const dto = plainToInstance(StartWalkDto, {
      reason: START_WITHOUT_CODE_REASON.OTHER, otherReason: "a".repeat(201),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "otherReason")).toBe(true);
  });

  it("otherReason sin reason=OTHER no se valida (queda ignorado, no rompe)", async () => {
    const dto = plainToInstance(StartWalkDto, {
      reason: START_WITHOUT_CODE_REASON.BUILDING_STAFF, otherReason: "",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
