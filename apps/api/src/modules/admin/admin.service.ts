import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { VerificationStatus, WalkStatus, UserRole } from "@prisma/client";
import { NOTIFICATION_TYPES } from "@guau/shared";
import { VerifyWalkerDto } from "./dto/verify-walker.dto";

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── Paseadores pendientes de verificación ───────────────

  async getPendingWalkers() {
    return this.prisma.walkerProfile.findMany({
      where: { verificationStatus: VerificationStatus.PENDING },
      select: {
        id: true,
        userId: true,
        bio: true,
        dniNumber: true,
        dniPhotoUrl: true,
        selfieUrl: true,
        rating: true,
        totalReviews: true,
        isAvailable: true,
        maxDogsPerWalk: true,
        centerLat: true,
        centerLng: true,
        radiusKm: true,
        verificationStatus: true,
        verificationNotes: true,
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
    });
  }

  // ─── Aprobar / rechazar paseador ─────────────────────────

  async verifyWalker(walkerProfileId: string, dto: VerifyWalkerDto) {
    if (dto.action === "reject" && !dto.notes) {
      throw new BadRequestException(
        "Debés incluir una nota explicando el motivo del rechazo"
      );
    }

    const walker = await this.prisma.walkerProfile.findUnique({
      where: { id: walkerProfileId },
      include: { user: { select: { id: true, firstName: true } } },
    });
    if (!walker) throw new NotFoundException("Paseador no encontrado");

    const newStatus =
      dto.action === "approve"
        ? VerificationStatus.VERIFIED
        : VerificationStatus.REJECTED;

    const updated = await this.prisma.walkerProfile.update({
      where: { id: walkerProfileId },
      data: {
        verificationStatus: newStatus,
        verificationNotes: dto.notes ?? null,
      },
      select: {
        id: true,
        verificationStatus: true,
        verificationNotes: true,
      },
    });

    // Notificar al paseador
    if (dto.action === "approve") {
      await this.notifications.create({
        userId: walker.user.id,
        title: "¡Tu cuenta fue verificada! 🎉",
        body: "Ya podés activar tu disponibilidad y empezar a recibir reservas en Güau.",
        type: NOTIFICATION_TYPES.WALK_CONFIRMED,
        data: { walkerProfileId },
      });
    } else {
      await this.notifications.create({
        userId: walker.user.id,
        title: "Verificación pendiente",
        body: `Revisamos tu solicitud y necesitamos que ajustes algo: ${dto.notes}`,
        type: NOTIFICATION_TYPES.WALK_REJECTED,
        data: { walkerProfileId, notes: dto.notes },
      });
    }

    return updated;
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
        pending:  walkerStatusMap[VerificationStatus.PENDING]  ?? 0,
        verified: walkerStatusMap[VerificationStatus.VERIFIED] ?? 0,
        rejected: walkerStatusMap[VerificationStatus.REJECTED] ?? 0,
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
