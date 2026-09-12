import { Injectable, NotFoundException, BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { VerificationStatus, VerificationMethod, WalkStatus, UserRole, Prisma } from "@prisma/client";
import { NOTIFICATION_TYPES } from "@guau/shared";
import { VerifyWalkerDto, VerifyWalkerAction } from "./dto/verify-walker.dto";
import { QueryWalkersDto } from "./dto/query-walkers.dto";

// reject/suspend/reinstate necesitan que quede escrito el motivo — approve
// no, porque "aprobado" no necesita justificarse de la misma forma.
const ACTIONS_THAT_REQUIRE_NOTES: VerifyWalkerAction[] = ["reject", "suspend", "reinstate"];

// Una linea por evento, con fecha — nunca se pisa (ver verifyWalker). Antes
// era `dto.notes ?? null`, que borraba el historial entero al ejecutar una
// accion sin nota nueva (docs/diseños/verificacion-de-paseadores.md §1/§6).
const ACTION_LABEL: Record<VerifyWalkerAction, string> = {
  approve:   "APROBADO",
  reject:    "RECHAZADO",
  suspend:   "SUSPENDIDO",
  reinstate: "REACTIVADO",
};

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── Paseadores por estado de verificación ───────────────

  async getWalkers(query: QueryWalkersDto) {
    const status = query.status ?? VerificationStatus.PENDING;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.walkerProfile.findMany({
        where: { verificationStatus: status },
        select: {
          id: true,
          userId: true,
          bio: true,
          rating: true,
          totalReviews: true,
          isAvailable: true,
          maxDogsPerWalk: true,
          centerLat: true,
          centerLng: true,
          radiusKm: true,
          verificationStatus: true,
          verificationNotes: true,
          verificationMethod: true,
          verifiedAt: true,
          verifiedById: true,
          // dniNumber / dniPhotoUrl / selfieUrl quedan afuera a proposito:
          // en la etapa 1 estan vacios y no se van a llenar — "no se saca
          // de la salida: no se trae de la base" (verificacion-de-paseadores.md §3).
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              createdAt: true,
            },
          },
        },
        orderBy: { user: { createdAt: "asc" } },
        skip,
        take: limit,
      }),
      this.prisma.walkerProfile.count({ where: { verificationStatus: status } }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ─── Verificar identidad: aprobar / rechazar / suspender / reactivar ─────

  async verifyWalker(walkerProfileId: string, dto: VerifyWalkerDto, adminId: string, adminEmail: string) {
    if (ACTIONS_THAT_REQUIRE_NOTES.includes(dto.action) && !dto.notes) {
      throw new BadRequestException(
        `Debés incluir una nota explicando el motivo para "${dto.action}"`
      );
    }

    const walker = await this.prisma.walkerProfile.findUnique({
      where: { id: walkerProfileId },
      include: { user: { select: { id: true, firstName: true, email: true } } },
    });
    if (!walker) throw new NotFoundException("Paseador no encontrado");

    // REJECTED es terminal: no hay accion que lo saque de ahi (§6).
    if (walker.verificationStatus === VerificationStatus.REJECTED) {
      throw new ConflictException(
        "Este paseador fue rechazado definitivamente. El rechazo no se revierte."
      );
    }

    if (dto.action === "reinstate" && walker.verificationStatus !== VerificationStatus.SUSPENDED) {
      throw new ConflictException(
        "Solo se puede reactivar a un paseador que está SUSPENDED"
      );
    }

    // Sin esto, "approve" sobre un SUSPENDED llegaría a VERIFIED sin pasar
    // por la nota obligatoria de "reinstate" — el mismo destino, sin dejar
    // rastro de por qué se levantó la suspensión.
    if (dto.action === "approve" && walker.verificationStatus === VerificationStatus.SUSPENDED) {
      throw new ConflictException(
        'Este paseador está SUSPENDED. Para volver a VERIFIED usá la acción "reinstate" (exige nota).'
      );
    }

    const data: Prisma.WalkerProfileUpdateInput = {
      verificationStatus: this.nextStatus(dto.action),
      verificationNotes: this.appendNote(walker.verificationNotes, dto.action, dto.notes, adminEmail),
    };

    if (dto.action === "approve") {
      data.verificationMethod = VerificationMethod.PERSONAL;
      data.verifiedAt = new Date();
      data.verifiedById = adminId;
    }

    const updated = await this.prisma.walkerProfile.update({
      where: { id: walkerProfileId },
      data,
      select: {
        id: true,
        verificationStatus: true,
        verificationNotes: true,
        verificationMethod: true,
        verifiedAt: true,
        verifiedById: true,
      },
    });

    await this.notifyWalker(dto.action, walker.user.id, walkerProfileId, dto.notes);

    return updated;
  }

  private nextStatus(action: VerifyWalkerAction): VerificationStatus {
    switch (action) {
      case "approve":
        return VerificationStatus.VERIFIED;
      case "reject":
        return VerificationStatus.REJECTED;
      case "suspend":
        return VerificationStatus.SUSPENDED;
      case "reinstate":
        return VerificationStatus.VERIFIED;
    }
  }

  private appendNote(
    existing: string | null,
    action: VerifyWalkerAction,
    note: string | undefined,
    adminEmail: string,
  ): string | null {
    if (!note) return existing;
    const date = new Date().toISOString().slice(0, 10);
    const line = `[${date}] ${ACTION_LABEL[action]} por ${adminEmail}: ${note}`;
    return existing ? `${existing}\n${line}` : line;
  }

  private async notifyWalker(
    action: VerifyWalkerAction,
    userId: string,
    walkerProfileId: string,
    notes: string | undefined,
  ) {
    switch (action) {
      case "approve":
        // NOTIFICATION_TYPES no tiene un tipo para "verificacion de cuenta
        // aprobada" — se reutiliza WALK_CONFIRMED (mismatch preexistente,
        // no se inventa uno nuevo sin consultarlo con Joa).
        return this.notifications.create({
          userId,
          title: "¡Tu cuenta fue verificada! 🎉",
          body: "Ya podés activar tu disponibilidad y empezar a recibir reservas en Güau.",
          type: NOTIFICATION_TYPES.WALK_CONFIRMED,
          data: { walkerProfileId },
        });
      case "reject":
        // Texto sin "ajustá y reenviá": REJECTED es terminal, no hay
        // segunda vuelta (antes el mensaje sugería que sí la había).
        return this.notifications.create({
          userId,
          title: "Verificación rechazada",
          body: `Revisamos tu solicitud y no vamos a poder verificarte: ${notes}`,
          type: NOTIFICATION_TYPES.WALK_REJECTED,
          data: { walkerProfileId, notes },
        });
      case "suspend":
        return this.notifications.create({
          userId,
          title: "Tu cuenta fue suspendida",
          body: `Tu verificación de identidad quedó en revisión: ${notes}`,
          type: NOTIFICATION_TYPES.WALKER_SUSPENDED,
          data: { walkerProfileId, notes },
        });
      case "reinstate":
        return this.notifications.create({
          userId,
          title: "Tu cuenta fue reactivada",
          body: `Ya podés volver a trabajar en Güau: ${notes}`,
          type: NOTIFICATION_TYPES.WALKER_REINSTATED,
          data: { walkerProfileId, notes },
        });
    }
  }

  // ─── Métricas generales ──────────────────────────────────

  async getStats() {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const [
      totalOwners,
      totalWalkers,
      walkersByStatus,
      walksByStatus,
      revenueTotal,
      revenueThisWeek,
      activeWalkers,
      completedThisWeek,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.OWNER } }),
      this.prisma.user.count({ where: { role: UserRole.WALKER } }),

      this.prisma.walkerProfile.groupBy({
        by: ["verificationStatus"],
        _count: true,
      }),

      this.prisma.walk.groupBy({
        by: ["status"],
        _count: true,
      }),

      this.prisma.walk.aggregate({
        where: { status: WalkStatus.COMPLETED },
        _sum: { platformFee: true, totalAmount: true, walkerAmount: true },
      }),

      this.prisma.walk.aggregate({
        where: {
          status: WalkStatus.COMPLETED,
          endedAt: { gte: weekStart },
        },
        _sum: { platformFee: true, totalAmount: true },
      }),

      this.prisma.walkerProfile.count({
        where: {
          verificationStatus: VerificationStatus.VERIFIED,
          isAvailable: true,
        },
      }),

      this.prisma.walk.count({
        where: {
          status: WalkStatus.COMPLETED,
          endedAt: { gte: weekStart },
        },
      }),
    ]);

    const walkerStatusMap = Object.fromEntries(
      walkersByStatus.map((w) => [w.verificationStatus, w._count])
    );

    const walkStatusMap = Object.fromEntries(
      walksByStatus.map((w) => [w.status, w._count])
    );

    return {
      users: {
        totalOwners,
        totalWalkers,
        total: totalOwners + totalWalkers,
      },
      walkers: {
        pending:   walkerStatusMap[VerificationStatus.PENDING]   ?? 0,
        verified:  walkerStatusMap[VerificationStatus.VERIFIED]  ?? 0,
        suspended: walkerStatusMap[VerificationStatus.SUSPENDED] ?? 0,
        rejected:  walkerStatusMap[VerificationStatus.REJECTED]  ?? 0,
        activeNow: activeWalkers,
      },
      walks: {
        byStatus: walkStatusMap,
        completedThisWeek,
        total: walksByStatus.reduce((s, w) => s + w._count, 0),
      },
      revenue: {
        totalGross:      revenueTotal._sum.totalAmount   ?? 0,
        totalPlatformFee: revenueTotal._sum.platformFee  ?? 0,
        totalWalkerPaid: revenueTotal._sum.walkerAmount  ?? 0,
        thisWeekGross:   revenueThisWeek._sum.totalAmount  ?? 0,
        thisWeekFee:     revenueThisWeek._sum.platformFee  ?? 0,
      },
    };
  }
}
