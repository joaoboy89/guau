import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class TrackingService {
  constructor(private prisma: PrismaService) {}

  saveLocation(walkId: string, lat: number, lng: number) {
    return this.prisma.walkLocation.create({
      data: { walkId, lat, lng },
      select: { lat: true, lng: true, recordedAt: true },
    });
  }

  async isWalkerOfWalk(userId: string, walkId: string): Promise<boolean> {
    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      include: { walker: { select: { userId: true } } },
    });
    return walk?.walker.userId === userId;
  }

  async isParticipantOfWalk(userId: string, walkId: string): Promise<boolean> {
    const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!owner) return false;

    const participant = await this.prisma.walkParticipant.findFirst({
      where: { walkId, ownerId: owner.id },
    });
    return !!participant;
  }

  getWalkStatus(walkId: string) {
    return this.prisma.walk.findUnique({
      where: { id: walkId },
      select: { status: true },
    });
  }
}
