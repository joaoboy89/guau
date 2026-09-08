import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { WalkStatus, Prisma } from "@prisma/client";
import { NOTIFICATION_TYPES, NotificationType, formatDogsLabel } from "@guau/shared";

interface CreateNotificationData {
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  data?: Record<string, unknown>;
}

// Mensajes por estado — quién recibe y qué dice
const WALK_STATUS_MESSAGES: Partial<Record<
  WalkStatus,
  { forOwner?: { title: string; body: string }; forWalker?: { title: string; body: string } }
>> = {
  [WalkStatus.CONFIRMED]: {
    forOwner: {
      title: "¡Paseo confirmado! 🐾",
      body: "El paseador aceptó tu reserva. ¡Ya está todo listo!",
    },
  },
  [WalkStatus.CANCELLED_WALKER]: {
    forOwner: {
      title: "Paseo cancelado",
      // No prometer un reembolso automático que no existe: el refund es
      // POST /admin/walks/:id/refund, manual y solo ADMIN. Este mensaje ya
      // se manda hoy (reject() también transiciona acá), así que dueños de
      // paseos que nunca pagaron estaban recibiendo la promesa de una
      // devolución que no iba a llegar sola.
      body: "El paseador canceló el paseo. Podés reservar con otro paseador cuando quieras.",
    },
  },
  [WalkStatus.CANCELLED_OWNER]: {
    forWalker: {
      title: "Paseo cancelado por el dueño",
      body: "El dueño canceló el paseo.",
    },
  },
  [WalkStatus.WALKER_ON_WAY]: {
    forOwner: {
      title: "¡El paseador está en camino! 🚶",
      body: "Ya salió a buscar a tu perro. Podés ver su ubicación en tiempo real.",
    },
  },
  [WalkStatus.IN_PROGRESS]: {
    forOwner: {
      title: "¡El paseo comenzó! 🐕",
      body: "Tu perro está de paseo. Seguí la ruta en vivo desde la app.",
    },
  },
  [WalkStatus.COMPLETED]: {
    forOwner: {
      title: "Paseo finalizado 🎉",
      body: "¡Tu perro volvió a casa! No olvides calificar al paseador.",
    },
    forWalker: {
      title: "Paseo finalizado 🎉",
      body: "¡Excelente trabajo! Los dueños podrán calificarte en las próximas horas.",
    },
  },
};

