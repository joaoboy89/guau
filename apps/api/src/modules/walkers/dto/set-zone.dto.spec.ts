import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SetZoneDto } from "./set-zone.dto";

// Prueba a nivel DTO porque el ValidationPipe global (que sí aplica estas
// reglas) no se ejecuta en los tests de WalkersService — esos llaman al
// método directo, salteando el pipe.
describe("SetZoneDto", () => {
  const VALID = { centerLat: -34.6, centerLng: -58.4, radiusKm: 3 };

  it("acepta un radio dentro de 2 a 3 km", async () => {
    const dto = plainToInstance(SetZoneDto, { ...VALID, radiusKm: 2.5 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rechaza un radio menor a 2 km", async () => {
    const dto = plainToInstance(SetZoneDto, { ...VALID, radiusKm: 1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "radiusKm")).toBe(true);
  });

  it("rechaza un radio mayor a 3 km (ej. el viejo default de 20)", async () => {
    const dto = plainToInstance(SetZoneDto, { ...VALID, radiusKm: 20 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "radiusKm")).toBe(true);
  });
});
