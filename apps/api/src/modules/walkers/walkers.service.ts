import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { VerificationStatus } from "@prisma/client";
import { UpdateWalkerDto } from "./dto/update-walker.dto";
import { UpdateAvailabilityDto } from "./dto/update-availability.dto";
import { CreateScheduleDto } from "./dto/create-schedule.dto";
import { UpdateScheduleDto } from "./dto/update-schedule.dto";
import { SetZoneDto } from "./dto/set-zone.dto";
import { SearchWalkersDto } from "./dto/search-walkers.dto";
import { toBusinessDayAndTime } from "../../common/utils/schedule-timezone";

@Injectable()
export class WalkersService {
  constructor(private prisma: PrismaService) {}

  // ─── Búsqueda de paseadores ──────────────────────────────
  // Usa Haversine en SQL raw para filtrar por zona de operación.
  // Cuando se agregue PostGIS se puede reemplazar por ST_DWithin para mejor performance.

  async search(dto: SearchWalkersDto) {
    const { lat, lng, date, walkTypeId } = dto;

    // Las franjas de WalkerSchedule se interpretan en hora argentina — ver
    // toBusinessDayAndTime para el porqué (no usar getDay()/toTimeString() acá).
    // dayOfWeek: 0=Dom ... 6=Sáb (igual que JS Date)
    const { dayOfWeek, timeStr } = date
      ? toBusinessDayAndTime(new Date(date))
      : { dayOfWeek: null, timeStr: null };

    type WalkerRow = {
      id: string;
      userId: string;
      bio: string | null;
      rating: number;
      totalReviews: number;
      isAvailable: boolean;
      maxDogsPerWalk: number;
      centerLat: number;
      centerLng: number;
      radiusKm: number;
      verificationStatus: string;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
      distanceKm: number;
    };

    const walkers = await this.prisma.$queryRaw<WalkerRow[]>`
      SELECT
        wp.id,
        wp."userId",
        wp.bio,
        wp.rating,
        wp."totalReviews",
        wp."isAvailable",
        wp."maxDogsPerWalk",
        wp."centerLat",
        wp."centerLng",
        wp."radiusKm",
        wp."verificationStatus",
        u."firstName",
        u."lastName",
        u."avatarUrl",
        (
          6371 * acos(
            LEAST(1.0,
              cos(radians(${lat})) * cos(radians(wp."centerLat"))
              * cos(radians(wp."centerLng") - radians(${lng}))
              + sin(radians(${lat})) * sin(radians(wp."centerLat"))
            )
          )
        ) AS "distanceKm"
      FROM "WalkerProfile" wp
      JOIN "User" u ON wp."userId" = u.id
      WHERE
        wp."isAvailable" = true
        AND wp."verificationStatus" = ${VerificationStatus.VERIFIED}::"VerificationStatus"
        AND wp."centerLat" IS NOT NULL
        AND wp."centerLng" IS NOT NULL
        AND wp."radiusKm" IS NOT NULL
        AND u."isActive" = true
        AND (
          6371 * acos(
            LEAST(1.0,
              cos(radians(${lat})) * cos(radians(wp."centerLat"))
              * cos(radians(wp."centerLng") - radians(${lng}))
              + sin(radians(${lat})) * sin(radians(wp."centerLat"))
            )
          )
        ) <= wp."radiusKm"
      ORDER BY "distanceKm" ASC
    `;

    // Filtro por horario (en memoria — conjunto pequeño de resultados)
    let filtered = walkers;

    if (dayOfWeek !== null && timeStr !== null) {
      const walkerIds = walkers.map((w) => w.id);

      const schedules = await this.prisma.walkerSchedule.findMany({
        where: {
          walkerId: { in: walkerIds },
          dayOfWeek,
          isActive: true,
        },
      });

      const availableIds = new Set(
        schedules
          .filter((s) => s.startTime <= timeStr && s.endTime > timeStr)
          .map((s) => s.walkerId)
      );

      filtered = walkers.filter((w) => availableIds.has(w.id));
    }

    // Filtro por tipo de paseo (verificar que el paseador tiene walks de ese tipo)
    if (walkTypeId) {
      const walkerIds = filtered.map((w) => w.id);
      const walksWithType = await this.prisma.walk.findMany({
        where: {
          walkerId: { in: walkerIds },
          walkTypeId,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        select: { walkerId: true },
        distinct: ["walkerId"],
      });
      const validIds = new Set(walksWithType.map((w) => w.walkerId));
      // No filtramos fuera — solo mostramos el tipo si el paseador acepta ese tipo.
      // La lógica de tipos se resuelve al crear la reserva.
      // Dejamos el array sin filtrar por walkTypeId para no ocultar paseadores.
    }

    return filtered.map((w) => ({
      id: w.id,
      bio: w.bio,
      rating: w.rating,
      totalReviews: w.totalReviews,
      isAvailable: w.isAvailable,
      maxDogsPerWalk: w.maxDogsPerWalk,
      distanceKm: w.distanceKm,
      user: {
        firstName: w.firstName,
        lastName: w.lastName,
        avatarUrl: w.avatarUrl,
      },
    }));
  }

  // ─── Perfil público ──────────────────────────────────────

  async getPublicProfile(walkerId: string) {
    const profile = await this.prisma.walkerProfile.findUnique({
      where: { id: walkerId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
        schedules: { where: { isActive: true }, orderBy: { dayOfWeek: "asc" } },
      },
    });

    if (!profile) throw new NotFoundException("Paseador no encontrado");
    if (profile.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new NotFoundException("Paseador no disponible");
    }

    // Excluir datos sensibles. centerLat/centerLng/radiusKm y userId también
    // se excluyen acá aunque no sean secretos como el DNI o el token de MP:
    // la zona de trabajo del paseador no tiene por qué ser pública con esta
    // precisión, y userId es un identificador interno sin uso en el perfil
    // público (search() ya expone lo necesario para mostrar distancia).
    const { dniNumber, dniPhotoUrl, selfieUrl, mpAccessToken, mpUserId,
            verificationNotes, refreshTokenHash, userId, centerLat, centerLng,
            radiusKm, ...safe } = profile as typeof profile & { refreshTokenHash?: string };

    return safe;
  }

  // ─── Perfil propio del paseador ──────────────────────────

  async getMyProfile(userId: string) {
    const profile = await this.prisma.walkerProfile.findUnique({
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
            emailVerifiedAt: true,
            createdAt: true,
          },
        },
        schedules: { where: { isActive: true }, orderBy: { dayOfWeek: "asc" } },
      },
    });

    if (!profile) throw new NotFoundException("Perfil de paseador no encontrado");

    const { mpAccessToken, ...safeProfile } = profile;
    return { ...safeProfile, mpConnected: !!mpAccessToken };
  }

  // ─── Actualizar perfil ───────────────────────────────────

  async updateMyProfile(userId: string, dto: UpdateWalkerDto) {
    const profile = await this.prisma.walkerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException("Perfil de paseador no encontrado");

    return this.prisma.walkerProfile.update({
      where: { userId },
      data: dto,
    });
  }

  // ─── Disponibilidad ──────────────────────────────────────

  async updateAvailability(userId: string, dto: UpdateAvailabilityDto) {
    const profile = await this.prisma.walkerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException("Perfil no encontrado");

    if (dto.isAvailable && profile.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        "Solo paseadores verificados pueden activar su disponibilidad"
      );
    }

    return this.prisma.walkerProfile.update({
      where: { userId },
      data: { isAvailable: dto.isAvailable },
      select: { id: true, isAvailable: true },
    });
  }

  // ─── Horarios ────────────────────────────────────────────

  async createSchedule(userId: string, dto: CreateScheduleDto) {
    const profile = await this.prisma.walkerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException("Perfil no encontrado");

    const existing = await this.prisma.walkerSchedule.findFirst({
      where: { walkerId: profile.id, dayOfWeek: dto.dayOfWeek, isActive: true },
    });
    if (existing) {
      throw new ConflictException(
        `Ya tenés un horario activo para ese día. Editalo en lugar de crear uno nuevo.`
      );
    }

    return this.prisma.walkerSchedule.create({
      data: { walkerId: profile.id, ...dto },
    });
  }

  async updateSchedule(userId: string, scheduleId: string, dto: UpdateScheduleDto) {
    const profile = await this.prisma.walkerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException("Perfil no encontrado");

    const schedule = await this.prisma.walkerSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule || schedule.walkerId !== profile.id) {
      throw new NotFoundException("Horario no encontrado");
    }

    return this.prisma.walkerSchedule.update({
      where: { id: scheduleId },
      data: dto,
    });
  }

  // ─── Zona de operación ───────────────────────────────────

  async setZone(userId: string, dto: SetZoneDto) {
    const profile = await this.prisma.walkerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException("Perfil no encontrado");

    return this.prisma.walkerProfile.update({
      where: { userId },
      data: {
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        radiusKm: dto.radiusKm,
      },
      select: { id: true, centerLat: true, centerLng: true, radiusKm: true },
    });
  }
}
