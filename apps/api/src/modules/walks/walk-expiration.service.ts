import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../database/prisma.service";
import { MailService } from "../../common/services/mail.service";
import { WalkStatus, NotPerformedReason } from "@prisma/client";
import { isWalkPaid } from "./walk-payment.util";

// Ventana 4: mismo techo que reconcilePendingPayments (payments.service.ts).
// Con la cadencia de 5 min, un backlog viejo (ej. la primera corrida en
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
  ON_WAY_NEVER_STARTED: "el paseador marcó que iba en camino y después no inició el paseo",
  OWNER_NO_SHOW: "el dueño no se presentó",
  NOBODY_ACTED: "estado sin mapear — revisar a mano (ver comentario en el schema)",
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

  // Antes cada 15 min (heredado del bloque C original). Sube a 5 min: el
  // criterio "cada hora alcanza" (backlog, sesión 8g) valía cuando este job
  // solo marcaba internamente y alertaba a Joa. En cuanto un NOT_PERFORMED
  // empiece a traer aparejado un aviso al dueño de que le van a devolver la
  // plata (bloque E), eso pasa a ser cara al usuario — y una hora (o quince
  // minutos de más) de espera para algo así no corresponde.
  @Cron("0 */5 * * * *")
  async markNotPerformed() {
    const now = new Date();

    const neverConfirmed = await this.markNeverConfirmed(now);
    const walkerNoShow = await this.markWalkerNoShow(now);
    const onWayNeverStarted = await this.markOnWayNeverStarted(now);
    const canary = await this.markCanary(now);

    const total = neverConfirmed + walkerNoShow + onWayNeverStarted + canary;
    this.logger.log(
      `markNotPerformed: ${total} paseos marcados NOT_PERFORMED ` +
        `(never_confirmed=${neverConfirmed} walker_no_show=${walkerNoShow} ` +
        `on_way_never_started=${onWayNeverStarted} canario=${canary})`,
    );
    if (canary > 0) {
      this.logger.error(
        `markNotPerformed: el pase canario marcó ${canary} paseo(s) — hay un estado sin mapear, revisar`,
      );
    }
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

  // CONFIRMED que nunca marcó "en camino" y ya pasó T + duración del
  // WalkType. Antes marcaba en T+5m — se corrigió porque chocaba de frente
  // con el primer recordatorio al dueño, que sale en ese mismo instante
  // (ver WalkRemindersService): al dueño le llegaban "¿todo bien?" y "el
  // paseo no se realizó" juntos, y era apresurado — el recordatorio existe
  // para que el paseador todavía pueda reaccionar. Primero se insiste,
  // después se declara.
  private async markWalkerNoShow(now: Date): Promise<number> {
    // scheduledAt <= now es un filtro barato en el WHERE (Postgres, con el
    // índice de status+scheduledAt) que saca de la consulta a todo paseo
    // futuro sin tocar la base: si scheduledAt > now, T+duración > now
    // también, así que nunca hubiera pasado el filtro en memoria de abajo.
    const candidates = await this.prisma.walk.findMany({
      where: { status: WalkStatus.CONFIRMED, onWayAt: null, scheduledAt: { lte: now } },
      select: MARKING_SELECT,
      orderBy: { scheduledAt: "asc" },
      take: BATCH_SIZE,
    });
    const overdue = candidates.filter((walk) => this.isPastExpectedEnd(walk, now));
    return this.markBatch(overdue, [WalkStatus.CONFIRMED], NotPerformedReason.WALKER_NO_SHOW, now);
  }

  // WALKER_ON_WAY que ya pasó T + duración del WalkType: marcó "en camino"
  // y después silencio — nunca inició, nadie reclamó nada. Ojo: SOLO
  // WALKER_ON_WAY, nunca CONFIRMED. Antes este pase incluía
  // `status: { in: [CONFIRMED, WALKER_ON_WAY] }`, y ahí estaba el bug: el
  // pase anterior (markWalkerNoShow) también filtra CONFIRMED con
  // `take: 50` — con una cola más larga que 50, los CONFIRMED que sobraban
  // cerraban ACÁ, con un motivo distinto (antes NOBODY_ACTED) solo porque
  // llegaron tarde a su propio pase. La misma situación etiquetada distinto
  // según el largo de la cola, y la etiqueta decide la plata en el bloque
  // E. Restringir el WHERE a WALKER_ON_WAY hace que un CONFIRMED que no
  // entró en su cupo simplemente espere a la corrida siguiente — sigue
  // siendo CONFIRMED, no cambia de identidad.
  private async markOnWayNeverStarted(now: Date): Promise<number> {
    const candidates = await this.prisma.walk.findMany({
      where: { status: WalkStatus.WALKER_ON_WAY, scheduledAt: { lte: now } },
      select: MARKING_SELECT,
      orderBy: { scheduledAt: "asc" },
      take: BATCH_SIZE,
    });
    const overdue = candidates.filter((walk) => this.isPastExpectedEnd(walk, now));
    return this.markBatch(overdue, [WalkStatus.WALKER_ON_WAY], NotPerformedReason.ON_WAY_NEVER_STARTED, now);
  }

  // Canario, no una regla real (ver el comentario en NotPerformedReason del
  // schema). El único hueco estructural que las reglas de arriba no cubren:
  // un CONFIRMED con onWayAt SETEADO — markOnWay() nunca deja ese combo (
  // escribe status y onWayAt en el mismo update atómico), pero una
  // intervención manual por SQL sí puede. markWalkerNoShow exige
  // `onWayAt: null` y este pase no, así que un walk así nunca iba a
  // resolverse solo, sin importar cuántas veces corra el job. Si esto
  // marca algo, ALGUIEN tiene que mirarlo: por eso loguea error además de
  // alertar, y por eso la alerta sale tenga plata o no (a diferencia de
  // markBatch, que solo alerta si está pagado) — la señal acá es "hay un
  // caso sin mapear", no "hay plata en riesgo".
  private async markCanary(now: Date): Promise<number> {
    const candidates = await this.prisma.walk.findMany({
      where: { status: WalkStatus.CONFIRMED, onWayAt: { not: null }, scheduledAt: { lte: now } },
      select: MARKING_SELECT,
      orderBy: { scheduledAt: "asc" },
      take: BATCH_SIZE,
    });
    const overdue = candidates.filter((walk) => this.isPastExpectedEnd(walk, now));

    let marked = 0;
    for (const walk of overdue) {
      const result = await this.prisma.walk.updateMany({
        where: { id: walk.id, status: WalkStatus.CONFIRMED },
        data: { status: WalkStatus.NOT_PERFORMED, notPerformedReason: NotPerformedReason.NOBODY_ACTED, notPerformedAt: now },
      });
      if (result.count === 0) continue;
      marked++;
      this.alertAdmin(walk, NotPerformedReason.NOBODY_ACTED);
    }
    return marked;
  }

  private isPastExpectedEnd(walk: MarkingCandidate, now: Date): boolean {
    const expectedEnd = walk.scheduledAt.getTime() + walk.walkType.durationMinutes * 60_000;
    return now.getTime() >= expectedEnd;
  }

  // ─── Transición + alerta (las tres reglas reales; el canario tiene su
  // propio ciclo más arriba porque alerta distinto) ───────────────────────

  private async markBatch(
    candidates: MarkingCandidate[],
    fromStatuses: WalkStatus[],
    reason: NotPerformedReason,
    now: Date,
  ): Promise<number> {
    let marked = 0;
    for (const walk of candidates) {
      // Idempotente por construcción, dos veces: la SELECT de arriba ya solo
      // trae el/los status esperados, y este UPDATE vuelve a exigirlos en
      // el WHERE. Si otra corrida (o la app) ya lo movió entre el select y
      // acá, count da 0 — no es un error, es la idempotencia funcionando.
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
