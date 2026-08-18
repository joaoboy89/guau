import * as crypto from "crypto";
import { PICKUP_CODE } from "@guau/shared";

/**
 * Genera un codigo de retiro de PICKUP_CODE.LENGTH digitos numericos (bloque
 * D1, docs/guau-politicas.md §3). padStart cubre los codigos que arrancan en
 * 0 (ej. 47 -> "0047"): sin esto, un codigo con menos de 4 digitos rompe la
 * longitud exacta que exige StartWalkDto.pickupCode.
 *
 * crypto.randomInt (no Math.random): no hace falta que sea criptografico
 * -la defensa real es el limite de intentos, no la imposibilidad de
 * adivinar un numero de 4 digitos- pero randomInt esta en la stdlib, no
 * suma dependencias, y saca cualquier duda sobre sesgo de distribucion.
 *
 * Extraido de WalksService a su propio archivo para que el script de
 * backfill de produccion (apps/api/scripts/backfill-pickup-codes.ts) use
 * EXACTAMENTE este generador — no una reimplementacion en SQL (el random()
 * de Postgres no es criptografico) ni en otro archivo TS que pueda
 * desincronizarse. Una sola definicion, dos usos.
 */
export function generatePickupCode(): string {
  return String(crypto.randomInt(0, 10 ** PICKUP_CODE.LENGTH)).padStart(PICKUP_CODE.LENGTH, "0");
}
