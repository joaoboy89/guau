import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { WalkStatus, WalkMode, VerificationStatus, UserRole } from "@prisma/client";
import { CreateWalkDto } from "./dto/create-walk.dto";
import { CancelWalkDto } from "./dto/cancel-walk.dto";
import { QueryWalksDto } from "./dto/query-walks.dto";

// Incluye las relaciones que siempre se devuelven con un Walk
const WALK_INCLUDE = {
  walkType: true,
  walker: {
    include: {
      user: { select: { firstName: true, lastName: true, avatarUrl: true, phone: true } },
    },
  },
  participants: {
    include: {
      dog: true,
      owner: {
        include: {
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class WalksService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // ─── Crear reserva ───────────────────────────────────────

  async create(userId: string, dto: CreateWalkDto) {
    const mode = dto.mode ?? WalkMode.GRUPAL;
    const scheduledAt = new Date(dto.scheduledAt);

    // 1. Validar que el dueño tiene perfil
    const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!owner) throw new NotFoundException("Perfil de dueño no encontrado");

    // 2. Validar perros — pertenecen al dueño, están activos
    const dogs = await this.prisma.dog.findMany({
      where: { id: { in: dto.dogIds }, ownerId: owner.id, isActive: true },
    });
    if (dogs.length !== dto.dogIds.length) {
      throw new BadRequestException("Uno o más perros no existen o no te pertenecen");
    }

    // 3. Validar tipo de paseo
    const walkType = await this.prisma.walkType.findUnique({
      where: { id: dto.walkTypeId },
    });
    if (!walkType || !walkType.isActive) {
      throw new NotFoundException("Tipo de paseo no válido");
    }

    // 4. Validar paseador
    const walker = await this.prisma.walkerProfile.findUnique({
      where: { id: dto.walkerId },
    });
    if (!walker) throw new NotFoundException("Paseador no encontrado");
    if (walker.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new UnprocessableEntityException("El paseador no está verificado");
    }
    if (!walker.isAvailable) {
      throw new UnprocessableEntityException("El paseador no está disponible");
    }

    // 5. Validar horario del paseador
    const dayOfWeek = scheduledAt.getDay();
    const timeStr = scheduledAt.toTimeString().slice(0, 5);

    const schedule = await this.prisma.walkerSchedule.findFirst({
      where: {
        walkerId: walker.id,
        dayOfWeek,
        isActive: true,
        startTime: { lte: timeStr },
        endTime: { gt: timeStr },
      },
    });
    if (!schedule) {
      throw new UnprocessableEntityException(
        "El paseador no tiene disponibilidad en ese horario"
      );
    }

    // 6. Validar capacidad del paseador en ese horario (paseos PENDING/CONFIRMED)
    const dogsAlreadyBooked = await this.prisma.walkParticipant.count({
      where: {
        walk: {
          walkerId: walker.id,
          scheduledAt,
          status: { in: [WalkStatus.PENDING, WalkStatus.CONFIRMED] },
        },
      },
    });
    if (dogsAlreadyBooked + dto.dogIds.length > walker.maxDogsPerWalk) {
      throw new UnprocessableEntityException(
        `El paseador ya tiene ${dogsAlreadyBooked} perros reservados en ese horario. Cupo máximo: ${walker.maxDogsPerWalk}`
      );
    }

    // 7. Calcular montos
    const commissionRate =
      parseFloat(this.config.get<string>("MP_MARKETPLACE_FEE") ?? "0.15");
    const amountPaid =
      mode === WalkMode.EXCLUSIVO
        ? walkType.basePrice * walkType.exclusiveMultiplier
        : walkType.basePrice;
    const platformFee = amountPaid * commissionRate;
    const walkerAmount = amountPaid - platformFee;

    // 8. Crear Walk + WalkParticipants en una transacción
    const walk = await this.prisma.$transaction(async (tx) => {
      const newWalk = await tx.walk.create({
        data: {
          walkTypeId: dto.walkTypeId,
          walkerId: dto.walkerId,
          mode,
          scheduledAt,
          pickupLat: dto.pickupLat,
          pickupLng: dto.pickupLng,
          pickupAddress: dto.pickupAddress,
          totalAmount: amountPaid,
          platformFee,
          walkerAmount,
          commissionRate,
          status: WalkStatus.PENDING,
        },
      });

      await tx.walkParticipant.createMany({
        data: dto.dogIds.map((dogId) => ({
          walkId: newWalk.id,
          ownerId: owner.id,
          dogId,
          amountPaid: amountPaid / dto.dogIds.length,
        })),
      });

      return newWalk;
    });

    return this.prisma.walk.findUnique({ where: { id: walk.id }, include: WALK_INCLUDE });
  }

  // ─── Mis paseos ──────────────────────────────────────────

  async findMyWalks(userId: string, role: string, query: QueryWalksDto) {
    const statusFilter = query.status ? { status: query.status as WalkStatus } : {};

    if (role === UserRole.WALKER) {
      const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
      if (!walker) throw new NotFoundException("Perfil de paseador no encontrado");

      return this.prisma.walk.findMany({
        where: { walkerId: walker.id, ...statusFilter },
        include: WALK_INCLUDE,
        orderBy: { scheduledAt: "desc" },
      });
    }

    // OWNER — busca por WalkParticipant
    const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!owner) throw new NotFoundException("Perfil de dueño no encontrado");

    const participants = await this.prisma.walkParticipant.findMany({
      where: { ownerId: owner.id },
      select: { walkId: true },
      distinct: ["walkId"],
    });
    const walkIds = participants.map((p) => p.walkId);

    return this.prisma.walk.findMany({
      where: { id: { in: walkIds }, ...statusFilter },
      include: WALK_INCLUDE,
      orderBy: { scheduledAt: "desc" },
    });
  }

  // ─── Detalle de un paseo ─────────────────────────────────

  async findById(userId: string, role: string, walkId: string) {
    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      include: WALK_INCLUDE,
    });
    if (!walk) throw new NotFoundException("Paseo no encontrado");

    await this.assertWalkAccess(userId, role, walk);
    return walk;
  }

  // ─── Confirmar (paseador) ────────────────────────────────

  async confirm(userId: string, walkId: string) {
    const walk = await this.getWalkerWalkOrThrow(userId, walkId);
    this.assertStatus(walk.status, WalkStatus.PENDING, "confirmar");

    return this.updateStatus(walkId, WalkStatus.CONFIRMED);
  }

  // ─── Rechazar (paseador) ─────────────────────────────────

  async reject(userId: string, walkId: string) {
    const walk = await this.getWalkerWalkOrThrow(userId, walkId);
    this.assertStatus(walk.status, WalkStatus.PENDING, "rechazar");

    return this.updateStatus(walkId, WalkStatus.CANCELLED_WALKER);
  }

  // ─── En camino (paseador) ────────────────────────────────

  async markOnWay(userId: string, walkId: string) {
    const walk = await this.getWalkerWalkOrThrow(userId, walkId);
    this.assertStatus(walk.status, WalkStatus.CONFIRMED, "marcar en camino");

    return this.updateStatus(walkId, WalkStatus.WALKER_ON_WAY);
  }

  // ─── Iniciar paseo (paseador) ────────────────────────────

  async start(userId: string, walkId: string) {
    const walk = await this.getWalkerWalkOrThrow(userId, walkId);
    this.assertStatus(walk.status, WalkStatus.WALKER_ON_WAY, "iniciar");

    return this.updateStatus(walkId, WalkStatus.IN_PROGRESS, { startedAt: new Date() });
  }

  // ─── Finalizar paseo (paseador) ──────────────────────────

  async finish(userId: string, walkId: string) {
    const walk = await this.getWalkerWalkOrThrow(userId, walkId);
    this.assertStatus(walk.status, WalkStatus.IN_PROGRESS, "finalizar");

    return this.updateStatus(walkId, WalkStatus.COMPLETED, { endedAt: new Date() });
  }

  // ─── Cancelar (dueño o paseador) ────────────────────────

  async cancel(userId: string, role: string, walkId: string, dto: CancelWalkDto) {
    const walk = await this.prisma.walk.findUnique({ where: { id: walkId } });
    if (!walk) throw new NotFoundException("Paseo no encontrado");

    const cancellableStatuses: WalkStatus[] = [WalkStatus.PENDING, WalkStatus.CONFIRMED];
    if (!cancellableStatuses.includes(walk.status)) {
      throw new BadRequestException(
        `No se puede cancelar un paseo en estado "${walk.status}"`
      );
    }

    if (role === UserRole.WALKER) {
      const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
      if (!walker || walk.walkerId !== walker.id) {
        throw new ForbiddenException("No tenés acceso a este paseo");
      }
      return this.updateStatus(walkId, WalkStatus.CANCELLED_WALKER, {
        cancellationReason: dto.cancellationReason ?? null,
      });
    }

    // OWNER
    const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!owner) throw new ForbiddenException("No tenés acceso a este paseo");
    const isParticipant = await this.prisma.walkParticipant.findFirst({
      where: { walkId, ownerId: owner.id },
    });
    if (!isParticipant) throw new ForbiddenException("No tenés acceso a este paseo");

    return this.updateStatus(walkId, WalkStatus.CANCELLED_OWNER, {
      cancellationReason: dto.cancellationReason ?? null,
    });
  }

  // ─── Ruta GPS ────────────────────────────────────────────

  async getLocations(userId: string, role: string, walkId: string) {
    const walk = await this.prisma.walk.findUnique({ where: { id: walkId } });
    if (!walk) throw new NotFoundException("Paseo no encontrado");

    await this.assertWalkAccess(userId, role, walk);

    return this.prisma.walkLocation.findMany({
      where: { walkId },
      orderBy: { recordedAt: "asc" },
      select: { lat: true, lng: true, recordedAt: true },
    });
  }

  // ─── Helpers privados ────────────────────────────────────

  private async getWalkerWalkOrThrow(userId: string, walkId: string) {
    const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
    if (!walker) throw new ForbiddenException("Perfil de paseador no encontrado");

    const walk = await this.prisma.walk.findUnique({ where: { id: walkId } });
    if (!walk) throw new NotFoundException("Paseo no encontrado");
    if (walk.walkerId !== walker.id) {
      throw new ForbiddenException("No tenés acceso a este paseo");
    }

    return walk;
  }

  private async assertWalkAccess(
    userId: string,
    role: string,
    walk: { id: string; walkerId: string },
  ) {
    if (role === UserRole.WALKER) {
      const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
      if (!walker || walk.walkerId !== walker.id) {
        throw new ForbiddenException("No tenés acceso a este paseo");
      }
      return;
    }

    if (role === UserRole.OWNER) {
      const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
      if (!owner) throw new ForbiddenException("No tenés acceso a este paseo");
      const participant = await this.prisma.walkParticipant.findFirst({
        where: { walkId: walk.id, ownerId: owner.id },
      });
      if (!participant) throw new ForbiddenException("No tenés acceso a este paseo");
    }
  }

  private assertStatus(
    current: WalkStatus,
    required: WalkStatus,
    action: string,
  ) {
    if (current !== required) {
      throw new BadRequestException(
        `No se puede ${action} un paseo en estado "${current}". Se requiere "${required}"`
      );
    }
  }

  private updateStatus(
    walkId: string,
    status: WalkStatus,
    extra: Record<string, unknown> = {},
  ) {
    return this.prisma.walk.update({
      where: { id: walkId },
      data: { status, ...extra },
      include: WALK_INCLUDE,
    });
  }
}
