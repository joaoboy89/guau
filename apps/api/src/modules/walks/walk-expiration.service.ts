import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../database/prisma.service";
import { MailService } from "../../common/services/mail.service";
import { WalkStatus, NotPerformedReason } from "@prisma/client";
import { WALK_TIMING } from "@guau/shared";
import { isWalkPaid } from "./walk-payment.util";

// Ventana 4: mismo techo que reconcilePendingPayments (payments.service.ts).
// Con la cadencia de 15 min, un backlog viejo (ej. la primera corrida en
// staging, que agarra paseos de prueba de julio) se drena solo en vez de
// explotar en una sola pasada.
const BATCH_SIZE = 50;

const MARKING_SELECT = {
  id: true,
  scheduledAt: true,
  mpPaymentId: true,
  totalAmount: true,
  walkType: { select: { durationMinutes: true } },
  walker: { select: { user: { select: { firstName: true, lastName: true } } } },
  participants: {
    select: { owner: { select: { user: { select: { firstName: true, lastName: true, email: true } } } } },
    take: 1,
  },
} as const;

type MarkingCandidate = {
  id: string;
  scheduledAt: Date;
  mpPaymentId: string | null;
  totalAmount: number;
  walkType: { durationMinutes: number };
  walker: { user: { firstName: string; lastName: string } };
  participants: Array<{ owner: { user: { firstName: string; lastName: string; email: string } } }>;
};

const REASON_LABEL: Record<NotPerformedReason, string> = {
  WALKER_NO_SHOW: "el paseador nunca marcó que iba en camino",
  OWNER_NO_SHOW: "el dueño no se presentó",
  NOBODY_ACTED: "ninguna de las dos partes apareció",
  NEVER_CONFIRMED: "el paseo quedó sin confirmar",
};

/**
 * El reloj mueve UN estado en todo el rediseño: acá. `PENDING`/`CONFIRMED`/
 * `WALKER_ON_WAY` colgados dejan de estarlo. La caja (`NOT_PERFORMED`) dice
 * qué pasó; el motivo dice quién falló — y el motivo es el que va a decidir
 * la plata en el bloque E. Acá **no se mueve un peso**: si el paseo quedó
 * pagado, se manda una alerta a Joa por mail y nada más.
 */
@Injectable()
export class WalkExpirationService {
  private readonly logger = new Logger(WalkExpirationService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  @Cron("0 */15 * * * *")
  async markNotPerformed() {
    const now = new Date();

    const neverConfirmed = await this.markNeverConfirmed(now);
    const walkerNoShow = await this.markWalkerNoShow(now);
    const nobodyActed = await this.markNobodyActed(now);

    const total = neverConfirmed + walkerNoShow + nobodyActed;
    this.logger.log(
      `markNotPerformed: ${total} paseos marcados NOT_PERFORMED ` +
        `(never_confirmed=${neverConfirmed} walker_no_show=${walkerNoShow} nobody_acted=${nobodyActed})`,
    );
  }

  // PENDING vencido: nadie confirmó nunca. Nunca tiene plata adentro — pagar
  // requiere CONFIRMED (ver PaymentsService.createPreference) — así que esta
  // rama nunca dispara la alerta, pero igual pasa por el mismo chequeo: es
  // más simple confiar en isWalkPaid que documentar por qué acá siempre da
  // false.
  private async markNeverConfirmed(now: Date): Promise<number> {
    const candidates = await this.prisma.walk.findMany({
      where: { status: WalkStatus.PENDING, scheduledAt: { lte: now } },
      select: MARKING_SELECT,
      orderBy: { scheduledAt: "asc" },
      take: BATCH_SIZE,
    });
    return this.markBatch(candidates, [WalkStatus.PENDING], NotPerformedReason.NEVER_CONFIRMED, now);
  }

  // CONFIRMED que nunca marcó "en camino" y ya pasó T+5m: el silencio del
  // paseador empieza a significar algo en ese instante exacto (mismo T+5m
  // que habilita el botón del dueño y su primer aviso — ver WALK_TIMING).
  private async markWalkerNoShow(now: Date): Promise<number> {
    const threshold = new Date(now.getTime() - WALK_TIMING.WALKER_NO_SHOW_MIN_AFTER * 60_000);
    const candidates = await this.prisma.walk.findMany({
      where: { status: WalkStatus.CONFIRMED, onWayAt: null, scheduledAt: { lte: threshold } },
      select: MARKING_SELECT,
      orderBy: { scheduledAt: "asc" },
      take: BATCH_SIZE,
    });
    return this.markBatch(candidates, [WalkStatus.CONFIRMED], NotPerformedReason.WALKER_NO_SHOW, now);
  }

  // CONFIRMED o WALKER_ON_WAY que ya pasó T + duración del WalkType. La
  // comparación depende de una relación (walkType.durationMinutes), así que
  // no se puede expresar en el WHERE de Prisma: se trae el lote acotado
  // (mismo take que las otras dos ramas) y se filtra en memoria.
  // `orderBy: scheduledAt asc` prioriza siempre lo más vencido primero, así
  // que un backlog grande se drena solo en vez de dejar afuera para siempre
  // a los más viejos con cada corrida.
  private async markNobodyActed(now: Date): Promise<number> {
    const candidates = await this.prisma.walk.findMany({
      where: { status: { in: [WalkStatus.CONFIRMED, WalkStatus.WALKER_ON_WAY] } },
      select: MARKING_SELECT,
      orderBy: { scheduledAt: "asc" },
      take: BATCH_SIZE,
    });
    const overdue = candidates.filter((walk) => {
      const expectedEnd = walk.scheduledAt.getTime() + walk.walkType.durationMinutes * 60_000;
      return now.getTime() >= expectedEnd;
    });
    return this.markBatch(
      overdue,
      [WalkStatus.CONFIRMED, WalkStatus.WALKER_ON_WAY],
      NotPerformedReason.NOBODY_ACTED,
      now,
    );
  }

  // ─── Transición + alerta ─────────────────────────────────────────────────

  private async markBatch(
    candidates: MarkingCandidate[],
    fromStatuses: WalkStatus[],
    reason: NotPerformedReason,
    now: Date,
  ): Promise<number> {
    let marked = 0;
    for (const walk of candidates) {
      // Idempotente por construcción, dos veces: la SELECT de arriba ya solo
      // trae PENDING/CONFIRMED/WALKER_ON_WAY, y este UPDATE vuelve a exigir
      // ese status en el WHERE. Si otra corrida (o la app) ya lo movió entre
      // el select y acá, count da 0 — no es un error, es la idempotencia
      // funcionando.
      const result = await this.prisma.walk.updateMany({
        where: { id: walk.id, status: { in: fromStatuses } },
        data: { status: WalkStatus.NOT_PERFORMED, notPerformedReason: reason, notPerformedAt: now },
      });
      if (result.count === 0) continue;
      marked++;

      if (isWalkPaid(walk.mpPaymentId)) {
        this.alertAdmin(walk, reason);
      }
    }
    return marked;
  }

  private alertAdmin(walk: MarkingCandidate, reason: NotPerformedReason) {
    const owner = walk.participants[0]?.owner.user;
    this.mail.sendNotPerformedAlert({
      walkId: walk.id,
      reason: REASON_LABEL[reason],
      scheduledAt: walk.scheduledAt,
      totalAmount: walk.totalAmount,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}` : "sin dueño registrado",
      ownerEmail: owner?.email ?? "—",
      walkerName: `${walk.walker.user.firstName} ${walk.walker.user.lastName}`,
    });
  }
}
