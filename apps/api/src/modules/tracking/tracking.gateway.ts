import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Server, Socket } from "socket.io";
import { WalkStatus } from "@prisma/client";
import { TrackingService } from "./tracking.service";
import { SOCKET_EVENTS } from "@guau/shared";

interface SocketUser {
  userId: string;
  role: string;
}

// Extiende el tipo para guardar datos del usuario en el socket
interface AuthSocket extends Socket {
  data: SocketUser;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  },
  transports: ["websocket", "polling"],
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TrackingGateway.name);

  constructor(
    private tracking: TrackingService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  // ─── Conexión ────────────────────────────────────────────

  async handleConnection(client: AuthSocket) {
    try {
      const raw = client.handshake.auth?.token as string | undefined;
      const token = raw?.startsWith("Bearer ") ? raw.slice(7) : raw;

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwt.verify<{ sub: string; role: string }>(token, {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
      });

      client.data = { userId: payload.sub, role: payload.role };
      this.logger.log(`Conectado: ${client.id} (user ${payload.sub})`);
    } catch {
      this.logger.warn(`Conexión rechazada: ${client.id} — token inválido`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthSocket) {
    this.logger.log(`Desconectado: ${client.id}`);
  }

  // ─── Unirse a sala de un paseo ───────────────────────────

  @SubscribeMessage(SOCKET_EVENTS.WALK_JOIN)
  async handleJoin(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { walkId: string },
  ) {
    const { walkId } = data;
    const { userId, role } = client.data;

    // Verificar que el usuario tiene acceso a este paseo
    const hasAccess =
      role === "WALKER"
        ? await this.tracking.isWalkerOfWalk(userId, walkId)
        : await this.tracking.isParticipantOfWalk(userId, walkId);

    if (!hasAccess) {
      throw new WsException("No tenés acceso a este paseo");
    }

    const room = `walk:${walkId}`;
    await client.join(room);
    this.logger.log(`Socket ${client.id} se unió a sala ${room}`);

    return { event: "joined", data: { walkId, room } };
  }

  // ─── Paseador envía ubicación ────────────────────────────

  @SubscribeMessage(SOCKET_EVENTS.WALK_LOCATION)
  async handleLocation(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { walkId: string; lat: number; lng: number },
  ) {
    const { walkId, lat, lng } = data;
    const { userId, role } = client.data;

    // Solo el paseador puede enviar ubicaciones
    if (role !== "WALKER") {
      throw new WsException("Solo el paseador puede enviar ubicaciones");
    }

    const isWalker = await this.tracking.isWalkerOfWalk(userId, walkId);
    if (!isWalker) {
      throw new WsException("No sos el paseador de este paseo");
    }

    // El paseo debe estar en curso
    const walk = await this.tracking.getWalkStatus(walkId);
    if (walk?.status !== WalkStatus.IN_PROGRESS) {
      throw new WsException("Solo se puede enviar ubicación durante un paseo activo");
    }

    // Guardar en DB
    const location = await this.tracking.saveLocation(walkId, lat, lng);

    // Broadcast a todos los que están en la sala (dueños + paseador)
    this.server
      .to(`walk:${walkId}`)
      .emit(SOCKET_EVENTS.WALK_LOCATION_UPDATE, { walkId, ...location });

    return { event: "location:saved", data: location };
  }

  // ─── Salir de sala ───────────────────────────────────────

  @SubscribeMessage(SOCKET_EVENTS.WALK_LEAVE)
  async handleLeave(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { walkId: string },
  ) {
    const room = `walk:${data.walkId}`;
    await client.leave(room);
    this.logger.log(`Socket ${client.id} salió de sala ${room}`);
    return { event: "left", data: { walkId: data.walkId } };
  }

  // ─── Emitir cambio de estado (llamado desde WalksService) ─

  emitStatusChanged(walkId: string, status: string) {
    this.server
      .to(`walk:${walkId}`)
      .emit(SOCKET_EVENTS.WALK_STATUS_CHANGED, { walkId, status });
  }

  // ─── Emitir notificación a un usuario ───────────────────
  // Los clientes se suscriben a una sala personal "user:{userId}" al conectarse.

  emitNotification(userId: string, notification: unknown) {
    this.server
      .to(`user:${userId}`)
      .emit(SOCKET_EVENTS.NOTIFICATION_NEW, notification);
  }

  // ─── Sala personal por usuario (para notificaciones) ────

  @SubscribeMessage("user:join")
  async handleUserRoom(@ConnectedSocket() client: AuthSocket) {
    const room = `user:${client.data.userId}`;
    await client.join(room);
    return { event: "user:joined", data: { room } };
  }
}
