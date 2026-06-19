import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { UpdateOwnerDto } from "./dto/update-owner.dto";

@Injectable()
export class OwnersService {
  constructor(private prisma: PrismaService) {}

  async getMyProfile(userId: string) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            phone: true,
            createdAt: true,
          },
        },
        dogs: { where: { isActive: true } },
      },
    });

    if (!profile) throw new NotFoundException("Perfil de dueño no encontrado");
    return profile;
  }

  async updateMyProfile(userId: string, dto: UpdateOwnerDto) {
    const profile = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException("Perfil de dueño no encontrado");

    return this.prisma.ownerProfile.update({
      where: { userId },
      data: dto,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            phone: true,
          },
        },
      },
    });
  }
}
