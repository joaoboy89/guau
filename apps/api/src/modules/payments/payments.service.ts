import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Cron } from "@nestjs/schedule";
import MercadoPago, { Preference, Payment } from "mercadopago";
import * as crypto from "crypto";
import { PrismaService } from "../../database/prisma.service";
import { CryptoService } from "../../common/crypto/crypto.service";
import { NotificationsService } from "../notifications/notifications.service";
import { WalkStatus, PayoutStatus } from "@prisma/client";
import { NOTIFICATION_TYPES } from "@guau/shared";
import { CreatePreferenceDto } from "./dto/create-preference.dto";
import { isWalkPaid } from "../walks/walk-payment.util";

const MP_CONNECT_STATE_PURPOSE = "mp-connect";

// Invariante: un Walk tiene un solo dueño. No es una convención de
// WalksService.create() (que hoy crea todos los WalkParticipant con el mismo
// ownerId) — está impuesto por el modelo de pagos: Walk.mpPaymentId y
// Walk.mpRefundId son columnas únicas, así que un Walk solo puede tener UN
// pago de MercadoPago, y un pago viene de un createPreference() de un solo
// dueño. Soportar varios dueños por Walk no es tocar create() — requiere un
// pago por dueño, es decir un cambio de schema.
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly mpClient: MercadoPago;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private cryptoService: CryptoService,
    private jwt: JwtService,
    private notificationsService: NotificationsService,
  ) {
    this.mpClient = new MercadoPago({
      accessToken: this.config.get<string>("MP_ACCESS_TOKEN") ?? "no_configurado",
    });
  }

  // ─── Crear preferencia de pago ───────────────────────────

  async createPreference(userId: string, dto: CreatePreferenceDto) {
    const owner = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!owner) throw new NotFoundException("Perfil de dueño no encontrado");

    const participants = await this.prisma.walkParticipant.findMany({
      where: { walkId: dto.walkId, ownerId: owner.id },
      select: { amountPaid: true },
    });
    if (participants.length === 0) {
      throw new ForbiddenException("No sos participante de este paseo");
    }
    // Suma de TODOS los perros de este dueño en el paseo — no walk.totalAmount.
    // Hoy da lo mismo (un Walk tiene un solo dueño, ver comentario de la
    // clase), pero el día que un paseo se comparta entre dueños, totalAmount
    // va a ser el total del paseo completo y cobrarle eso a cada uno sería
    // el error inverso — más caro y más grave. La suma por dueño es correcta
    // en los dos modelos.
    const ownerTotal = participants.reduce((acc, p) => acc + p.amountPaid, 0);

    const walk = await this.prisma.walk.findUnique({
      where: { id: dto.walkId },
      include: {
        walkType: true,
        walker: true,
      },
    });
    if (!walk) throw new NotFoundException("Paseo no encontrado");
    if (walk.status !== WalkStatus.CONFIRMED) {
      throw new BadRequestException("Solo podés pagar un paseo confirmado");
    }
    if (isWalkPaid(walk.mpPaymentId)) {
      throw new BadRequestException("Este paseo ya fue pagado");
    }
    // Comparación de instantes, sin zona horaria — no toBusinessDayAndTime:
    // esa TZ de negocio hace falta para mapear un instante a un día/hora de
    // pared (las franjas de WalkerSchedule), no para comparar dos instantes.
    // Mismo patrón que WalksService.create().
    if (walk.scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException("Este paseo ya venció y no se puede pagar");
    }
    if (!walk.walker.mpAccessToken) {
      throw new BadRequestException("El paseador todavía no conectó su cuenta de MercadoPago");
    }
    const walkerToken = this.cryptoService.decrypt(walk.walker.mpAccessToken);
    if (!walkerToken) {
      throw new BadRequestException("El paseador todavía no conectó su cuenta de MercadoPago");
    }

    const frontendUrl = this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
    const apiUrl = this.config.get<string>("API_URL") ?? "http://localhost:3001";

    const walkerClient = new MercadoPago({ accessToken: walkerToken });
    const preferenceApi = new Preference(walkerClient);

    const preference = await preferenceApi.create({
      body: {
        items: [
          {
            id: walk.walkTypeId,
            title: `Güau — Paseo ${walk.walkType.label}`,
            // SIN pickupAddress a propósito: el split manda esta preferencia
            // al paseador (es quien cobra), y en CONFIRMED —que puede ser
            // días antes de "voy en camino"— la dirección exacta todavía
            // está ofuscada (ver toPublicWalk, anti-desintermediación). Si
            // fuera acá, MercadoPago se la mostraría igual y toda esa
            // protección sería decorativa. Con tipo, duración y fecha
            // alcanza para que el dueño reconozca el cobro en su comprobante
            // — ya sabe dónde vive.
            // "Paseo de Mascota" fijo, no walk.mode: grupal/exclusivo es
            // vocabulario interno del negocio — no le dice nada al dueño en
            // su comprobante ni al paseador en su cuenta de MercadoPago.
            description: `Paseo de Mascota — ${walk.walkType.durationMinutes} min — ${walk.scheduledAt.toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" })}`,
            quantity: 1,
            unit_price: ownerTotal,
            currency_id: "ARS",
          },
        ],
        // Proporcional a lo que se cobra, no a walk.platformFee (la comisión
        // del paseo entero) — hoy da lo mismo (un Walk tiene un solo dueño,
        // ver comentario de la clase), pero si se cobrara walk.platformFee
        // acá se le pediría a MP una comisión sobre plata que este dueño en
        // particular no está pagando.
        marketplace_fee: ownerTotal * walk.commissionRate,
        external_reference: `${walk.id}|${owner.id}`,
        notification_url: `${apiUrl}/payments/webhook?walkId=${walk.id}`,
        back_urls: {
          success: `${frontendUrl}/walks/${walk.id}?payment=success`,
          failure: `${frontendUrl}/walks/${walk.id}?payment=failure`,
          pending: `${frontendUrl}/walks/${walk.id}?payment=pending`,
        },
        auto_return: "approved",
        statement_descriptor: "GUAU PASEOS",
      },
    });

    await this.prisma.walk.update({
      where: { id: walk.id },
      data: { mpPaymentId: preference.id },
    });

    return {
      preferenceId: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
    };
  }

  // ─── Reembolso (admin) ────────────────────────────────────
  // Protección anti no-show: "reembolso rápido, no prevención". Ejecuta el
  // refund con el token OAuth del propio walker (vendedor) — Güau puede
  // dispararlo sin que el paseador haga nada. Solo refund TOTAL en MVP.

  async refundWalkPayment(walkId: string) {
    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      include: { walker: true },
    });
    if (!walk) throw new NotFoundException("Paseo no encontrado");

    if (!walk.mpPaymentId || !/^\d+$/.test(walk.mpPaymentId)) {
      throw new BadRequestException("Este paseo no tiene un pago para reembolsar");
    }
    if (walk.mpRefundId) {
      throw new BadRequestException("Este paseo ya fue reembolsado");
    }

    const rawToken = walk.walker.mpAccessToken;
    const walkerToken = rawToken ? this.cryptoService.decrypt(rawToken) : "";
    if (!walkerToken) {
      throw new BadRequestException("El paseador no tiene una cuenta de MercadoPago conectada");
    }

    // X-Idempotency-Key derivado del walkId: un doble-click reintenta la
    // misma operación en vez de generar un segundo refund.
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${walk.mpPaymentId}/refunds`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${walkerToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `refund-${walkId}`,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `Refund falló para walk ${walkId}: ${response.status} ${errorText}`,
      );
      throw new BadRequestException("No se pudo procesar el reembolso en MercadoPago");
    }

    const refund = await response.json() as { id?: number | string };
    const refundId = refund.id != null ? String(refund.id) : "sin-id";

    const alreadyCancelled =
      walk.status === WalkStatus.CANCELLED_WALKER || walk.status === WalkStatus.CANCELLED_OWNER;

    const updated = await this.prisma.walk.update({
      where: { id: walkId },
      data: {
        mpRefundId: refundId,
        refundedAt: new Date(),
        ...(alreadyCancelled ? {} : { status: WalkStatus.CANCELLED_WALKER }),
      },
    });

    // Notifica al primer participante del paseo — no bloquea la respuesta si
    // el walk no tiene participantes cargados. Sin filtrar por dueño: esta
    // función recibe solo walkId y reembolsa un único pago, que por el
    // modelo de pagos (ver comentario de la clase) es de un solo dueño —
    // cualquier participante que traiga apunta al mismo owner.
    // El monto sale de la suma de amountPaid de esos participantes, no de
    // walk.totalAmount — un texto sobre plata se calcula de lo que pasó, no
    // de lo que se esperaba (mismo criterio que el mensaje de cancelación).
    const participants = await this.prisma.walkParticipant.findMany({
      where: { walkId },
      include: { owner: { include: { user: { select: { id: true } } } } },
    });
    if (participants.length > 0) {
      const ownerTotal = participants.reduce((acc, p) => acc + p.amountPaid, 0);
      await this.notificationsService.create({
        userId: participants[0].owner.user.id,
        title: "Te devolvimos el dinero del paseo",
        body: `El paseo no se realizó — reembolsamos $${ownerTotal.toLocaleString("es-AR")} a tu cuenta de MercadoPago.`,
        type: NOTIFICATION_TYPES.WALK_CANCELLED_WALKER,
        data: { walkId, refundId },
      });
    }

    this.logger.log(`Reembolso ${refundId} procesado para walk ${walkId}`);

    return updated;
  }

  // ─── Webhook de MercadoPago ──────────────────────────────

  async handleWebhook(
    body: Record<string, unknown>,
    xSignature: string | undefined,
    xRequestId: string | undefined,
    walkId?: string,
  ) {
    if (xSignature && xRequestId) {
      this.verifyWebhookSignature(body, xSignature, xRequestId);
    } else if (process.env.NODE_ENV === "production") {
      throw new UnauthorizedException(
        "Webhook sin x-signature/x-request-id — rechazado en producción",
      );
    }

    const type = body.type as string;
    const dataId = (body.data as Record<string, string>)?.id;

    if (type !== "payment" || !dataId) {
      return { status: "ignored" };
    }

    this.logger.log(`Webhook MP recibido: payment ${dataId}`);

    try {
      if (walkId) {
        // Camino correcto: cargar walk con token del walker para consultar el pago
        const walk = await this.prisma.walk.findUnique({
          where: { id: walkId },
          select: {
            id: true,
            walkerAmount: true,
            walkerId: true,
            platformFee: true,
            mpPaymentId: true,
            walker: { select: { mpAccessToken: true } },
          },
        });
        if (!walk) return { status: "walk_not_found" };

        const rawToken = walk.walker.mpAccessToken ?? "";
        const walkerToken = rawToken ? this.cryptoService.decrypt(rawToken) : "";
        const walkerClient = new MercadoPago({ accessToken: walkerToken });
        const paymentApi = new Payment(walkerClient);
        const payment = await paymentApi.get({ id: Number(dataId) });

        // Defensa anti-spoofing: el external_reference debe empezar con el walkId de la URL
        const externalRef = payment.external_reference as string | undefined;
        if (!externalRef || !externalRef.startsWith(`${walkId}|`)) {
          this.logger.warn(
            `Webhook: external_reference "${externalRef}" no coincide con walkId "${walkId}" — posible spoofing`,
          );
          return { status: "reference_mismatch" };
        }

        const ownerId = externalRef.split("|")[1];

        if (payment.status === "approved") {
          await this.handleApprovedPayment(walk, ownerId, payment);
        } else if (payment.status === "rejected" || payment.status === "cancelled") {
          this.logger.warn(`Pago ${dataId} rechazado/cancelado para walk ${walkId}`);
        }
      } else {
        // Fallback sin walkId: usa token de plataforma (webhooks legacy / re-envíos sin query param)
        this.logger.warn(`Webhook sin walkId en la URL — usando token de plataforma como fallback`);

        const paymentApi = new Payment(this.mpClient);
        const payment = await paymentApi.get({ id: Number(dataId) });

        const externalRef = payment.external_reference as string | undefined;
        if (!externalRef) return { status: "no_reference" };

        const [walkIdFromRef, ownerId] = externalRef.split("|");

        const walk = await this.prisma.walk.findUnique({
          where: { id: walkIdFromRef },
          select: { id: true, walkerAmount: true, walkerId: true, platformFee: true, mpPaymentId: true },
        });
        if (!walk) return { status: "walk_not_found" };

        if (payment.status === "approved") {
          await this.handleApprovedPayment(walk, ownerId, payment);
        } else if (payment.status === "rejected" || payment.status === "cancelled") {
          this.logger.warn(`Pago ${dataId} rechazado/cancelado para walk ${walkIdFromRef}`);
        }
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : JSON.stringify(err);
      this.logger.error(`Error procesando webhook ${dataId}: ${detail}`);
    }

    return { status: "processed" };
  }

  // ─── Job de reconciliación (respaldo al webhook) ─────────

  @Cron("0 */15 * * * *")
  async reconcilePendingPayments() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const walks = await this.prisma.walk.findMany({
      where: {
        status: WalkStatus.CONFIRMED,
        mpPaymentId: { not: null },
        updatedAt: { gte: sevenDaysAgo },
      },
      select: {
        id: true,
        walkerAmount: true,
        walkerId: true,
        platformFee: true,
        mpPaymentId: true,
        walker: { select: { mpAccessToken: true } },
        participants: { select: { ownerId: true }, take: 1 },
      },
    });

    // Solo los que todavía tienen preference ID (no numérico = no resuelto como payment ID)
    const unresolved = walks.filter(w => w.mpPaymentId && !/^\d+$/.test(w.mpPaymentId));

    let reviewed = 0;
    let reconciled = 0;

    for (const walk of unresolved) {
      reviewed++;
      try {
        if (!walk.walker.mpAccessToken) continue;
        const walkerToken = this.cryptoService.decrypt(walk.walker.mpAccessToken);
        if (!walkerToken) continue;

        const ownerId = walk.participants[0]?.ownerId;
        if (!ownerId) continue;

        const searchRes = await fetch(
          `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(`${walk.id}|${ownerId}`)}`,
          { headers: { Authorization: `Bearer ${walkerToken}` } },
        );
        if (!searchRes.ok) continue;

        const data = await searchRes.json() as { results?: Array<{ id: number; status: string }> };
        const approved = data.results?.find(p => p.status === "approved");
        if (!approved) continue;

        const walkerClient = new MercadoPago({ accessToken: walkerToken });
        const paymentApi = new Payment(walkerClient);
        const payment = await paymentApi.get({ id: approved.id });

        await this.handleApprovedPayment(walk, ownerId, payment);
        reconciled++;
      } catch (err) {
        this.logger.error(`reconcile: error procesando walk ${walk.id}: ${err}`);
      }
    }

    this.logger.log(`Reconciliación: ${reviewed} revisados, ${reconciled} reconciliados`);
  }

  // ─── Balance del paseador ────────────────────────────────

  async getWalkerBalance(userId: string) {
    const walker = await this.prisma.walkerProfile.findUnique({ where: { userId } });
    if (!walker) throw new NotFoundException("Perfil de paseador no encontrado");

    const completedWalks = await this.prisma.walk.findMany({
      where: { walkerId: walker.id, status: WalkStatus.COMPLETED },
      select: {
        id: true,
        walkerAmount: true,
        totalAmount: true,
        platformFee: true,
        scheduledAt: true,
        walkType: { select: { label: true } },
      },
      orderBy: { scheduledAt: "desc" },
    });

    const payouts = await this.prisma.payout.findMany({
      where: { walkerId: walker.id },
      orderBy: { createdAt: "desc" },
    });

    const totalEarned = completedWalks.reduce((sum, w) => sum + w.walkerAmount, 0);
    const totalPaidOut = payouts
      .filter((p) => p.status === PayoutStatus.COMPLETED)
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      pendingBalance: Math.round((totalEarned - totalPaidOut) * 100) / 100,
      totalEarned: Math.round(totalEarned * 100) / 100,
      totalPaidOut: Math.round(totalPaidOut * 100) / 100,
      completedWalks,
      payouts,
    };
  }

  // ─── OAuth: URL para conectar cuenta MP del paseador ────

  getWalkerConnectUrl(userId: string) {
    const clientId = this.config.getOrThrow<string>("MP_CLIENT_ID");
    const redirectUri = encodeURIComponent(
      `${this.config.getOrThrow<string>("API_URL")}/payments/walker-connect/callback`
    );
    const state = this.jwt.sign(
      { sub: userId, purpose: MP_CONNECT_STATE_PURPOSE },
      { secret: this.config.getOrThrow<string>("JWT_SECRET"), expiresIn: "10m" },
    );
    const url =
      `https://auth.mercadopago.com.ar/authorization` +
      `?client_id=${clientId}` +
      `&response_type=code` +
      `&platform_id=mp` +
      `&redirect_uri=${redirectUri}` +
      `&state=${encodeURIComponent(state)}`;

    return { url };
  }

  // ─── OAuth: callback tras autorizar en MP ────────────────

  async handleWalkerCallback(code: string, state: string) {
    if (!code || !state) throw new BadRequestException("Parámetros inválidos del callback");

    let statePayload: { sub: string; purpose: string };
    try {
      statePayload = this.jwt.verify(state, {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("State de OAuth inválido o expirado");
    }
    if (statePayload.purpose !== MP_CONNECT_STATE_PURPOSE) {
      throw new UnauthorizedException("State de OAuth inválido");
    }
    const userId = statePayload.sub;

    const clientId = this.config.getOrThrow<string>("MP_CLIENT_ID");
    const clientSecret = this.config.getOrThrow<string>("MP_CLIENT_SECRET");
    const redirectUri = `${this.config.getOrThrow<string>("API_URL")}/payments/walker-connect/callback`;

    const response = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      throw new BadRequestException("No se pudo conectar la cuenta de MercadoPago");
    }

    const data = await response.json() as {
      access_token: string;
      user_id: number;
    };

    const walker = await this.prisma.walkerProfile.findUnique({
      where: { userId },
    });
    if (!walker) throw new NotFoundException("Paseador no encontrado");

    await this.prisma.walkerProfile.update({
      where: { userId },
      data: {
        mpAccessToken: this.cryptoService.encrypt(data.access_token),
        mpUserId: String(data.user_id),
      },
    });

    const frontendUrl = this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3000";

    return { redirect: `${frontendUrl}/walker/dashboard?mp=connected` };
  }

  // ─── Helpers privados ────────────────────────────────────

  private verifyWebhookSignature(
    body: Record<string, unknown>,
    xSignature: string,
    xRequestId: string,
  ) {
    const webhookSecret = this.config.get<string>("MP_WEBHOOK_SECRET");
    if (!webhookSecret) {
      if (process.env.NODE_ENV === "production") {
        throw new UnauthorizedException(
          "MP_WEBHOOK_SECRET no configurado — rechazando webhook en producción",
        );
      }
      this.logger.warn(
        "MP_WEBHOOK_SECRET no configurado — validación de firma salteada (solo permitido fuera de producción)",
      );
      return;
    }

    const parts = Object.fromEntries(
      xSignature.split(",").map((p) => p.split("=") as [string, string])
    );
    const ts = parts["ts"];
    const v1 = parts["v1"];

    const dataId = (body.data as Record<string, string>)?.id ?? "";
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(manifest)
      .digest("hex");

    // timingSafeEqual en vez de !== — comparar firmas con un operador de
    // longitud/short-circuit filtra un side-channel de timing. Requiere
    // buffers de igual longitud (si no, tira RangeError), así que ese chequeo
    // va primero — una firma de largo distinto ya es inválida de por sí.
    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(v1 ?? "", "hex");

    const isValid =
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

    if (!isValid) {
      throw new UnauthorizedException("Firma de webhook inválida");
    }
  }

  private async handleApprovedPayment(
    walk: { id: string; walkerAmount: number; walkerId: string; platformFee: number; mpPaymentId: string | null },
    ownerId: string,
    payment: {
      id?: number | null;
      net_amount?: number | null;
      transaction_details?: { net_received_amount?: number | null } | null;
    },
  ) {
    // Idempotencia: si ya procesamos este pago exacto, no hacer nada
    if (walk.mpPaymentId === String(payment.id)) {
      this.logger.debug(`Pago ${payment.id} ya procesado para walk ${walk.id} — ignorando`);
      return;
    }

    const realWalkerAmount = payment.transaction_details?.net_received_amount ?? walk.walkerAmount;

    await this.prisma.walk.update({
      where: { id: walk.id },
      data: {
        mpPaymentId: String(payment.id),
        walkerAmount: realWalkerAmount,
      },
    });

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    await this.prisma.payout.upsert({
      where: {
        id: `${walk.walkerId}-${weekStart.toISOString().slice(0, 10)}`,
      },
      update: {
        amount: { increment: realWalkerAmount },
      },
      create: {
        id: `${walk.walkerId}-${weekStart.toISOString().slice(0, 10)}`,
        walkerId: walk.walkerId,
        amount: realWalkerAmount,
        periodStart: weekStart,
        periodEnd: weekEnd,
        status: PayoutStatus.PENDING,
      },
    });

    this.logger.log(
      `Pago aprobado para walk ${walk.id} — $ ${realWalkerAmount} acreditado al paseador`
    );
  }
}
