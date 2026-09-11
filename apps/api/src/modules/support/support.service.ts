import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { QuerySupportWalksDto } from "./dto/query-support-walks.dto";
import { QuerySupportMessagesDto } from "./dto/query-support-messages.dto";
import { startOfBusinessDay, endOfBusinessDay } from "../../common/utils/schedule-timezone";
import { isWalkPaid } from "../walks/walk-payment.util";

// Logger de módulo, no de instancia: toSupportWalkRow()/toSupportWalk() son
// funciones puras (mismo criterio que toPublicWalk en walks.service.ts) y no
// tienen this.logger de la clase. Un solo logger compartido evita pasarlo
// como parámetro en cada llamada y mantiene las funciones con la firma
// simple que ya tenían.
const logger = new Logger("SupportService");

// "Un paseo tiene un único dueño" es un invariante del modelo (ver el
// comentario de ownerAcknowledgedNoCodeAt en schema.prisma y el de
// walks.service.ts sobre el modo GRUPAL) — un paseo sin participantes no
// es un caso raro, es un dato corrupto: un INSERT a medias, una migración
// fallida, un borrado parcial. Nivel error, no warn: esto no es "ojo con
// esto", es "hay un dato imposible en producción". Se llama una vez por
// cada paseo roto que aparezca — si una búsqueda trae 20, son 20 líneas,
// y eso es correcto: 20 paseos rotos ES la noticia.
function logBrokenOwnerInvariant(walkId: string) {
  logger.error(
    `Paseo ${walkId} sin participantes — rompe el invariante de "un paseo, un dueño". ` +
    "La pantalla abre igual con owner en null para poder investigarlo, pero es un dato " +
    "roto en la base, no un caso valido.",
  );
}

// Lo que trae searchWalks() de la base — una FILA de listado, no el caso
// completo. El detalle está a un clic (getCase()); meter todo acá sería
// traer datos que nadie pidió, en cada fila.
const SEARCH_SELECT = {
  id: true,
  status: true,
  scheduledAt: true,
  walkType: { select: { label: true } },
  walker: { select: { user: { select: { firstName: true } } } },
  participants: {
    select: {
      dog: { select: { name: true } },
      owner: { select: { user: { select: { firstName: true } } } },
    },
  },
} satisfies Prisma.WalkSelect;

type SearchRow = Prisma.WalkGetPayload<{ select: typeof SEARCH_SELECT }>;

// Composición, nunca condicionales (docs/diseños/modulo-soporte.md §5): esta
// es LA vista de soporte, entera. El día que admin necesite más, es OTRA
// función que compone sobre esta (toAdminWalk(w) = { ...toSupportWalk(w),
// mpPaymentId, ... }) — no un `if (role === ADMIN)` adentro de esta.
function toSupportWalkRow(w: SearchRow) {
  // Invariante del modelo: un paseo tiene un único dueño (el "GRUPAL" del
  // Mode es que el paseador lleva varios paseos a la vez, no que un paseo
  // tenga varios dueños — ver el comentario en walks.service.ts). Se
  // guarda igual con optional chaining: esta pantalla es la que alguien
  // usa para investigar justamente un dato roto, así que un paseo sin
  // participantes tiene que poder abrirse, no tirar un 500.
  const first = w.participants[0];
  if (!first) logBrokenOwnerInvariant(w.id);
  return {
    id: w.id,
    status: w.status,
    scheduledAt: w.scheduledAt,
    walkType: { label: w.walkType.label },
    walker: { firstName: w.walker.user.firstName },
    owner: first ? { firstName: first.owner.user.firstName } : null,
    dogs: w.participants.map((p) => ({ name: p.dog.name })),
  };
}

