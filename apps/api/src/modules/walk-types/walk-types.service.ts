import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class WalkTypesService {
  constructor(private prisma: PrismaService) {}

  findActive() {
    return this.prisma.walkType.findMany({
      where: { isActive: true },
      select: {
        id: true,
        durationMinutes: true,
        label: true,
        basePrice: true,
        exclusiveMultiplier: true,
      },
      orderBy: { durationMinutes: "asc" },
    });
  }
}
