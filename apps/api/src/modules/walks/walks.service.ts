import {
  Injectable,
  Optional,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { Prisma, WalkStatus, WalkMode, VerificationStatus, UserRole } from "@prisma/client";
import { CreateWalkDto } from "./dto/create-walk.dto";
import { CancelWalkDto } from "./dto/cancel-walk.dto";
import { QueryWalksDto } from "./dto/query-walks.dto";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { ChatService } from "../chat/chat.service";
import { NotificationsService } from "../notifications/notifications.service";
import { toBusinessDayAndTime } from "../../common/utils/schedule-timezone";
import { isWalkPaid } from "./walk-payment.util";

// Incluye las relaciones que siempre se devuelven con un Walk
const WALK_INCLUDE = {
  walkType: true,
  walker: {
    select: {
      id: true,
      bio: true,
      rating: true,
      totalReviews: true,
      isAvailable: true,
      verificationStatus: true,
      maxDogsPerWalk: true,
      user: { select: { firstName: true, lastName: true, avatarUrl: true, phone: true } },
    },
  },
  participants: {
    include: {
      dog: { select: { id: true, name: true, size: true } },
      owner: {
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      },
    },
  },
} as const;

type WalkWithInclude = Prisma.WalkGetPayload<{ include: typeof WALK_INCLUDE }>;
type ParticipantWithInclude = WalkWithInclude["participants"][number];

function toPublicWalkType(walkType: WalkWithInclude["walkType"]) {
  return {
    id: walkType.id,
    label: walkType.label,
    durationMinutes: walkType.durationMinutes,
  };
}

function toPublicWalker(walker: WalkWithInclude["walker"]) {
  return {
    id: walker.id,
    bio: walker.bio,
    rating: walker.rating,
    totalReviews: walker.totalReviews,
    isAvailable: walker.isAvailable,
    verificationStatus: walker.verificationStatus,
    maxDogsPerWalk: walker.maxDogsPerWalk,
    user: {
      firstName: walker.user.firstName,
      lastName: walker.user.lastName,
      avatarUrl: walker.user.avatarUrl,
      phone: walker.user.phone,
    },
  };
}

function toPublicDog(dog: ParticipantWithInclude["dog"]) {
  return {
    id: dog.id,
    name: dog.name,
    size: dog.size,
  };
}

// El OwnerProfile completo tiene address/neighborhood/lat/lng — el domicilio
// exacto del dueño. En un paseo GRUPAL (el @default de Walk.mode) todos los
// participantes comparten el mismo array de `participants`, así que copiar
// el owner entero le manda a cada dueño el domicilio y las coordenadas de
// los otros dueños del mismo paseo. Lista blanca explícita, no include.
function toPublicOwner(owner: ParticipantWithInclude["owner"]) {
  return {
    id: owner.id,
    user: {
      firstName: owner.user.firstName,
      lastName: owner.user.lastName,
      avatarUrl: owner.user.avatarUrl,
    },
  };
}

// WalkParticipant trae su propia columna amountPaid (lo que ESE dueño paga
// por ESE perro) además de dog/owner. En un GRUPAL, todo el array de
// participants viaja a cada dueño — copiar el participante entero le
// mostraría a un dueño cuánto pagan los demás por sus perros.
function toPublicParticipant(participant: ParticipantWithInclude) {
  return {
    dog: toPublicDog(participant.dog),
    owner: toPublicOwner(participant.owner),
  };
}

/**
 * Salida pública de un Walk — un solo lugar. Usado en findById() y en las
 * dos ramas de findMyWalks(): antes findById construía la salida a mano
 * (lista blanca) pero findMyWalks seguía con `...w` (lista negra, mandaba
 * mpPaymentId/mpRefundId), así que alcanzaba con pedir la lista en vez del
 * detalle para esquivar la protección. Con un solo helper no pueden volver
 * a divergir.
 *
 * Cada campo anidado (walkType, walker, participants) se construye nombrando
 * columnas — nunca copiando el objeto que vino de Prisma tal cual. Copiar el
 * objeto entero es una lista blanca de una sola capa: alcanza con que alguien
 * cambie WALK_INCLUDE de `select` a `include` (como pasaba antes con
 * participants.owner) para que vuelva a viajar todo. Con dos capas, cambiar
 * el include no alcanza para filtrar algo nuevo.
 */
function toPublicWalk(walk: WalkWithInclude) {
  return {
    id: walk.id,
    status: walk.status,
    scheduledAt: walk.scheduledAt,
    pickupAddress: walk.pickupAddress,
    totalAmount: walk.totalAmount,
    walkType: toPublicWalkType(walk.walkType),
    walker: toPublicWalker(walk.walker),
    participants: walk.participants.map(toPublicParticipant),
    isPaid: isWalkPaid(walk.mpPaymentId),
    isExpired: walk.scheduledAt.getTime() <= Date.now(),
  };
}

const DEFAULT_COMMISSION_RATE = 0.15;

@Injectable()
export class WalksService {
  private readonly logger = new Logger(WalksService.name);

  // Validada una sola vez al arrancar — ver validateCommissionRate()
  private readonly commissionRate: number;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Optional() private trackingGateway?: TrackingGateway,
    @Optional() private chatService?: ChatService,
    @Optional() private notificationsService?: NotificationsService,
  ) {
    this.commissionRate = this.validateCommissionRate();
  }

  // MP_MARKETPLACE_FEE es una FRACCIÓN (0.15 = 15%), no un porcentaje — si
  // alguien la setea a "15" pensando en 15%, platformFee termina siendo 15x
  // el precio y walkerAmount negativo. Mejor que la API no arranque a que
  // calcule comisiones absurdas en producción.
  private validateCommissionRate(): number {
    const raw = this.config.get<string>("MP_MARKETPLACE_FEE");
    if (raw === undefined || raw === null || raw === "") {
      return DEFAULT_COMMISSION_RATE;
    }

    const fee = parseFloat(raw);
    if (Number.isNaN(fee) || fee <= 0 || fee >= 1) {
      throw new Error(
        `MP_MARKETPLACE_FEE inválida: "${raw}". Debe ser una FRACCIÓN entre 0 y 1 ` +
        `(ej. 0.15 = 15%), no un porcentaje.`
      );
    }
    return fee;
  }

  // ─── Crear reserva ───────────────────────────────────────

  async create(userId: string, dto: CreateWalkDto) {
    const mode = dto.mode ?? WalkMode.GRUPAL;
    const scheduledAt = new Date(dto.scheduledAt);

    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException("La fecha y hora del paseo deben ser en el futuro");
    }

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
    // Las franjas de WalkerSchedule se interpretan en hora argentina — ver
    // toBusinessDayAndTime para el porqué (no usar getDay()/toTimeString() acá).
    const { dayOfWeek, timeStr } = toBusinessDayAndTime(scheduledAt);

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
    const commissionRate = this.commissionRate;
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

    // Fire-and-forget: un fallo al notificar nunca debe romper la reserva ya creada.
    // El .catch() es necesario — un `void promesa` sin manejar el rechazo sigue
    // siendo una unhandled rejection a nivel de proceso.
    void this.notificationsService
      ?.notifyNewWalkRequest(walk.id)
      .catch((err) => this.logger.warn(`No se pudo notificar la nueva solicitud: ${err}`));

    const created = await this.prisma.walk.findUnique({
      where: { id: walk.id },
      include: WALK_INCLUDE,
    });
    if (!created) throw new NotFoundException("Paseo no encontrado");
    return toPublicWalk(created);
  }

  // ─── Mis paseos ──────────────────────────────────────────

  async findMyWalks(userId: string, role: string, query: QueryWalksDto) {
    const statusFilter = query.status ? { status: query.status as WalkStatus } : {};

    if (role === UserRole.WALKER) {
      const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
      if (!walker) throw new NotFoundException("Perfil de paseador no encontrado");

      const walks = await this.prisma.walk.findMany({
        where: { walkerId: walker.id, ...statusFilter },
        include: WALK_INCLUDE,
        orderBy: { scheduledAt: "desc" },
      });
      return walks.map(toPublicWalk);
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

    const walks = await this.prisma.walk.findMany({
      where: { id: { in: walkIds }, ...statusFilter },
      include: WALK_INCLUDE,
      orderBy: { scheduledAt: "desc" },
    });
    return walks.map(toPublicWalk);
  }

  // ─── Detalle de un paseo ─────────────────────────────────

  async findById(userId: string, role: string, walkId: string) {
    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      include: WALK_INCLUDE,
    });
    if (!walk) throw new NotFoundException("Paseo no encontrado");

    await this.assertWalkAccess(userId, role, walk);
    return toPublicWalk(walk);
  }

  // ─── Confirmar (paseador) ────────────────────────────────

  async confirm(userId: string, walkId: string) {
    const walk = await this.getWalkerWalkOrThrow(userId, walkId);
    this.assertStatus(walk.status, WalkStatus.PENDING, "confirmar");

    const updated = await this.updateStatus(walkId, WalkStatus.CONFIRMED);

    // Crear conversación entre paseador y dueño al confirmar
    await this.chatService?.ensureConversationForWalk(walkId);

    return updated;
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

    // 1. AUTORIZACIÓN — primero, siempre. Si corre después de validar estado
    // o plata, cada chequeo de arriba le filtra un dato del paseo a alguien
    // que no tiene acceso (ver resolveCancelTarget): un mismo endpoint que
    // hoy devolvería 404 / 400 "estado X" / 400 "ya pagado" / 403 según lo
    // que se valide primero es un oráculo de estado para paseos ajenos.
    const targetStatus = await this.resolveCancelTarget(userId, role, walk);

    // 2. ESTADO
    const cancellableStatuses: WalkStatus[] = [WalkStatus.PENDING, WalkStatus.CONFIRMED];
    if (!cancellableStatuses.includes(walk.status)) {
      throw new BadRequestException(
        `No se puede cancelar un paseo en estado "${walk.status}"`
      );
    }

    // 3. PLATA — falla cerrado: mientras no exista la política de reembolso,
    // la API no puede cancelar nada que tenga plata adentro — la plata
    // quedaría en la cuenta del paseador (split directo, Güau nunca la
    // custodia) sin que nadie decida nada. El mensaje no menciona ningún
    // canal de contacto a propósito (no existe ninguno en la app hoy) ni
    // afirma nada sobre la plata (la política todavía no está definida).
    // Cuando la política exista, este throw es el punto exacto donde se
    // enchufa el refund.
    if (isWalkPaid(walk.mpPaymentId)) {
      throw new BadRequestException(
        "No se puede cancelar un paseo ya pagado desde la app"
      );
    }

    return this.updateStatus(walkId, targetStatus, {
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
      return;
    }

    // Default-deny: ADMIN tiene acceso explícito; cualquier otro rol
    // (presente o futuro) queda afuera salvo que se agregue acá a propósito.
    if (role === UserRole.ADMIN) return;

    throw new ForbiddenException("No tenés acceso a este paseo");
  }

  /**
   * Autorización primero: resuelve la pertenencia y devuelve el estado
   * destino. Va ANTES de cualquier otra validación en cancel() — si corre
   * después, cada chequeo de arriba (estado, pago) le filtra un dato del
   * paseo a quien no tiene acceso.
   */
  private async resolveCancelTarget(
    userId: string,
    role: string,
    walk: { id: string; walkerId: string },
  ): Promise<WalkStatus> {
    if (role === UserRole.WALKER) {
      const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
      if (!walker || walk.walkerId !== walker.id) {
        throw new ForbiddenException("No tenés acceso a este paseo");
      }
      return WalkStatus.CANCELLED_WALKER;
    }

    if (role === UserRole.OWNER) {
      const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
      if (!owner) throw new ForbiddenException("No tenés acceso a este paseo");
      const isParticipant = await this.prisma.walkParticipant.findFirst({
        where: { walkId: walk.id, ownerId: owner.id },
      });
      if (!isParticipant) throw new ForbiddenException("No tenés acceso a este paseo");
      return WalkStatus.CANCELLED_OWNER;
    }

    // Deny-by-default explícito. ADMIN incluido: un admin que quiere deshacer
    // un paseo pagado va por POST /admin/walks/:id/refund, no por acá. Antes
    // caía en la rama OWNER y moría en el `!owner` — mismo resultado, pero
    // por accidente. Ojo: assertWalkAccess() SÍ le da acceso a ADMIN (lectura,
    // en findById/getLocations). Son criterios distintos a propósito: leer
    // no es escribir.
    throw new ForbiddenException("No tenés acceso a este paseo");
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

  private async updateStatus(
    walkId: string,
    status: WalkStatus,
    extra: Record<string, unknown> = {},
  ) {
    const updated = await this.prisma.walk.update({
      where: { id: walkId },
      data: { status, ...extra },
      include: WALK_INCLUDE,
    });

    // Emitir cambio de estado via Socket.io
    this.trackingGateway?.emitStatusChanged(walkId, status);

    // Crear notificación push en DB y emitirla al usuario correspondiente.
    // .catch() necesario: un `void promesa` sin manejar el rechazo sigue
    // siendo una unhandled rejection a nivel de proceso (mismo fix que create()).
    void this.notificationsService
      ?.notifyWalkStatusChange(walkId, status)
      .catch((err) => this.logger.warn(`No se pudo notificar cambio de estado: ${err}`));

    return toPublicWalk(updated);
  }
}