// El caso completo (docs/diseños/modulo-soporte.md §5). Lo que NO está acá,
// a propósito:
//   - mpRefundId, platformFee, commissionRate: son de la vista de admin
//     (otra rebanada) — soporte ve los MONTOS, no los ids de sistema de
//     MercadoPago que solo hacen falta para ejecutar.
//   - locations (GPS): sin techo natural, espera a D2 con paginación propia.
//   - mpAccessToken: NO se saca de la salida, no se trae de la base — ni
//     siquiera está en este select. Si el dato nunca sale de Postgres, no
//     hay forma de que se escape.
//
// mpPaymentId SÍ se trae, pero solo para derivar `estabaPago` — el mismo
// criterio que WalkerProfile.mpAccessToken → `mpConnected` en el perfil del
// paseador: el booleano sale, el id de sistema no. Hallazgo del testeo en
// staging (2026-09-11): "había plata adentro y el paseo no se completó" es
// de las señales más importantes de un caso, y sin este campo era invisible
// para soporte. refundedAt sí se expone directo — no es un id de sistema
// como mpPaymentId/mpRefundId, es una fecha, y con la fecha alcanza.
const CASE_SELECT = {
  id: true,
  status: true,
  mode: true,
  scheduledAt: true,
  createdAt: true,
  onWayAt: true,
  startedAt: true,
  endedAt: true,
  notPerformedAt: true,
  startedLate: true,
  endedLate: true,
  closedBy: true,
  notPerformedReason: true,
  startVerification: true,
  startVerifyReason: true,
  ownerAcknowledgedNoCodeAt: true,
  pickupCode: true,
  pickupCodeAttempts: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  totalAmount: true,
  walkerAmount: true,
  cancellationReason: true,
  mpPaymentId: true,
  refundedAt: true,
  walkType: { select: { label: true, durationMinutes: true } },
  walker: {
    select: {
      id: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
    },
  },
  participants: {
    select: {
      dog: { select: { name: true, size: true } },
      owner: {
        select: {
          id: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        },
      },
    },
  },
} satisfies Prisma.WalkSelect;

type CaseRow = Prisma.WalkGetPayload<{ select: typeof CASE_SELECT }>;

