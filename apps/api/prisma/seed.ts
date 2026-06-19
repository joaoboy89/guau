import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.walkType.createMany({
    data: [
      { durationMinutes: 45, label: "45 min", basePrice: 3000, exclusiveMultiplier: 1.5 },
      { durationMinutes: 90, label: "90 min", basePrice: 4500, exclusiveMultiplier: 1.5 },
      { durationMinutes: 120, label: "2 hs", basePrice: 5500, exclusiveMultiplier: 1.5 },
      { durationMinutes: 180, label: "3 hs", basePrice: 6500, exclusiveMultiplier: 1.5 },
    ],
    skipDuplicates: true,
  });

  console.log("Seed completado: WalkTypes creados");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
