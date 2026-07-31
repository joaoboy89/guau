import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateWalkDto } from "./create-walk.dto";

// Prueba a nivel DTO porque el ValidationPipe global (que sí aplica estas
// reglas) no se ejecuta en los tests de WalksService — esos llaman al
// método directo, salteando el pipe.
describe("CreateWalkDto", () => {
  const VALID = {
    walkerId: "walker-1",
    walkTypeId: "wt-1",
    dogIds: ["dog-1"],
    scheduledAt: "2026-07-01T09:00:00Z",
    pickupLat: -34.5885,
    pickupLng: -58.4233,
    pickupAddress: "Av. Santa Fe 1234, Palermo, CABA",
  };

  it("acepta 1 perro", async () => {
    const dto = plainToInstance(CreateWalkDto, VALID);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  // El techo del array tiene que coincidir con lo que el cálculo de precio
  // contempla. amountPaid sale de basePrice repartido entre N perros, no de
  // basePrice * N — con 2+ perros el dueño paga menos de lo que su reserva
  // vale. Ver payments.service.ts createPreference() y el bloque que agregó
  // este límite.
  it("rechaza dogIds con 2 elementos — el precio todavía no contempla más de 1 perro", async () => {
    const dto = plainToInstance(CreateWalkDto, { ...VALID, dogIds: ["dog-1", "dog-2"] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "dogIds")).toBe(true);
  });

  it("rechaza dogIds vacío", async () => {
    const dto = plainToInstance(CreateWalkDto, { ...VALID, dogIds: [] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "dogIds")).toBe(true);
  });
});