function toSupportWalk(w: CaseRow) {
  const first = w.participants[0];
  if (!first) logBrokenOwnerInvariant(w.id);
  return {
    id: w.id,
    status: w.status,
    mode: w.mode,
    scheduledAt: w.scheduledAt,
    createdAt: w.createdAt,
    onWayAt: w.onWayAt,
    startedAt: w.startedAt,
    endedAt: w.endedAt,
    notPerformedAt: w.notPerformedAt,
    startedLate: w.startedLate,
    endedLate: w.endedLate,
    closedBy: w.closedBy,
    notPerformedReason: w.notPerformedReason,
    startVerification: w.startVerification,
    startVerifyReason: w.startVerifyReason,
    ownerAcknowledgedNoCodeAt: w.ownerAcknowledgedNoCodeAt,
    pickupCode: w.pickupCode,
    pickupCodeAttempts: w.pickupCodeAttempts,
    pickupAddress: w.pickupAddress,
    pickupLat: w.pickupLat,
    pickupLng: w.pickupLng,
    totalAmount: w.totalAmount,
    walkerAmount: w.walkerAmount,
    cancellationReason: w.cancellationReason,
    // Booleano derivado, no el id de sistema — mismo criterio que
    // mpConnected sobre mpAccessToken. w.mpPaymentId no se copia a la
    // salida en ningún otro campo.
    estabaPago: isWalkPaid(w.mpPaymentId),
    refundedAt: w.refundedAt,
    walkType: { label: w.walkType.label, durationMinutes: w.walkType.durationMinutes },
    walker: {
      id: w.walker.id,
      firstName: w.walker.user.firstName,
      lastName: w.walker.user.lastName,
      email: w.walker.user.email,
      phone: w.walker.user.phone,
    },
    owner: first
      ? {
          id: first.owner.id,
          firstName: first.owner.user.firstName,
          lastName: first.owner.user.lastName,
          email: first.owner.user.email,
          phone: first.owner.user.phone,
        }
      : null,
    dogs: w.participants.map((p) => ({ name: p.dog.name, size: p.dog.size })),
  };
}

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  // ─── Búsqueda ─────────────────────────────────────────────
  // Deny-by-default aplicado a una pantalla (docs/diseños/modulo-soporte.md
  // §4): sin ningún filtro, vacío — NUNCA la tabla entera. El corte pasa
  // ANTES de tocar la base, no filtrando un resultado grande después: así
  // no hay forma de que un cambio futuro en el orden del código lo rompa.
  async searchWalks(query: QuerySupportWalksDto) {
    const { idPrefix, email, desde, hasta } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const conditions: Prisma.WalkWhereInput[] = [];

    if (idPrefix) {
      conditions.push({ id: { startsWith: idPrefix } });
    }
    if (email) {
      // Busca en los dos lados: el dueño o el paseador de ESTE paseo.
      conditions.push({
        OR: [
          { walker: { user: { email } } },
          { participants: { some: { owner: { user: { email } } } } },
        ],
      });
    }
    if (desde || hasta) {
      // Días de calendario en hora argentina, no instantes UTC (ver
      // schedule-timezone.ts): new Date("2026-09-10") es medianoche UTC —
      // 21:00 del día anterior en ART — así que "desde = hasta" con esa
      // interpretación buscaba un rango de duración cero y devolvía cero
      // resultados en el caso más común de todos.
      conditions.push({
        scheduledAt: {
          ...(desde ? { gte: startOfBusinessDay(desde) } : {}),
          ...(hasta ? { lte: endOfBusinessDay(hasta) } : {}),
        },
      });
    }

    if (conditions.length === 0) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }

    const where: Prisma.WalkWhereInput = { AND: conditions };
    const skip = (page - 1) * limit;

    const [walks, total] = await Promise.all([
      this.prisma.walk.findMany({
        where,
        select: SEARCH_SELECT,
        orderBy: { scheduledAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.walk.count({ where }),
    ]);

    return {
      data: walks.map(toSupportWalkRow),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── El caso completo ─────────────────────────────────────

  async getCase(walkId: string) {
    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      select: CASE_SELECT,
    });
    if (!walk) throw new NotFoundException("Paseo no encontrado");
    return toSupportWalk(walk);
  }

  // ─── El chat del paseo — estrictamente de lectura ────────
  // NO usa ChatService.getMessages(): ese método hace un updateMany que
  // marca isRead=true en los mensajes que no envió quien consulta
  // (chat.service.ts:107). Si soporte entrara por ahí, marcaría como
  // leídos mensajes que el destinatario real nunca vio — y isRead es
  // evidencia de una disputa ("el dueño lo leyó y no contestó"). Soporte
  // leyendo la conversación no puede alterarla. Ni un updateMany acá.

  async getMessages(
    walkId: string,
    query: QuerySupportMessagesDto,
    requestingUser: { id: string; role: string },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    // Conversation.walkId es @unique (relación 1 a 1) — se entra por
    // walkId, no por conversationId.
    const conversation = await this.prisma.conversation.findUnique({
      where: { walkId },
      select: { id: true },
    });

    // Se registra el ACCESO, no lo leído (§6 del diseño) — que la
    // conversación esté vacía es una propiedad del PASEO, no del acceso.
    // Antes de este fix el log vivía después del return temprano de abajo,
    // así que nunca se emitía cuando el paseo no tenía conversación: hacía
    // imposible distinguir "nunca intentó abrir ese chat" de "lo abrió y
    // estaba vacío" — las dos se veían igual, silencio. Va ANTES de
    // cualquier return, para que se emita siempre que alguien pida la
    // conversación de un paseo. El mensaje sigue sin contenido de mensajes.
    logger.log(
      `[Support] usuario ${requestingUser.id} (${requestingUser.role}) leyo el chat del paseo ${walkId}`,
    );

    // Un PENDING nunca confirmado no tiene conversación (se crea en
    // confirm()) — "no hay chat" es un estado válido, no un error. NUNCA
    // 404 acá.
    //
    // conversationExists: false distingue esto de una conversación real sin
    // mensajes (hallazgo del testeo en staging, 2026-09-11): las dos daban
    // data: [] y el front no podía diferenciarlas — "no llegó a existir el
    // canal" y "existía y nadie escribió" son dos hechos del mundo distintos
    // y una disputa puede depender de cuál de los dos pasó. NO se expone
    // conversation.id: no hace falta para esto, es dato interno.
    if (!conversation) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0, conversationExists: false } };
    }

    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId: conversation.id },
        select: {
          id: true,
          content: true,
          createdAt: true,
          containsContactInfo: true,
          isRead: true,
          sender: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
        skip,
        take: limit,
      }),
      this.prisma.message.count({ where: { conversationId: conversation.id } }),
    ]);

    return {
      data: messages,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit), conversationExists: true },
    };
  }
}
