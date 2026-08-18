/**
 * Backfill puntual — bloque D1 (docs/guau-politicas.md §3), sesion del merge
 * de staging a master (2026-08-18).
 *
 * pickupCode se genera en confirm() desde el bloque D1. Los paseos que ya
 * estaban en CONFIRMED en produccion ANTES de esa migracion quedaron con
 * pickupCode = NULL — nadie se queda trabado (existe la salida de "iniciar
 * sin codigo, con motivo"), pero es un estado inconsistente que se puede
 * cerrar, y por eso este script.
 *
 * Por que un script aparte y no un backfill en la propia migracion SQL:
 * generatePickupCode() (src/modules/walks/pickup-code.util.ts) usa
 * crypto.randomInt, que es criptograficamente seguro. El random() de
 * PostgreSQL no lo es. Generar los codigos en SQL dentro de la migracion
 * dejaria esas filas con una propiedad de seguridad distinta a la de
 * cualquier codigo que la app genera en un confirm() normal — el mismo
 * campo, dos garantias distintas segun cuando se creo la fila. Exactamente
 * la clase de inconsistencia silenciosa que este proyecto viene evitando.
 * Este script importa el MISMO generador que usa el service — una sola
 * definicion, no dos que puedan desincronizarse.
 *
 * Alcance, deliberadamente acotado: SOLO status = CONFIRMED AND pickupCode
 * IS NULL. Ningun otro estado, ningun otro campo.
 *
 * Idempotente: correrlo dos veces no reasigna codigos ya generados — el
 * WHERE pickupCode IS NULL de la propia consulta excluye las filas que una
 * corrida anterior ya toco.
 *
 * Es un script de una sola corrida, no una migracion de Prisma: no forma
 * parte del flujo normal de deploy (prisma migrate deploy no lo ejecuta) y,
 * una vez corrido contra un ambiente, no deberia volver a hacer falta ahi
 * (los paseos CONFIRMED nuevos ya nacen con pickupCode desde confirm()).
 * Queda versionado en el repo para que dentro de unos meses se entienda que
 * fue puntual — no una pieza activa del sistema — y para que si hiciera
 * falta repetirlo (otro ambiente, otro hueco de datos) no haya que
 * reescribirlo desde cero.
 *
 * Uso (desde apps/api, con DATABASE_URL apuntando al ambiente correcto):
 *   npx ts-node scripts/backfill-pickup-codes.ts
 *
 * NO se corrio contra ninguna base como parte de este cambio — lo corre Joa
 * a mano, deliberadamente, despues del deploy.
 */
import { PrismaClient, WalkStatus } from "@prisma/client";
import { generatePickupCode } from "../src/modules/walks/pickup-code.util";

const prisma = new PrismaClient();

async function main() {
  const targets = await prisma.walk.findMany({
    where: { status: WalkStatus.CONFIRMED, pickupCode: null },
    select: { id: true },
  });

  console.log(`Paseos CONFIRMED sin pickupCode encontrados: ${targets.length}`);

  if (targets.length === 0) {
    console.log("Nada para hacer.");
    return;
  }

  let updated = 0;
  // Un update por fila, no un UPDATE masivo con el mismo valor para todas:
  // cada paseo necesita SU propio codigo, generado por separado — mismo
  // criterio que confirm() en la app, que genera uno por vez.
  for (const walk of targets) {
    await prisma.walk.update({
      where: { id: walk.id },
      data: { pickupCode: generatePickupCode() },
    });
    updated++;
  }

  console.log(`Paseos actualizados: ${updated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1); // exit != 0 para que un fallo sea visible, no silencioso
  })
  .finally(() => prisma.$disconnect());
