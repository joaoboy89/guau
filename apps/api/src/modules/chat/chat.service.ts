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
    if (role === UserRole.WALKER) {
      const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
      if (!walker) throw new NotFoundException("Perfil de paseador no encontrado");

      return this.prisma.conversation.findMany({
        where: { walkerId: walker.id },
        include: this.conversationInclude(),
        orderBy: { createdAt: "desc" },
      });
    }

    const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!owner) throw new NotFoundException("Perfil de dueño no encontrado");

    return this.prisma.conversation.findMany({
      where: { ownerId: owner.id },
      include: this.conversationInclude(),
      orderBy: { createdAt: "desc" },
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

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });
  }

  // ─── Enviar mensaje ──────────────────────────────────────

  async sendMessage(userId: string, role: string, conversationId: string, dto: SendMessageDto) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        owner: { include: { user: { select: { id: true } } } },
        walker: { include: { user: { select: { id: true } } } },
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
      owner: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      },
      walker: {
        select: {
          id: true,
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
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
