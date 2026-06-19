import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { CreateDogDto } from "./dto/create-dog.dto";
import { UpdateDogDto } from "./dto/update-dog.dto";

@Injectable()
export class DogsService {
  constructor(private prisma: PrismaService) {}

  // ─── Listar mis perros ───────────────────────────────────

  async findMyDogs(userId: string) {
    const owner = await this.getOwnerOrThrow(userId);

    return this.prisma.dog.findMany({
      where: { ownerId: owner.id, isActive: true },
      orderBy: { createdAt: "asc" },
    });
  }

  // ─── Agregar perro ───────────────────────────────────────

  async create(userId: string, dto: CreateDogDto) {
    const owner = await this.getOwnerOrThrow(userId);

    const activeCount = await this.prisma.dog.count({
      where: { ownerId: owner.id, isActive: true },
    });

    if (activeCount >= 10) {
      throw new BadRequestException("Podés tener hasta 10 perros registrados");
    }

    return this.prisma.dog.create({
      data: { ownerId: owner.id, ...dto },
    });
  }

  // ─── Editar perro ────────────────────────────────────────

  async update(userId: string, dogId: string, dto: UpdateDogDto) {
    const dog = await this.getDogAndVerifyOwnership(userId, dogId);

    return this.prisma.dog.update({
      where: { id: dog.id },
      data: dto,
    });
  }

  // ─── Desactivar perro (soft delete) ─────────────────────
  // No eliminamos el registro para preservar el historial de paseos.

  async deactivate(userId: string, dogId: string) {
    const dog = await this.getDogAndVerifyOwnership(userId, dogId);

    // Verificar que el perro no esté en un paseo activo
    const activeWalk = await this.prisma.walkParticipant.findFirst({
      where: {
        dogId: dog.id,
        walk: {
          status: { in: ["PENDING", "CONFIRMED", "WALKER_ON_WAY", "IN_PROGRESS"] },
        },
      },
    });

    if (activeWalk) {
      throw new BadRequestException(
        "No podés desactivar un perro que tiene un paseo en curso o pendiente"
      );
    }

    await this.prisma.dog.update({
      where: { id: dog.id },
      data: { isActive: false },
    });

    return { message: `${dog.name} fue desactivado correctamente` };
  }

  // ─── Helpers privados ────────────────────────────────────

  private async getOwnerOrThrow(userId: string) {
    const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!owner) throw new NotFoundException("Perfil de dueño no encontrado");
    return owner;
  }

  private async getDogAndVerifyOwnership(userId: string, dogId: string) {
    const owner = await this.getOwnerOrThrow(userId);

    const dog = await this.prisma.dog.findUnique({ where: { id: dogId } });
    if (!dog || !dog.isActive) throw new NotFoundException("Perro no encontrado");

    if (dog.ownerId !== owner.id) {
      throw new ForbiddenException("No tenés permiso para modificar este perro");
    }

    return dog;
  }
}