const STATUS_TO_TYPE: Partial<Record<WalkStatus, NotificationType>> = {
  [WalkStatus.CONFIRMED]:         NOTIFICATION_TYPES.WALK_CONFIRMED,
  [WalkStatus.CANCELLED_WALKER]:  NOTIFICATION_TYPES.WALK_CANCELLED_WALKER,
  [WalkStatus.CANCELLED_OWNER]:   NOTIFICATION_TYPES.WALK_CANCELLED_OWNER,
  [WalkStatus.WALKER_ON_WAY]:     NOTIFICATION_TYPES.WALK_WALKER_ON_WAY,
  [WalkStatus.IN_PROGRESS]:       NOTIFICATION_TYPES.WALK_IN_PROGRESS,
  [WalkStatus.COMPLETED]:         NOTIFICATION_TYPES.WALK_COMPLETED,
};

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
  ) {}

  // ─── Mis notificaciones ──────────────────────────────────

  // Lista blanca explicita (Ventana #2 de CLAUDE.md): un findMany sin select
  // es una blacklist implicita — la columna que alguien agregue mañana (un
  // internalNote de admin, un deviceToken) empieza a viajar al navegador de
  // todos los usuarios en el mismo deploy que la crea, sin que nadie lo
  // decida. Las ocho de aca son las columnas reales de Notification hoy
  // (schema.prisma:382-392) — no se achica a lo que el front usa hoy
  // (lib/store.ts declara seis) porque esa es una decision de producto
  // aparte, no un detalle de esta poda (decision de Joa, 2026-08-24).
  async getMyNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      select: {
        id:        true,
        userId:    true,
        title:     true,
        body:      true,
        type:      true,
        data:      true,
        isRead:    true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  // ─── Marcar como leída ───────────────────────────────────

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) throw new NotFoundException("Notificación no encontrada");
    if (notification.userId !== userId) {
      throw new ForbiddenException("No tenés acceso a esta notificación");
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  // ─── Crear notificación (uso interno) ───────────────────

  async create(data: CreateNotificationData) {
    const notification = await this.prisma.notification.create({
      data: {
        userId:  data.userId,
        title:   data.title,
        body:    data.body,
        type:    data.type,
        data:    (data.data ?? {}) as Prisma.InputJsonValue,
      },
    });

    // Emitir via Socket.io a la sala personal del usuario
    this.trackingGateway.emitNotification(data.userId, notification);

    return notification;
  }

  // ─── Notificar nueva solicitud de paseo ──────────────────
  // Llamado desde WalksService.create() tras commitear la transacción.
  // La notificación de mayor valor del negocio: cuanto más rápido responde
  // el paseador, menos probable que el dueño se vaya a otro lado.

  async notifyNewWalkRequest(walkId: string) {
    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      select: {
        scheduledAt: true,
        walkType: { select: { label: true } },
        walker: { select: { user: { select: { id: true } } } },
      },
    });
    if (!walk) return;

    const dateStr = walk.scheduledAt.toLocaleString("es-AR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    });

    await this.create({
      userId: walk.walker.user.id,
      title:  "¡Nueva solicitud de paseo! 🐾",
      body:   `${walk.walkType.label} — ${dateStr}. Respondé pronto para no perder la reserva.`,
      type:   NOTIFICATION_TYPES.WALK_REQUESTED,
      data:   { walkId },
    });
  }

  // ─── Notificar cambio de estado de un paseo ─────────────
  // Llamado desde WalksService tras cada transición.

  async notifyWalkStatusChange(walkId: string, status: WalkStatus) {
    const messages = WALK_STATUS_MESSAGES[status];
    const type = STATUS_TO_TYPE[status];
    if (!messages || !type) return;

    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      include: {
        walker: { include: { user: { select: { id: true } } } },
        participants: {
          include: { owner: { include: { user: { select: { id: true } } } } },
          distinct: ["ownerId"],
        },
      },
    });
    if (!walk) return;

    const notificationData = { walkId };
    const promises: Promise<unknown>[] = [];

    // Notificar a todos los dueños participantes
    if (messages.forOwner) {
      for (const participant of walk.participants) {
        promises.push(
          this.create({
            userId: participant.owner.user.id,
            title:  messages.forOwner.title,
            body:   messages.forOwner.body,
            type,
            data:   notificationData,
          })
        );
      }
    }

    // Notificar al paseador
    if (messages.forWalker) {
      promises.push(
        this.create({
          userId: walk.walker.user.id,
          title:  messages.forWalker.title,
          body:   messages.forWalker.body,
          type,
          data:   notificationData,
        })
      );
    }

    await Promise.all(promises);
  }

  // ─── Cierre del bloque D1 — avisos al dueño ─────────────
  // Un paseo tiene UN solo dueño (el "grupal" del Mode es que el paseador
  // lleva varios paseos a la vez, no que un paseo tenga varios dueños — ver
  // el comentario del punto 0 en walks.service.ts). Las dos notificaciones
  // de acá son UNA por paseo, nunca una por perro: se lee el owner de
  // cualquiera de los participantes (todos comparten el mismo) y se junta
  // el nombre de los perros para el texto.

  private async loadOwnerAndDogs(walkId: string) {
    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      select: {
        participants: {
          select: {
            owner: { select: { user: { select: { id: true } } } },
            dog: { select: { name: true } },
          },
        },
      },
    });
    if (!walk || walk.participants.length === 0) return null;

    return {
      ownerUserId: walk.participants[0].owner.user.id,
      dogsLabel: formatDogsLabel(walk.participants.map((p) => p.dog.name)),
    };
  }

  // Dispara UNA sola vez por paseo: el llamador (verifyPickupCode, en
  // walks.service.ts) solo la invoca en el momento exacto en que el
  // contador de intentos cruza el tope, no en cada intento posterior ya
  // bloqueado — así que no hace falta un guard de idempotencia acá.
  //
  // El mensaje no acusa a nadie ni menciona un número de intentos (CLAUDE.md
  // + decisión de Joa): la causa más común es que el dueño pasó mal el
  // código, y un número escrito a mano miente el día que PICKUP_CODE.
  // MAX_ATTEMPTS cambie.
  async notifyPickupCodeExhausted(walkId: string) {
    const info = await this.loadOwnerAndDogs(walkId);
    if (!info) return;

    await this.create({
      userId: info.ownerUserId,
      title:  "No se pudo validar el código",
      body:   "El paseador probó demasiadas veces el código sin acertar. Lo más común es que se " +
              "haya pasado mal — confirmáselo por otro medio, o dejalo iniciar el paseo sin código.",
      type:   NOTIFICATION_TYPES.WALK_PICKUP_CODE_EXHAUSTED,
      data:   { walkId },
    });
  }

  // Dispara desde start(), solo cuando startVerification resuelve NONE. Esta
  // es la notificación que el cartel del dashboard (dueño) usa como fuente
  // de "hay algo pendiente de responder" — igual el cartel no lee esta
  // notificación en sí, lee GET /walks/pending-questions (whitelist propia)
  // para no depender del historial de notificaciones ya leídas/borradas.
  async notifyStartedWithoutCode(walkId: string, startVerifyReason: string) {
    const info = await this.loadOwnerAndDogs(walkId);
    if (!info) return;

    await this.create({
      userId: info.ownerUserId,
      title:  "El paseo empezó sin código",
      body:   `El paseador inició el paseo de ${info.dogsLabel} sin validar el código. Declaró: ` +
              `"${startVerifyReason}". Entrá para confirmar que está todo bien.`,
      type:   NOTIFICATION_TYPES.WALK_STARTED_NO_CODE,
      data:   { walkId },
    });
  }
}
