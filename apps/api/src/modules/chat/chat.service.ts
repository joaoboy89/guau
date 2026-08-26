import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { SendMessageDto } from "./dto/send-message.dto";
import { hasBlockingContactInfo, hasContactChannelMention } from "@guau/shared";
import { UserRole, WalkStatus } from "@prisma/client";

// El chat vive mientras el paseo está abierto (decisión de Joa, guau-
// politicas.md): "es evidencia para Güau, no para que las partes litiguen
// entre sí". Un paseo en estos cuatro estados ya llegó a su desenlace —
// dueño y paseador dejan de ver y de poder escribir; soporte (ADMIN) sigue
// viendo siempre, entra por el id del paseo.
const CLOSED_WALK_STATUSES: WalkStatus[] = [
  WalkStatus.COMPLETED,
  WalkStatus.CANCELLED_OWNER,
  WalkStatus.CANCELLED_WALKER,
  WalkStatus.NOT_PERFORMED,
];

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
  ) {}

  // ─── Crear conversación al confirmar un paseo ────────────
  // Llamado desde WalksService.confirm(). Usa upsert para ser idempotente.

  async ensureConversationForWalk(walkId: string) {
    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      include: {
        participants: { take: 1, orderBy: { joinedAt: "asc" } },
      },
    });

    if (!walk || walk.participants.length === 0) return null;

    return this.prisma.conversation.upsert({
      where: { walkId },
      update: {},
      create: {
        walkId,
        ownerId: walk.participants[0].ownerId,
        walkerId: walk.walkerId,
      },
    });
  }

  // ─── Mis conversaciones ──────────────────────────────────

  async getMyConversations(userId: string, role: string) {
    // Toda lista lleva LIMIT, sin excepción (CLAUDE.md) — esta no tenía
    // ninguno. take: 50 es backstop, no paginación real: con el filtro de
    // abajo (paseo abierto) esto no pasa de 10-15 en la práctica.
    const take = 50;
    // "No ven" (decisión de Joa, guau-politicas.md): un paseo cerrado sale
    // de la lista, no solo del acceso a los mensajes — filtrado acá en la
    // query, nunca después en memoria.
    const walkOpenFilter = { walk: { status: { notIn: CLOSED_WALK_STATUSES } } };

    if (role === UserRole.WALKER) {
      const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
      if (!walker) throw new NotFoundException("Perfil de paseador no encontrado");

      return this.prisma.conversation.findMany({
        where: { walkerId: walker.id, ...walkOpenFilter },
        include: this.conversationInclude(),
        orderBy: { createdAt: "desc" },
        take,
      });
    }

    const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!owner) throw new NotFoundException("Perfil de dueño no encontrado");

    return this.prisma.conversation.findMany({
      where: { ownerId: owner.id, ...walkOpenFilter },
      include: this.conversationInclude(),
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  // ─── Mensajes de una conversación ───────────────────────

  async getMessages(userId: string, role: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        ownerId: true,
        walkerId: true,
        walk: { select: { status: true } },
      },
    });
    if (!conversation) throw new NotFoundException("Conversación no encontrada");

    await this.assertConversationAccess(userId, role, conversation);

    // Marcar como leídos los mensajes que NO envió este usuario
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    });

    // Backstop, no paginación: una conversación real son 20-50 mensajes en
    // 4-5 horas. 200 no lo toca nunca un uso honesto — si algún día se
    // toca, esa misma señal es la que dice que hace falta paginar de verdad
    // (con cursor, no con esto agrandado a mano).
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
      take: 200,
    });
  }

  // ─── Enviar mensaje ──────────────────────────────────────

  async sendMessage(userId: string, role: string, conversationId: string, dto: SendMessageDto) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        ownerId: true,
        walkerId: true,
        walk: { select: { status: true } },
        // select, no include (Ventana #2: un include es un spread con otro
        // nombre) — acá solo hace falta el id del User de cada lado para
        // decidir a quién avisar por socket, nada de OwnerProfile ni
        // WalkerProfile completos.
        owner: { select: { user: { select: { id: true } } } },
        walker: { select: { user: { select: { id: true } } } },
      },
    });
    if (!conversation) throw new NotFoundException("Conversación no encontrada");

    await this.assertConversationAccess(userId, role, conversation);

    // Nivel 1 — dato de contacto real: bloquea. La API es la defensa real,
    // no el front (regla 7 de CLAUDE.md) — si el front avisa y acá se
    // aceptara igual, el bloqueo sería cosmético.
    if (hasBlockingContactInfo(dto.content)) {
      throw new BadRequestException(
        "Este mensaje no se pudo enviar: parece tener un dato de contacto (teléfono, mail, " +
        "usuario o link). Sacalo y reescribilo — el chat es para coordinar el paseo.",
      );
    }

    // Nivel 2 — mención de un canal sin ningún dato (si hubiera un dato,
    // nivel 1 ya bloqueó arriba). No bloquea, solo se registra.
    const containsContactInfo = hasContactChannelMention(dto.content);

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        content: dto.content,
        containsContactInfo,
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });

    // Determinar el ID del destinatario y emitirle el mensaje via Socket.io
    const recipientUserId =
      userId === conversation.owner.user.id
        ? conversation.walker.user.id
        : conversation.owner.user.id;

    this.trackingGateway.emitMessage(recipientUserId, {
      conversationId,
      message,
    });

    return message;
  }

  // ─── Helpers privados ────────────────────────────────────

  private async assertConversationAccess(
    userId: string,
    role: string,
    conversation: { ownerId: string; walkerId: string; walk: { status: WalkStatus } | null },
  ) {
    // El chat es evidencia para Güau, no para que las partes litiguen entre
    // sí (decisión de Joa) — soporte entra siempre, sea cual sea el estado
    // del paseo. Antes que el chequeo de pertenencia: un admin no es dueño
    // ni paseador de nada.
    if (role === UserRole.ADMIN) return;

    if (role === UserRole.WALKER) {
      const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
      if (!walker || conversation.walkerId !== walker.id) {
        throw new ForbiddenException("No tenés acceso a esta conversación");
      }
    } else {
      const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
      if (!owner || conversation.ownerId !== owner.id) {
        throw new ForbiddenException("No tenés acceso a esta conversación");
      }
    }

    // El chat vive mientras el paseo está abierto. Falla cerrado: sin paseo
    // del que leer el estado (Conversation.walkId es opcional en el schema,
    // aunque hoy siempre venga de uno), no se abre.
    //
    // Mismo CÓDIGO 403 que la falta de pertenencia de arriba (nunca un 404
    // aparte para "cerrado"), pero acá sí con un mensaje específico — y no
    // es una inconsistencia: a este punto SOLO llega alguien que ya
    // demostró ser dueño o paseador de esta conversación puntual (si no lo
    // fuera, ya cortó arriba con el mensaje genérico). No hay nada que
    // ocultarle a quien ya sabía que este paseo existía y era suyo; lo que
    // hay que evitar es que el CÓDIGO de respuesta le sirva de oráculo a
    // alguien que NO es parte — y para esos, este bloque nunca se alcanza.
    if (!conversation.walk || CLOSED_WALK_STATUSES.includes(conversation.walk.status)) {
      throw new ForbiddenException("Este paseo ya cerró — el chat no está disponible.");
    }
  }

  private conversationInclude() {
    return {
      walk: { select: { id: true, status: true, scheduledAt: true } },
      // select explícito en los dos lados, simétrico — Ventana #2: un
      // include es un spread con otro nombre. OwnerProfile tiene address/
      // neighborhood/lat/lng; un include acá se los mandaba al paseador
      // completos desde el momento en que confirma() crea la conversación,
      // días antes del paseo — se saltea entera la ofuscación del bloque B
      // sin apretar ningún botón. Solo lo que la pantalla necesita: el id
      // del perfil, nombre y avatar. Ni apellido, ni teléfono, ni nada más
      // de OwnerProfile.
      owner: {
        select: {
          id: true,
          user: { select: { firstName: true, avatarUrl: true } },
        },
      },
      walker: {
        select: {
          id: true,
          user: { select: { firstName: true, avatarUrl: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" as const },
        take: 1,
        select: { content: true, createdAt: true, isRead: true, senderId: true },
      },
    };
  }
}
