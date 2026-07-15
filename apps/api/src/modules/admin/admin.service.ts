import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { VerificationStatus, WalkStatus, PayoutStatus, UserRole } from "@prisma/client";
import { NOTIFICATION_TYPES } from "@guau/shared";
import { VerifyWalkerDto } from "./dto/verify-walker.dto";
import { QueryAdminWalksDto } from "./dto/query-admin-walks.dto";

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

  // ─── Todos los paseos ────────────────────────────────────

  async getAllWalks(query: QueryAdminWalksDto) {
    const { status, walkerId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      ...(status && { status: status as WalkStatus }),
      ...(walkerId && { walkerId }),
    };

    const [walks, total] = await Promise.all([
      this.prisma.walk.findMany({
        where,
        include: {
          walkType: true,
          walker: {
            select: {
              id: true,
              rating: true,
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
          participants: {
            include: {
              dog: { select: { name: true, size: true } },
              owner: {
                include: {
                  user: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
        orderBy: { scheduledAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.walk.count({ where }),
    ]);

    return {
      data: walks,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
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

  // ─── Procesar pagos semanales ────────────────────────────
  // Encuentra los Payout PENDING del período anterior y los marca como COMPLETED.
  // En producción aquí iría la llamada a la API de Transferencias de MercadoPago.

  async processPayouts() {
    const now = new Date();

    const pendingPayouts = await this.prisma.payout.findMany({
      where: {
        status: PayoutStatus.PENDING,
        periodEnd: { lt: now },
      },
      include: {
        walker: {
          select: { user: { select: { id: true, firstName: true } } },
        },
      },
    });

    if (pendingPayouts.length === 0) {
      return { processed: 0, message: "No hay pagos pendientes para procesar" };
    }

    // Marcar como PROCESSING primero (para no procesar dos veces si el job falla)
    await this.prisma.payout.updateMany({
      where: { id: { in: pendingPayouts.map((p) => p.id) } },
      data: { status: PayoutStatus.PROCESSING },
    });

    // En producción: llamar MP Transfers API por cada payout
    // const mpTransfer = await mercadopago.transfers.create({ ... })

    // Para MVP: marcar directamente como COMPLETED
    await this.prisma.payout.updateMany({
      where: { id: { in: pendingPayouts.map((p) => p.id) } },
      data: { status: PayoutStatus.COMPLETED },
    });

    // Notificar a cada paseador
    await Promise.all(
      pendingPayouts.map((payout) =>
        this.notifications.create({
          userId: payout.walker.user.id,
          title:  "¡Recibiste tu pago! 💰",
          body:   `Transferimos $${payout.amount.toLocaleString("es-AR")} a tu cuenta de MercadoPago.`,
          type:   NOTIFICATION_TYPES.WALK_COMPLETED,
          data:   { payoutId: payout.id, amount: payout.amount },
        })
      )
    );

    const totalTransferred = pendingPayouts.reduce((s, p) => s + p.amount, 0);

    return {
      processed: pendingPayouts.length,
      totalTransferred,
      message: `${pendingPayouts.length} pagos procesados por $${totalTransferred.toLocaleString("es-AR")} ARS`,
    };
  }
}
