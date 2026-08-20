import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { WalkStatus } from "@prisma/client";
import { NOTIFICATION_TYPES, NotificationType, WALK_TIMING } from "@guau/shared";

// Ventana 4: techo explicito por pase. Con la cadencia de 5 min, un
// acumulado viejo se drena solo en vez de explotar en una sola corrida.
// 100, no un numero mas grande "por las dudas": con las ventanas de tiempo
// bien acotadas (ver el WHERE de remindOwner mas abajo) la cantidad real de
// candidatos por pase es chica, y 100 es margen tranquilo para eso. Si
// algun dia no alcanzan, la respuesta es paginar, no subir el numero de
// vuelta — un techo mas alto corre el problema para adelante, no lo cierra.
const BATCH_SIZE = 100;

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

  // 5 minutos, y NO es preferencia — no lo "optimices" a algo más gordo sin
  // leer esto primero. Los dos avisos al paseador van a T-1h15 y T-1h10,
  // separados por exactamente 5 minutos: con una cadencia más floja (ej. 15
  // min) una sola corrida los alcanza a los dos juntos y dejan de ser dos
  // avisos distintos — el segundo llega pisando al primero o directamente
  // nunca se distingue de él.
  @Cron("0 */5 * * * *")
  async sendReminders() {
    const now = new Date();

    const onWay1 = await this.remindWalker(now, WALK_TIMING.ONWAY_REMINDER_1_MIN_BEFORE, NOTIFICATION_TYPES.WALK_ONWAY_REMINDER_1);
    const onWay2 = await this.remindWalker(now, WALK_TIMING.ONWAY_REMINDER_2_MIN_BEFORE, NOTIFICATION_TYPES.WALK_ONWAY_REMINDER_2);
    const notStarted1 = await this.remindOwner(now, WALK_TIMING.NOT_STARTED_ALERT_1_MIN_AFTER, NOTIFICATION_TYPES.WALK_NOT_STARTED_ALERT_1);
    const notStarted2 = await this.remindOwner(now, WALK_TIMING.NOT_STARTED_ALERT_2_MIN_AFTER, NOTIFICATION_TYPES.WALK_NOT_STARTED_ALERT_2);
    const close1 = await this.remindClose(
      now, WALK_TIMING.CLOSE_REMINDER_1_MIN_AFTER,
      NOTIFICATION_TYPES.WALK_CLOSE_REMINDER_1_WALKER, NOTIFICATION_TYPES.WALK_CLOSE_REMINDER_1_OWNER,
    );
    const close2 = await this.remindClose(
      now, WALK_TIMING.CLOSE_REMINDER_2_MIN_AFTER,
      NOTIFICATION_TYPES.WALK_CLOSE_REMINDER_2_WALKER, NOTIFICATION_TYPES.WALK_CLOSE_REMINDER_2_OWNER,
    );

    const total = onWay1 + onWay2 + notStarted1 + notStarted2 + close1 + close2;
    if (total > 0) {
      this.logger.log(
        `sendReminders: ${total} recordatorios (paseador T-1h15=${onWay1} T-1h10=${onWay2}, ` +
          `dueño T+5m=${notStarted1} T+10m=${notStarted2}, cierre fin+0=${close1} fin+30m=${close2})`,
      );
    }
  }

  // ─── Al paseador: "voy en camino" nunca apretado ────────────────────────
  // Ventana: paseos que arrancan entre AHORA y los próximos `minutesBefore`
  // minutos — scheduledAt en [now, threshold]. La cota inferior (`gte:
  // now`) es la que faltaba hasta esta versión: el WHERE solo tenía
  // `lte: threshold`, que en los hechos decía "todo paseo anterior a
  // dentro de X minutos" — TODO el pasado incluido, no solo lo que falta
  // por arrancar. Es el bug real que este fix cierra: la primera corrida en
  // producción mandó 9 recordatorios con un solo paseo futuro en la base,
  // todos por paseos CONFIRMED viejos que este `gte` ahora excluye. Un
  // paseo cuyo horario ya pasó no es candidato de este aviso — ese caso lo
  // cubre remindOwner, más abajo. La cota vive entera en el WHERE (no hace
  // falta un filtro en memoria como en remindOwner): no necesita ningún
  // dato extra —a diferencia de la ventana de remindOwner, que depende de
  // la duración del WalkType— así que Prisma la resuelve sola, sin
  // fetchear de más.

  private async remindWalker(now: Date, minutesBefore: number, type: NotificationType): Promise<number> {
    const threshold = new Date(now.getTime() + minutesBefore * 60_000);
    const candidates = await this.prisma.walk.findMany({
      where: { status: WalkStatus.CONFIRMED, onWayAt: null, scheduledAt: { gte: now, lte: threshold } },
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
  // Ventana: paseos CONFIRMED/WALKER_ON_WAY cuyo horario de encuentro
  // (scheduledAt) ya pasó hace entre `minutesAfter` minutos y el piso de
  // abajo. La pregunta de este aviso ("¿todo bien?") es sobre el ENCUENTRO
  // que no pasó a horario — no sobre el paseo que no se hizo — así que el
  // reloj que le corresponde es la hora pactada, nunca la duración del
  // WalkType. Una versión anterior de este método ataba la cota a
  // `scheduledAt + walkType.durationMinutes`, copiando el criterio de
  // WalkExpirationService.isPastExpectedEnd — el reloj equivocado: ese
  // cálculo contesta "¿este paseo ya se puede dar por muerto?", una
  // pregunta distinta con un reloj distinto. Que el paseo dure 30 minutos o
  // 4 horas no cambia en nada cuándo corresponde preguntar si el dueño
  // sigue esperando en la puerta.
  //
  // Cota inferior — la única (ver el comentario de la constante en
  // @guau/shared para el porqué no hace falta un piso genérico aparte):
  // NOT_STARTED_ALERT_STALE_TOLERANCE_MIN, decisión de producto
  // (politicas.md §5) — no manda el aviso si el momento ya pasó hace más de
  // lo que una corrida perdida del cron puede explicar. La pregunta "¿todo
  // bien?" también va a vivir en la pantalla del dueño, así que un ping
  // tardío (job caído que vuelve horas después) no suma, confunde. Al vivir
  // en minutos, esta cota ya deja la ventana de la consulta acotada a
  // minutos — nunca escanea historia vieja de la base.

  private async remindOwner(now: Date, minutesAfter: number, type: NotificationType): Promise<number> {
    const threshold = new Date(now.getTime() - minutesAfter * 60_000);
    const gte = new Date(
      now.getTime() - (minutesAfter + WALK_TIMING.NOT_STARTED_ALERT_STALE_TOLERANCE_MIN) * 60_000,
    );

    const candidates = await this.prisma.walk.findMany({
      where: {
        status: { in: [WalkStatus.CONFIRMED, WalkStatus.WALKER_ON_WAY] },
        scheduledAt: { gte, lte: threshold },
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

  // ─── A las DOS partes: el paseo llegó a su fin esperado y sigue abierto ──
  // Bloque B — "el paseo que arranca y nunca se cierra". Al paseador,
  // "acordate de cerrar"; al dueño, "¿ya te devolvieron a tu perro?" — hoy
  // su pantalla dice "El paseo está en curso" indefinidamente, sin este
  // aviso a las 3 de la mañana su perro sigue figurando paseando. Ningún
  // estado se mueve acá — el bloqueo de aceptar reservas nuevas vive en
  // WalksService.assertNoOverdueInProgress, con el mismo umbral
  // (END_LATE_THRESHOLD_MIN_AFTER) pero disparado desde otro lado.

  private async remindClose(
    now: Date,
    minutesAfterExpectedEnd: number,
    walkerType: NotificationType,
    ownerType: NotificationType,
  ): Promise<number> {
    // IN_PROGRESS implica startedAt <= now por construcción (no se puede
    // iniciar en el futuro) — a diferencia de los otros pases, acá no hace
    // falta un filtro de fecha barato en el WHERE para descartar futuros.
    const candidates = await this.prisma.walk.findMany({
      where: { status: WalkStatus.IN_PROGRESS },
      select: {
        id: true,
        startedAt: true,
        walkType: { select: { durationMinutes: true } },
        walker: { select: { user: { select: { id: true } } } },
        participants: {
          select: { owner: { select: { user: { select: { id: true } } } }, dog: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: { startedAt: "asc" },
      take: BATCH_SIZE,
    });

    const overdue = candidates.filter((walk) => {
      if (!walk.startedAt) return false;
      const expectedEnd = walk.startedAt.getTime() + walk.walkType.durationMinutes * 60_000;
      return now.getTime() >= expectedEnd + minutesAfterExpectedEnd * 60_000;
    });

    // Dos chequeos de idempotencia, no uno: paseador y dueño usan `type`
    // distintos (ver NOTIFICATION_TYPES) — si compartieran uno, la
    // notificación del primero en crearse taparía al segundo.
    const walkerPending = await this.filterAlreadyNotified(walkerType, overdue);
    const ownerPending = await this.filterAlreadyNotified(ownerType, overdue);

    for (const walk of walkerPending) {
      const dogName = walk.participants[0]?.dog.name;
      await this.notifications.create({
        userId: walk.walker.user.id,
        title: "Acordate de cerrar el paseo",
        body: dogName ? `Acordate de cerrar el paseo de ${dogName}.` : "Acordate de cerrar el paseo.",
        type: walkerType,
        data: { walkId: walk.id },
      });
    }

    let ownerSent = 0;
    for (const walk of ownerPending) {
      const ownerId = walk.participants[0]?.owner.user.id;
      if (!ownerId) continue;
      const dogName = walk.participants[0]?.dog.name;
      await this.notifications.create({
        userId: ownerId,
        title: "¿Ya te devolvieron a tu perro?",
        body: dogName ? `¿Ya te devolvieron a ${dogName}?` : "¿Ya te devolvieron a tu perro?",
        type: ownerType,
        data: { walkId: walk.id },
      });
      ownerSent++;
    }

    return walkerPending.length + ownerSent;
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
