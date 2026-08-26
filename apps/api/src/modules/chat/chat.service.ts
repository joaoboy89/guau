import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { SendMessageDto } from "./dto/send-message.dto";
import { CONTACT_PATTERNS } from "@guau/shared";
import { UserRole } from "@prisma/client";

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
    // ninguno. take: 50 es backstop, no paginación real: nadie tiene 50
    // conversaciones simultáneas con paseos suyos.
    const take = 50;

    if (role === UserRole.WALKER) {
      const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
      if (!walker) throw new NotFoundException("Perfil de paseador no encontrado");

      return this.prisma.conversation.findMany({
        where: { walkerId: walker.id },
        include: this.conversationInclude(),
        orderBy: { createdAt: "desc" },
        take,
      });
    }

    const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!owner) throw new NotFoundException("Perfil de dueño no encontrado");

    return this.prisma.conversation.findMany({
      where: { ownerId: owner.id },
      include: this.conversationInclude(),
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  // ─── Mensajes de una conversación ───────────────────────

  async getMessages(userId: string, role: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
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

    // Detectar información de contacto (anti-fuga off-platform)
    const containsContactInfo = CONTACT_PATTERNS.some((pattern) =>
      pattern.test(dto.content)
    );

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
    conversation: { ownerId: string; walkerId: string },
  ) {
    if (role === UserRole.WALKER) {
      const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
      if (!walker || conversation.walkerId !== walker.id) {
        throw new ForbiddenException("No tenés acceso a esta conversación");
      }
      return;
    }

    const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!owner || conversation.ownerId !== owner.id) {
      throw new ForbiddenException("No tenés acceso a esta conversación");
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
