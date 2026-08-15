import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { WalkStatus } from "@prisma/client";
import { NOTIFICATION_TYPES, NotificationType, WALK_TIMING } from "@guau/shared";

// Ventana 4: techo explicito por pase. Con la cadencia de 5 min, un
// acumulado viejo se drena solo en vez de explotar en una sola corrida.
const BATCH_SIZE = 50;

/**
 * Dos avisos por destinatario, cada uno UNA vez: al paseador antes de que
 * tenga que salir, al dueño cuando el paseo debería haber arrancado y no lo
 * hizo. Ningún estado se mueve acá — eso es trabajo de WalkExpirationService.
 * Este servicio solo recuerda.
 *
 * Idempotencia sin columnas nuevas: antes de crear una notificación se
 * busca si ya existe una de ese `type` para ese `walkId` en `Notification`
 * (que ya guarda `type` y `data: { walkId }`). El registro de "ya avisé"
 * vive donde vive el aviso — agregar un `reminderSentAt` hubiera duplicado
 * esa información en dos lugares que se pueden desincronizar.
 */
@Injectable()
export class WalkRemindersService {
  private readonly logger = new Logger(WalkRemindersService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // T-1h15 y T-1h10 están a 5 min uno del otro — una cadencia más floja los
  // mezclaría en la misma corrida y perderían sentido como dos avisos
  // distintos.
  @Cron("0 */5 * * * *")
  async sendReminders() {
    const now = new Date();

    const onWay1 = await this.remindWalker(now, WALK_TIMING.ONWAY_REMINDER_1_MIN_BEFORE, NOTIFICATION_TYPES.WALK_ONWAY_REMINDER_1);
    const onWay2 = await this.remindWalker(now, WALK_TIMING.ONWAY_REMINDER_2_MIN_BEFORE, NOTIFICATION_TYPES.WALK_ONWAY_REMINDER_2);
    const notStarted1 = await this.remindOwner(now, WALK_TIMING.WALKER_NO_SHOW_MIN_AFTER, NOTIFICATION_TYPES.WALK_NOT_STARTED_ALERT_1);
    const notStarted2 = await this.remindOwner(now, WALK_TIMING.NOT_STARTED_ALERT_2_MIN_AFTER, NOTIFICATION_TYPES.WALK_NOT_STARTED_ALERT_2);

    const total = onWay1 + onWay2 + notStarted1 + notStarted2;
    if (total > 0) {
      this.logger.log(
        `sendReminders: ${total} recordatorios (paseador T-1h15=${onWay1} T-1h10=${onWay2}, dueño T+5m=${notStarted1} T+15m=${notStarted2})`,
      );
    }
  }

  // ─── Al paseador: "voy en camino" nunca apretado ────────────────────────

  private async remindWalker(now: Date, minutesBefore: number, type: NotificationType): Promise<number> {
    const threshold = new Date(now.getTime() + minutesBefore * 60_000);
    const candidates = await this.prisma.walk.findMany({
      where: { status: WalkStatus.CONFIRMED, onWayAt: null, scheduledAt: { lte: threshold } },
      select: {
        id: true,
        scheduledAt: true,
        walkType: { select: { label: true } },
        walker: { select: { user: { select: { id: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
      take: BATCH_SIZE,
    });

    const pending = await this.filterAlreadyNotified(type, candidates);

    for (const walk of pending) {
      const dateStr = this.formatBA(walk.scheduledAt);
      await this.notifications.create({
        userId: walk.walker.user.id,
        title: "Recordatorio: tu paseo se acerca 🐕",
        body: `${walk.walkType.label} a las ${dateStr}. Marcá "Voy en camino" cuando salgas.`,
        type,
        data: { walkId: walk.id },
      });
    }
    return pending.length;
  }

  // ─── Al dueño: el paseo no llegó a IN_PROGRESS ──────────────────────────

  private async remindOwner(now: Date, minutesAfter: number, type: NotificationType): Promise<number> {
    const threshold = new Date(now.getTime() - minutesAfter * 60_000);
    const candidates = await this.prisma.walk.findMany({
      where: {
        status: { in: [WalkStatus.CONFIRMED, WalkStatus.WALKER_ON_WAY] },
        scheduledAt: { lte: threshold },
      },
      select: {
        id: true,
        participants: { select: { owner: { select: { user: { select: { id: true } } } } }, take: 1 },
      },
      orderBy: { scheduledAt: "asc" },
      take: BATCH_SIZE,
    });

    const pending = await this.filterAlreadyNotified(type, candidates);

    let sent = 0;
    for (const walk of pending) {
      const ownerId = walk.participants[0]?.owner.user.id;
      if (!ownerId) continue;
      await this.notifications.create({
        userId: ownerId,
        title: "¿Todo bien con el paseo?",
        body: "Todavía no se inició el paseo, ¿todo bien?",
        type,
        data: { walkId: walk.id },
      });
      sent++;
    }
    return sent;
  }

  // ─── Idempotencia ────────────────────────────────────────────────────────
  // Una sola query con OR de hasta BATCH_SIZE condiciones, no una query por
  // candidato: con 4 pases por corrida, N+1 acá sería hasta 200 queries
  // extra cada 5 minutos por algo que un solo IN/OR resuelve en una.

  private async filterAlreadyNotified<T extends { id: string }>(
    type: NotificationType,
    candidates: T[],
  ): Promise<T[]> {
    if (candidates.length === 0) return [];

    const existing = await this.prisma.notification.findMany({
      where: {
        type,
        OR: candidates.map((c) => ({ data: { path: ["walkId"], equals: c.id } })),
      },
      select: { data: true },
    });
    const alreadyNotified = new Set(
      existing
        .map((n) => (n.data as { walkId?: string } | null)?.walkId)
        .filter((id): id is string => typeof id === "string"),
    );

    return candidates.filter((c) => !alreadyNotified.has(c.id));
  }

  private formatBA(date: Date): string {
    return date.toLocaleString("es-AR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    });
  }
}
