import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Datos de negocio (editá precios/duraciones acá) ──────────
// Precios en ARS. exclusiveMultiplier = recargo del paseo exclusivo.
const walkTypes = [
  { durationMinutes: 45, label: "45 min", basePrice: 3000, exclusiveMultiplier: 1.5 },
  { durationMinutes: 90, label: "90 min", basePrice: 4500, exclusiveMultiplier: 1.5 },
  { durationMinutes: 120, label: "2 hs", basePrice: 5500, exclusiveMultiplier: 1.5 },
  { durationMinutes: 180, label: "3 hs", basePrice: 6500, exclusiveMultiplier: 1.5 },
];

async function main() {
  for (const wt of walkTypes) {
    // upsert por durationMinutes (único): si existe lo actualiza, si no lo crea.
    // Idempotente: corrés el seed N veces y siempre quedan estas filas, sin duplicar.
    await prisma.walkType.upsert({
      where: { durationMinutes: wt.durationMinutes },
      update: {
        label: wt.label,
        basePrice: wt.basePrice,
        exclusiveMultiplier: wt.exclusiveMultiplier,
      },
      create: wt,
    });
  }
  console.log(`Seed completado: ${walkTypes.length} WalkTypes (upsert)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1); // exit !=0 para que un fallo del seed sea visible (no silencioso)
  })
  .finally(() => prisma.$disconnect());
