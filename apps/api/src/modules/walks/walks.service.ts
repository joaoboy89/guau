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
import {
  Prisma,
  WalkStatus,
  WalkMode,
  VerificationStatus,
  UserRole,
  NotPerformedReason,
  ClosedBy,
} from "@prisma/client";
import { CreateWalkDto } from "./dto/create-walk.dto";
import { CancelWalkDto } from "./dto/cancel-walk.dto";
import { QueryWalksDto } from "./dto/query-walks.dto";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { ChatService } from "../chat/chat.service";
import { NotificationsService } from "../notifications/notifications.service";
import { MailService } from "../../common/services/mail.service";
import { toBusinessDayAndTime } from "../../common/utils/schedule-timezone";
import { isWalkPaid } from "./walk-payment.util";
import {
  WALK_TIMING,
  NOTIFICATION_TYPES,
  canMarkOnWay,
  canStart,
  canFinish,
  canReportWalkerNoShow,
  expectedEndAt,
  approximatePickupPoint,
} from "@guau/shared";

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
 *
 * `isWalkerView`: true cuando quien pregunta es el paseador asignado a ESTE
 * walk (cada caller lo calcula porque ya lo sabe — ver assertWalkAccess /
 * getWalkerWalkOrThrow, que validan esa pertenencia antes de llegar acá).
 * Mientras sea true y `walk.onWayAt` sea null, el punto de encuentro se
 * ofusca: anti-desintermediación (docs/guau-politicas.md, "Revelación de la
 * dirección"). La ofuscación vive ACÁ, en el backend — mandar la coordenada
 * real y ocultarla en el front no protege nada, cualquiera lee la respuesta
 * cruda desde las herramientas de desarrollador.
 *
 * `pickupZoneSecret`: obligatorio, sin default — ver
 * `WalksService.validatePickupZoneSecret`. Sin un secreto de servidor en el
 * cálculo, el desplazamiento sale solo del `walkId` (público: es el propio
 * paseo del paseador) y el algoritmo (público: este repo lo es) — cualquiera
 * lo recalcula y revierte la ofuscación con una resta.
 */
function toPublicWalk(walk: WalkWithInclude, isWalkerView: boolean, pickupZoneSecret: string) {
  const revealExactLocation = !isWalkerView || walk.onWayAt !== null;
  const approx = revealExactLocation
    ? null
    : approximatePickupPoint(walk.id, walk.pickupLat, walk.pickupLng, pickupZoneSecret);

  return {
    id: walk.id,
    status: walk.status,
    scheduledAt: walk.scheduledAt,
    startedAt: walk.startedAt,
    // null (no calle, no altura) hasta que el paseador aprieta "voy en
    // camino" — "solo la zona" no se puede derivar de un texto libre.
    pickupAddress: revealExactLocation ? walk.pickupAddress : null,
    pickupLat: revealExactLocation ? walk.pickupLat : approx!.lat,
    pickupLng: revealExactLocation ? walk.pickupLng : approx!.lng,
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

  // Validadas una sola vez al arrancar — ver validateCommissionRate() y
  // validatePickupZoneSecret()
  private readonly commissionRate: number;
  private readonly pickupZoneSecret: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Optional() private trackingGateway?: TrackingGateway,
    @Optional() private chatService?: ChatService,
    @Optional() private notificationsService?: NotificationsService,
    @Optional() private mail?: MailService,
  ) {
    this.commissionRate = this.validateCommissionRate();
    this.pickupZoneSecret = this.validatePickupZoneSecret();
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

  // Sin este secreto, la ofuscación del punto de encuentro (ver
  // toPublicWalk/approximatePickupPoint) se calcula solo a partir del
  // walkId — un dato público (el propio paseador lo tiene, es su paseo) con
  // un algoritmo público (este repo lo es). Cualquiera recalcula el mismo
  // desplazamiento y lo revierte con una resta: la protección desaparece
  // sin que se note nada distinto en pantalla. A diferencia de
  // ADMIN_ALERT_EMAIL —que puede faltar y solo se pierde un aviso—, acá
  // faltar significa "sin protección real", así que falla cerrado: mismo
  // criterio que validateCommissionRate(), mejor que la API no arranque a
  // que ande sirviendo una ofuscación decorativa.
  private validatePickupZoneSecret(): string {
    const MIN_LENGTH = 16;
    const raw = this.config.get<string>("PICKUP_ZONE_SECRET");
    if (!raw || raw.length < MIN_LENGTH) {
      throw new Error(
        `PICKUP_ZONE_SECRET ausente o demasiado corta (mínimo ${MIN_LENGTH} caracteres). ` +
        `Sin este secreto, la ofuscación del punto de encuentro es reversible con el walkId ` +
        `a la vista — la API no arranca en vez de servir una protección que no protege.`
      );
    }
    return raw;
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
    // create() es solo para dueños (@Roles(OWNER) en el controller).
    return toPublicWalk(created, /* isWalkerView */ false, this.pickupZoneSecret);
  }

  // ─── Mis paseos ──────────────────────────────────────────

  async findMyWalks(userId: string, role: string, query: QueryWalksDto) {
    const { status, page = 1, limit = 50, days = 30 } = query;
    const skip = (page - 1) * limit;
    const statusFilter = status ? { status: status as WalkStatus } : {};

    // La ventana de 30 días es de producto (evita mandar un año de historial
    // que nadie lee), no de defensa — por eso PENDING queda afuera: son
    // pocos por definición y cada uno es alguien esperando una respuesta. El
    // techo de `limit` SÍ aplica siempre, sin excepción — esa es la defensa.
    const dateFilter =
      status === "PENDING"
        ? {}
        : { scheduledAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } };

    if (role === UserRole.WALKER) {
      const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
      if (!walker) throw new NotFoundException("Perfil de paseador no encontrado");

      const where = { walkerId: walker.id, ...statusFilter, ...dateFilter };
      const [walks, total] = await Promise.all([
        this.prisma.walk.findMany({
          where,
          include: WALK_INCLUDE,
          orderBy: { scheduledAt: "desc" },
          skip,
          take: limit,
        }),
        this.prisma.walk.count({ where }),
      ]);
      return {
        data: walks.map((w) => toPublicWalk(w, /* isWalkerView */ true, this.pickupZoneSecret)),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit), days },
      };
    }

    // OWNER — busca por WalkParticipant
    const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!owner) throw new NotFoundException("Perfil de dueño no encontrado");

    // Una sola consulta acotada por skip/take, sin paso intermedio ni IN
    // gigante: "paseos donde este dueño tiene al menos un participante" es
    // exactamente lo que calculaba el findMany + map de walkIds de antes.
    // El distinct de esa consulta ya no hace falta — acá se filtran paseos,
    // no participantes, así que un paseo con dos perros del mismo dueño no
    // se duplica.
    const where = { participants: { some: { ownerId: owner.id } }, ...statusFilter, ...dateFilter };
    const [walks, total] = await Promise.all([
      this.prisma.walk.findMany({
        where,
        include: WALK_INCLUDE,
        orderBy: { scheduledAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.walk.count({ where }),
    ]);
    return {
      data: walks.map((w) => toPublicWalk(w, /* isWalkerView */ false, this.pickupZoneSecret)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit), days },
    };
  }

  // ─── Detalle de un paseo ─────────────────────────────────

  async findById(userId: string, role: string, walkId: string) {
    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      include: WALK_INCLUDE,
    });
    if (!walk) throw new NotFoundException("Paseo no encontrado");

    await this.assertWalkAccess(userId, role, walk);
    // assertWalkAccess ya validó que, si el rol es WALKER, walk.walkerId es
    // el de quien pregunta — no hace falta una consulta aparte para saberlo.
    return toPublicWalk(walk, /* isWalkerView */ role === UserRole.WALKER, this.pickupZoneSecret);
  }

  // ─── Confirmar (paseador) ────────────────────────────────

  async confirm(userId: string, walkId: string) {
    const walk = await this.getWalkerWalkOrThrow(userId, walkId);
    this.assertStatus(walk.status, WalkStatus.PENDING, "confirmar");
    // Aceptar una reserva nueva es "trabajo futuro" — lo único que bloquea
    // un IN_PROGRESS vencido (ver assertNoOverdueInProgress). confirm() es
    // la única acción bloqueada en todo este bloque: iniciar, marcar en
    // camino y cerrar NUNCA se bloquean (ver el comentario del método).
    await this.assertNoOverdueInProgress(walk.walkerId);

    const updated = await this.updateStatus(walkId, WalkStatus.CONFIRMED, {}, /* isWalkerView */ true);

    // Crear conversación entre paseador y dueño al confirmar
    await this.chatService?.ensureConversationForWalk(walkId);

    return updated;
  }

  // ─── Rechazar (paseador) ─────────────────────────────────

  async reject(userId: string, walkId: string) {
    const walk = await this.getWalkerWalkOrThrow(userId, walkId);
    this.assertStatus(walk.status, WalkStatus.PENDING, "rechazar");

    return this.updateStatus(walkId, WalkStatus.CANCELLED_WALKER, {}, /* isWalkerView */ true);
  }

  // ─── En camino (paseador) ────────────────────────────────

  async markOnWay(userId: string, walkId: string) {
    const walk = await this.getWalkerWalkOrThrow(userId, walkId);
    this.assertStatus(walk.status, WalkStatus.CONFIRMED, "marcar en camino");
    this.assertCanMarkOnWay(walk.scheduledAt);

    return this.updateStatus(
      walkId, WalkStatus.WALKER_ON_WAY, { onWayAt: new Date() }, /* isWalkerView */ true,
    );
  }

  // ─── Iniciar paseo (paseador) ────────────────────────────

  async start(userId: string, walkId: string) {
    const walk = await this.getWalkerWalkOrThrow(userId, walkId);
    this.assertStatus(walk.status, WalkStatus.WALKER_ON_WAY, "iniciar");
    this.assertCanStart(walk.scheduledAt);
    // NUNCA se bloquea por tener otro IN_PROGRESS vencido: Güau es un
    // negocio multi-perro, un paseador con tres perros en la mano tiene que
    // poder retirar el cuarto — eso es el producto, no una anomalía. Lo
    // único que gobierna start() es su propia ventana de tiempo.

    const startedAt = new Date();
    // Se calcula una sola vez, acá, y se persiste — no se deriva en lectura
    // como isExpired (ver el comentario en el schema): alimenta la tasa de
    // puntualidad del paseador, que necesita agregarse por SQL sobre muchos
    // paseos sin traer cada fila a memoria.
    const lateThreshold = walk.scheduledAt.getTime() + WALK_TIMING.START_LATE_THRESHOLD_MIN_AFTER * 60_000;
    const startedLate = startedAt.getTime() > lateThreshold;

    return this.updateStatus(
      walkId, WalkStatus.IN_PROGRESS, { startedAt, startedLate }, /* isWalkerView */ true,
    );
  }

  // ─── Finalizar paseo (paseador) ──────────────────────────

  async finish(userId: string, walkId: string) {
    const walk = await this.getWalkerWalkOrThrow(userId, walkId);
    this.assertStatus(walk.status, WalkStatus.IN_PROGRESS, "finalizar");
    this.assertHasStartedAt(walkId, walk.startedAt);
    this.assertCanFinish(walk.startedAt, walk.walkType.durationMinutes);

    const endedAt = new Date();
    const endedLate = this.computeEndedLate(walk.startedAt, walk.walkType.durationMinutes, endedAt);

    return this.updateStatus(
      walkId,
      WalkStatus.COMPLETED,
      { endedAt, endedLate, closedBy: ClosedBy.WALKER },
      /* isWalkerView */ true,
    );
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

    return this.updateStatus(
      walkId,
      targetStatus,
      { cancellationReason: dto.cancellationReason ?? null },
      /* isWalkerView */ role === UserRole.WALKER,
    );
  }

  // ─── Reportar "el paseador no se presentó" (dueño) ───────
  // Primera superficie HTTP nueva del rediseño (bloque B). No mueve plata:
  // registra qué pasó y quién lo declaró. El dinero es del bloque E.

  async reportWalkerNoShow(userId: string, walkId: string) {
    const owner = await this.prisma.ownerProfile.findUnique({
      where: { userId },
      select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } },
    });
    // 404 gate: si no hay OwnerProfile, no hay forma de ser participante de
    // nada. Mismo criterio que el resto del módulo (ver assertWalkAccess).
    if (!owner) throw new ForbiddenException("No tenés acceso a este paseo");

    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        mpPaymentId: true,
        totalAmount: true,
        walker: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
        participants: { select: { ownerId: true, dog: { select: { name: true } } } },
      },
    });
    if (!walk) throw new NotFoundException("Paseo no encontrado");

    // Pertenencia — DENTRO del service, como getWalkerWalkOrThrow del otro
    // lado: que otro dueño no pueda reportar un paseo que no es suyo.
    const participant = walk.participants.find((p) => p.ownerId === owner.id);
    if (!participant) throw new ForbiddenException("No tenés acceso a este paseo");

    if (walk.status !== WalkStatus.CONFIRMED && walk.status !== WalkStatus.WALKER_ON_WAY) {
      throw new BadRequestException(
        `No se puede reportar un paseo en estado "${walk.status}". Se requiere "CONFIRMED" o "WALKER_ON_WAY".`,
      );
    }
    // Desde T+10m, sin vencimiento — ver canReportWalkerNoShow.
    if (!canReportWalkerNoShow(walk.scheduledAt, new Date())) {
      const opensAt = new Date(
        walk.scheduledAt.getTime() + WALK_TIMING.OWNER_NO_SHOW_BUTTON_MIN_AFTER * 60_000,
      );
      throw new BadRequestException(
        `Todavía no podés reportar esto. Vas a poder a partir de las ${toBusinessDayAndTime(opensAt).timeStr}.`,
      );
    }

    const notPerformedAt = new Date();
    const updated = await this.updateStatus(
      walkId,
      WalkStatus.NOT_PERFORMED,
      { notPerformedReason: NotPerformedReason.WALKER_NO_SHOW, notPerformedAt },
      /* isWalkerView */ false,
    );

    const dogName = participant.dog.name;
    void this.notificationsService
      ?.create({
        userId: walk.walker.user.id,
        title: "El dueño reportó que no llegaste al paseo",
        body: `Se marcó como no realizado el paseo${dogName ? ` de ${dogName}` : ""}.`,
        type: NOTIFICATION_TYPES.WALK_WALKER_NO_SHOW_REPORTED,
        data: { walkId },
      })
      .catch((err) => this.logger.warn(`No se pudo notificar el reporte de no-show: ${err}`));

    // Alerta a Joa, misma vía que el job (WalkExpirationService): solo si
    // había plata adentro — un NOT_PERFORMED sin pagar no necesita que
    // nadie intervenga.
    if (isWalkPaid(walk.mpPaymentId)) {
      this.mail?.sendNotPerformedAlert({
        walkId,
        reason: "el dueño reportó que el paseador no se presentó",
        scheduledAt: walk.scheduledAt,
        totalAmount: walk.totalAmount,
        ownerName: `${owner.user.firstName} ${owner.user.lastName}`,
        ownerEmail: owner.user.email,
        walkerName: `${walk.walker.user.firstName} ${walk.walker.user.lastName}`,
      });
    }

    return updated;
  }

  // ─── Confirmar recepción (dueño) ──────────────────────────
  // La llave de escape del bloqueo del punto 4: si al paseador se le apagó
  // el celular, el dueño destraba. El que tiene el perro en la mano es el
  // que puede decir que llegó.

  async confirmReceipt(userId: string, walkId: string) {
    const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!owner) throw new ForbiddenException("No tenés acceso a este paseo");

    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        walkType: { select: { durationMinutes: true } },
        walker: { select: { user: { select: { id: true } } } },
        participants: { select: { ownerId: true } },
      },
    });
    if (!walk) throw new NotFoundException("Paseo no encontrado");

    const isParticipant = walk.participants.some((p) => p.ownerId === owner.id);
    if (!isParticipant) throw new ForbiddenException("No tenés acceso a este paseo");

    this.assertStatus(walk.status, WalkStatus.IN_PROGRESS, "confirmar la recepción de");
    this.assertHasStartedAt(walkId, walk.startedAt);

    const endedAt = new Date();
    const endedLate = this.computeEndedLate(walk.startedAt, walk.walkType.durationMinutes, endedAt);

    const updated = await this.updateStatus(
      walkId,
      WalkStatus.COMPLETED,
      { endedAt, endedLate, closedBy: ClosedBy.OWNER },
      /* isWalkerView */ false,
    );

    // El paseador tiene que enterarse de que esta acción no se puede
    // olvidar — closedBy = OWNER queda en su historial como dato de
    // prolijidad (distinto de la puntualidad, de la misma familia).
    void this.notificationsService
      ?.create({
        userId: walk.walker.user.id,
        title: "El dueño confirmó que recibió a su perro",
        body: "Cerró el paseo por vos. Acordate de finalizarlo la próxima — no se puede olvidar.",
        type: NOTIFICATION_TYPES.WALK_CLOSED_BY_OWNER,
        data: { walkId },
      })
      .catch((err) => this.logger.warn(`No se pudo notificar el cierre por el dueño: ${err}`));

    return updated;
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
      // Techo de seguridad, no paginación: una ruta es un objeto único y
      // media ruta dibuja un mapa engañoso. 5.000 puntos son ~7 horas a una
      // muestra por cada 5 segundos — muy por encima de cualquier paseo
      // real. Si alguna vez se toca este límite, el problema no es la
      // consulta: es la frecuencia de muestreo del cliente.
      take: 5000,
    });
  }

  // ─── Helpers privados ────────────────────────────────────

  private async getWalkerWalkOrThrow(userId: string, walkId: string) {
    const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
    if (!walker) throw new ForbiddenException("Perfil de paseador no encontrado");

    // include walkType: finish() necesita durationMinutes para calcular el
    // fin esperado. confirm/reject/markOnWay/start lo ignoran — es el mismo
    // costo (un join) para los cinco caminos que pasan por acá, a cambio de
    // no duplicar esta consulta.
    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      include: { walkType: true },
    });
    if (!walk) throw new NotFoundException("Paseo no encontrado");
    if (walk.walkerId !== walker.id) {
      throw new ForbiddenException("No tenés acceso a este paseo");
    }

    return walk;
  }

  // ─── Guards de tiempo — el reloj habilita, nunca mueve el estado ────────
  // Las cuatro reglas exactas viven en @guau/shared (canMarkOnWay/canStart/
  // canFinish/expectedEndAt) y las comparte el frontend, para que un botón
  // habilitado del lado del front nunca choque con un 400 acá. El mensaje de
  // error siempre dice CUÁNDO se va a poder, no solo que no se puede — un
  // paseador no tiene forma de adivinar la ventana exacta.

  private assertCanMarkOnWay(scheduledAt: Date) {
    const now = new Date();
    if (canMarkOnWay(scheduledAt, now)) return;

    const availableAt = new Date(scheduledAt.getTime() - WALK_TIMING.ON_WAY_OPENS_MIN_BEFORE * 60_000);
    throw new BadRequestException(
      `Todavía no podés marcar que vas en camino. Vas a poder a partir de las ${toBusinessDayAndTime(availableAt).timeStr}.`,
    );
  }

  // Sin rama de "ya pasó la ventana": canStart no tiene techo superior
  // (evidencia, no candado — ver @guau/shared). Quien llega tarde igual
  // puede iniciar; start() registra la demora en Walk.startedLate.
  private assertCanStart(scheduledAt: Date) {
    const now = new Date();
    if (canStart(scheduledAt, now)) return;

    const opensAt = new Date(scheduledAt.getTime() - WALK_TIMING.START_OPENS_MIN_BEFORE * 60_000);
    throw new BadRequestException(
      `Todavía no podés iniciar el paseo. Vas a poder a partir de las ${toBusinessDayAndTime(opensAt).timeStr}.`,
    );
  }

  private assertCanFinish(startedAt: Date, durationMinutes: number) {
    const now = new Date();
    if (canFinish(startedAt, durationMinutes, now)) return;

    const availableAt = new Date(
      expectedEndAt(startedAt, durationMinutes).getTime() - WALK_TIMING.FINISH_OPENS_MIN_BEFORE_END * 60_000,
    );
    throw new BadRequestException(
      `Todavía no podés finalizar el paseo. Vas a poder a partir de las ${toBusinessDayAndTime(availableAt).timeStr}.`,
    );
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

  // Bloqueo del bloque B: con un IN_PROGRESS VENCIDO (pasó el fin esperado
  // + WALK_TIMING.END_LATE_THRESHOLD_MIN_AFTER — no un IN_PROGRESS abierto
  // y normal, eso es lo esperado en un negocio multi-perro), el paseador no
  // puede aceptar reservas nuevas. Es la ÚNICA acción bloqueada: cerrar
  // cualquier paseo, iniciar otro y marcar "en camino" nunca se frenan —
  // frenarlos convertiría un olvido administrativo en un problema real con
  // animales, o bloquearía justo la acción que resuelve el problema.
  private async assertNoOverdueInProgress(walkerId: string) {
    const inProgress = await this.prisma.walk.findMany({
      where: { walkerId, status: WalkStatus.IN_PROGRESS },
      select: {
        startedAt: true,
        walkType: { select: { durationMinutes: true } },
        participants: { select: { dog: { select: { name: true } } }, take: 1 },
      },
    });

    const now = Date.now();
    const overdue = inProgress.find((w) => {
      if (!w.startedAt) return false;
      const expectedEnd = w.startedAt.getTime() + w.walkType.durationMinutes * 60_000;
      return now >= expectedEnd + WALK_TIMING.END_LATE_THRESHOLD_MIN_AFTER * 60_000;
    });
    if (!overdue) return;

    const dogName = overdue.participants[0]?.dog.name ?? "un perro";
    throw new BadRequestException(
      `Cerrá primero el paseo de ${dogName} antes de aceptar reservas nuevas.`,
    );
  }

  // Mismo guard que ya usaba finish(): en teoría walk.startedAt siempre está
  // seteado en IN_PROGRESS (start() es el único camino hacia ahí y es quien
  // lo escribe), pero este proyecto tiene más de una intervención manual
  // por SQL en producción (ver backlog) — un UPDATE a mano puede dejar un
  // paseo en IN_PROGRESS sin startedAt. Comparte el guard finish() y
  // confirmReceipt(), los dos únicos caminos hacia COMPLETED.
  private assertHasStartedAt(walkId: string, startedAt: Date | null): asserts startedAt is Date {
    if (startedAt) return;
    this.logger.error(
      `walk ${walkId} esta IN_PROGRESS sin startedAt — estado inconsistente, revisar en la base`,
    );
    throw new UnprocessableEntityException(
      "Este paseo no tiene registrado cuando arrancó. No es un problema tuyo — contactanos para resolverlo.",
    );
  }

  // Mismo criterio que startedLate: se persiste, no se deriva (ver el
  // comentario en el schema). Compartido por finish() y confirmReceipt() —
  // los dos caminos a COMPLETED tienen que marcar tardío con la misma regla.
  private computeEndedLate(startedAt: Date, durationMinutes: number, endedAt: Date): boolean {
    const expectedEnd = startedAt.getTime() + durationMinutes * 60_000;
    return endedAt.getTime() > expectedEnd + WALK_TIMING.END_LATE_THRESHOLD_MIN_AFTER * 60_000;
  }

  // isWalkerView SIN default a propósito (regla de oro de CLAUDE.md: un
  // olvido tiene que dejar la puerta cerrada, no abierta). Con un default
  // en `false` o `true` fijo, una transición nueva que se olvide de pasarlo
  // compilaría igual y revelaría (o escondería) la dirección exacta sin que
  // nadie lo note — toPublicWalk ya lo exige obligatorio; esto empareja.
  private async updateStatus(
    walkId: string,
    status: WalkStatus,
    extra: Record<string, unknown> = {},
    isWalkerView: boolean,
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

    return toPublicWalk(updated, isWalkerView, this.pickupZoneSecret);
  }
}
