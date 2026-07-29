import * as crypto from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { WalkStatus, PayoutStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { NotificationsService } from '../notifications/notifications.service';

function buildNotificationsServiceMock() {
  return { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
}

// Mocks for MP SDK instances — assigned fresh in beforeEach
let mockPreferenceCreate: jest.Mock;
let mockPaymentGet: jest.Mock;

jest.mock('mercadopago', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({}),
  Preference: jest.fn(),
  Payment: jest.fn(),
}));

// Import AFTER jest.mock so we get the mocked versions
import MercadoPago, { Preference, Payment } from 'mercadopago';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const OWNER = { id: 'owner-1' };
const PARTICIPANT = { id: 'part-1', amountPaid: 1500 };
// Siempre en el futuro relativo a "ahora" — createPreference() valida que el
// paseo no haya vencido, igual criterio que walks.service.spec.ts.
const FUTURE_SCHEDULED_AT = new Date(Date.now() + 24 * 60 * 60 * 1000);
const WALK_BASE = {
  id: 'walk-1',
  walkTypeId: 'wt-1',
  status: WalkStatus.CONFIRMED,
  mpPaymentId: null as string | null,
  platformFee: 150,
  walkerAmount: 1350,
  mode: 'EXCLUSIVO',
  pickupAddress: 'Palermo',
  scheduledAt: FUTURE_SCHEDULED_AT,
  walkType: { label: 'Paseo 30min' },
  walker: { mpAccessToken: 'walker-token-123' },
};
const MP_PREFERENCE = {
  id: 'pref-abc',
  init_point: 'https://mercadopago.com/checkout/pref-abc',
  sandbox_init_point: 'https://sandbox.mercadopago.com/pref-abc',
};

// Base walk row used in webhook tests (fallback path, no walker nested)
const WALK_ROW = {
  id:           'walk-1',
  walkerAmount: 1350,
  walkerId:     'walker-1',
  platformFee:  150,
  mpPaymentId:  null as string | null,
};

// Walk row with nested walker — used in walkId path tests
const WALK_ROW_WITH_WALKER = {
  ...WALK_ROW,
  mpPaymentId: 'pref-abc',
  walker: { mpAccessToken: 'walker-token-xyz' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    ownerProfile:    { findUnique: jest.fn() },
    walkerProfile:   { findUnique: jest.fn(), update: jest.fn() },
    walkParticipant: { findFirst: jest.fn() },
    walk:            { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    payout:          { upsert: jest.fn() },
  };
}

function buildConfigMock() {
  const values: Record<string, string> = {
    MP_ACCESS_TOKEN:   'platform-mp-token',
    FRONTEND_URL:      'http://localhost:3000',
    API_URL:           'http://localhost:3001',
    MP_WEBHOOK_SECRET: '',       // empty → skip signature verification in tests
    MP_CLIENT_ID:      'client-id',
    MP_CLIENT_SECRET:  'client-secret',
    JWT_SECRET:        'jwt-test-secret',
  };
  return {
    get: jest.fn((key: string) => values[key] ?? null),
    getOrThrow: jest.fn((key: string) => {
      if (!values[key]) throw new Error(`Missing config: ${key}`);
      return values[key];
    }),
  };
}

function approvedPayment(overrides: Partial<{
  id: number;
  net_amount: number | null;
  external_reference: string;
  transaction_details: { net_received_amount?: number | null } | null;
}> = {}) {
  return {
    id:                   99999,
    status:               'approved',
    external_reference:   'walk-1|owner-1',
    net_amount:           1350,
    transaction_details:  { net_received_amount: 1320 },
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let config: ReturnType<typeof buildConfigMock>;
  let notificationsService: ReturnType<typeof buildNotificationsServiceMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    config = buildConfigMock();
    notificationsService = buildNotificationsServiceMock();

    // Fresh MP instance mocks each test
    mockPreferenceCreate = jest.fn().mockResolvedValue(MP_PREFERENCE);
    mockPaymentGet = jest.fn();

    (Preference as jest.Mock).mockImplementation(() => ({ create: mockPreferenceCreate }));
    (Payment as jest.Mock).mockImplementation(() => ({ get: mockPaymentGet }));

    const cryptoMock = {
      encrypt: jest.fn((s: string) => s),
      decrypt: jest.fn((s: string) => s),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService,  useValue: prisma },
        { provide: ConfigService,  useValue: config },
        { provide: CryptoService,  useValue: cryptoMock },
        { provide: JwtService,     useValue: new JwtService() },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createPreference ─────────────────────────────────────────────────────

  describe('createPreference()', () => {
    const DTO = { walkId: 'walk-1' };

    function setupHappyPath() {
      prisma.ownerProfile.findUnique.mockResolvedValue(OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue(PARTICIPANT);
      prisma.walk.findUnique.mockResolvedValue({ ...WALK_BASE });
      prisma.walk.update.mockResolvedValue({});
    }

    it('lanza NotFoundException si no existe el OwnerProfile', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(null);
      await expect(service.createPreference('user-1', DTO))
        .rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si el owner no es participante del walk', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue(null);
      await expect(service.createPreference('user-1', DTO))
        .rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException si el walk no existe', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue(PARTICIPANT);
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.createPreference('user-1', DTO))
        .rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si walk.status no es CONFIRMED', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue(PARTICIPANT);
      prisma.walk.findUnique.mockResolvedValue({ ...WALK_BASE, status: WalkStatus.PENDING });
      await expect(service.createPreference('user-1', DTO))
        .rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el walk ya tiene un payment id NUMÉRICO (pago real)', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue(PARTICIPANT);
      prisma.walk.findUnique.mockResolvedValue({ ...WALK_BASE, mpPaymentId: '99999' });
      await expect(service.createPreference('user-1', DTO))
        .rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el paseo ya venció (scheduledAt en el pasado)', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue(PARTICIPANT);
      prisma.walk.findUnique.mockResolvedValue({
        ...WALK_BASE,
        scheduledAt: new Date(Date.now() - 60_000),
      });
      await expect(service.createPreference('user-1', DTO))
        .rejects.toThrow(BadRequestException);
      expect(mockPreferenceCreate).not.toHaveBeenCalled();
    });

    it('sigue funcionando con scheduledAt en el futuro (camino feliz no se rompe)', async () => {
      setupHappyPath();
      const result = await service.createPreference('user-1', DTO);
      expect(result.preferenceId).toBe(MP_PREFERENCE.id);
    });

    it('permite re-crear la preferencia si mpPaymentId es no numérico (pago no completado)', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue(PARTICIPANT);
      prisma.walk.findUnique.mockResolvedValue({
        ...WALK_BASE,
        mpPaymentId: '3541787996-9905f4f5-abc', // preference id anterior, no es pago real
      });
      prisma.walk.update.mockResolvedValue({});
      const result = await service.createPreference('user-1', DTO);
      expect(result.preferenceId).toBe(MP_PREFERENCE.id);
    });

    it('lanza BadRequestException si el walker no tiene mpAccessToken', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue(PARTICIPANT);
      prisma.walk.findUnique.mockResolvedValue({
        ...WALK_BASE,
        walker: { mpAccessToken: null },
      });
      await expect(service.createPreference('user-1', DTO))
        .rejects.toThrow(BadRequestException);
    });

    it('camino feliz: llama a Preference.create con marketplace_fee = walk.platformFee', async () => {
      setupHappyPath();
      await service.createPreference('user-1', DTO);

      expect(mockPreferenceCreate).toHaveBeenCalledTimes(1);
      const callBody = mockPreferenceCreate.mock.calls[0][0].body;
      expect(callBody.marketplace_fee).toBe(WALK_BASE.platformFee);
    });

    it('camino feliz: notification_url incluye walkId como query param', async () => {
      setupHappyPath();
      await service.createPreference('user-1', DTO);

      const callBody = mockPreferenceCreate.mock.calls[0][0].body;
      expect(callBody.notification_url).toBe('http://localhost:3001/payments/webhook?walkId=walk-1');
    });

    it('camino feliz: devuelve preferenceId e initPoint correctamente', async () => {
      setupHappyPath();
      const result = await service.createPreference('user-1', DTO);

      expect(result).toEqual({
        preferenceId:       MP_PREFERENCE.id,
        initPoint:          MP_PREFERENCE.init_point,
        sandboxInitPoint:   MP_PREFERENCE.sandbox_init_point,
      });
    });

    it('camino feliz: guarda el preferenceId en el walk', async () => {
      setupHappyPath();
      await service.createPreference('user-1', DTO);

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'walk-1' },
          data:  { mpPaymentId: MP_PREFERENCE.id },
        }),
      );
    });
  });

  // ─── refundWalkPayment — reembolso admin ──────────────────────────────────

  describe('refundWalkPayment()', () => {
    const REFUND_WALK_ID = 'walk-1';

    function buildRefundWalk(overrides: Record<string, unknown> = {}) {
      return {
        id: REFUND_WALK_ID,
        mpPaymentId: '99999',
        mpRefundId: null as string | null,
        status: WalkStatus.CONFIRMED,
        totalAmount: 1500,
        walker: { mpAccessToken: 'encrypted-walker-token' },
        ...overrides,
      };
    }

    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('lanza NotFoundException si el walk no existe', async () => {
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.refundWalkPayment(REFUND_WALK_ID)).rejects.toThrow(NotFoundException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si el walk no tiene mpPaymentId', async () => {
      prisma.walk.findUnique.mockResolvedValue(buildRefundWalk({ mpPaymentId: null }));
      await expect(service.refundWalkPayment(REFUND_WALK_ID)).rejects.toThrow(BadRequestException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si mpPaymentId no es numérico (preference id, no pago real)', async () => {
      prisma.walk.findUnique.mockResolvedValue(buildRefundWalk({ mpPaymentId: 'pref-abc' }));
      await expect(service.refundWalkPayment(REFUND_WALK_ID)).rejects.toThrow(BadRequestException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si el paseo ya fue reembolsado antes', async () => {
      prisma.walk.findUnique.mockResolvedValue(buildRefundWalk({ mpRefundId: 'refund-existente' }));
      await expect(service.refundWalkPayment(REFUND_WALK_ID)).rejects.toThrow(BadRequestException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si el walker no tiene mpAccessToken', async () => {
      prisma.walk.findUnique.mockResolvedValue(buildRefundWalk({ walker: { mpAccessToken: null } }));
      await expect(service.refundWalkPayment(REFUND_WALK_ID)).rejects.toThrow(BadRequestException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('camino feliz: llama a MP con el token del walker y X-Idempotency-Key derivado del walkId', async () => {
      prisma.walk.findUnique.mockResolvedValue(buildRefundWalk());
      prisma.walk.update.mockResolvedValue({});
      prisma.walkParticipant.findFirst.mockResolvedValue({ owner: { user: { id: 'owner-user-1' } } });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ id: 555 }) });

      await service.refundWalkPayment(REFUND_WALK_ID);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.mercadopago.com/v1/payments/99999/refunds',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer encrypted-walker-token',
            'X-Idempotency-Key': `refund-${REFUND_WALK_ID}`,
          }),
        }),
      );
    });

    it('camino feliz: guarda mpRefundId + refundedAt y transiciona a CANCELLED_WALKER', async () => {
      prisma.walk.findUnique.mockResolvedValue(buildRefundWalk());
      prisma.walk.update.mockResolvedValue({});
      prisma.walkParticipant.findFirst.mockResolvedValue({ owner: { user: { id: 'owner-user-1' } } });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ id: 555 }) });

      await service.refundWalkPayment(REFUND_WALK_ID);

      expect(prisma.walk.update).toHaveBeenCalledWith({
        where: { id: REFUND_WALK_ID },
        data: {
          mpRefundId: '555',
          refundedAt: expect.any(Date),
          status: WalkStatus.CANCELLED_WALKER,
        },
      });
    });

    it('camino feliz: no pisa el status si el walk ya estaba cancelado', async () => {
      prisma.walk.findUnique.mockResolvedValue(buildRefundWalk({ status: WalkStatus.CANCELLED_OWNER }));
      prisma.walk.update.mockResolvedValue({});
      prisma.walkParticipant.findFirst.mockResolvedValue({ owner: { user: { id: 'owner-user-1' } } });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ id: 555 }) });

      await service.refundWalkPayment(REFUND_WALK_ID);

      expect(prisma.walk.update).toHaveBeenCalledWith({
        where: { id: REFUND_WALK_ID },
        data: {
          mpRefundId: '555',
          refundedAt: expect.any(Date),
        },
      });
    });

    it('camino feliz: notifica al dueño que le devolvimos la plata', async () => {
      prisma.walk.findUnique.mockResolvedValue(buildRefundWalk());
      prisma.walk.update.mockResolvedValue({});
      prisma.walkParticipant.findFirst.mockResolvedValue({ owner: { user: { id: 'owner-user-1' } } });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ id: 555 }) });

      await service.refundWalkPayment(REFUND_WALK_ID);

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'owner-user-1',
          title:  expect.stringMatching(/devolvimos/i),
        }),
      );
    });

    it('si MP responde no-ok, lanza BadRequestException y NO muta el walk ni notifica', async () => {
      prisma.walk.findUnique.mockResolvedValue(buildRefundWalk());
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'refund not available for this payment',
      });

      await expect(service.refundWalkPayment(REFUND_WALK_ID)).rejects.toThrow(BadRequestException);

      expect(prisma.walk.update).not.toHaveBeenCalled();
      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });

  // ─── handleWebhook — caminos compartidos ──────────────────────────────────

  describe('handleWebhook()', () => {
    it('devuelve { status: "ignored" } si el type no es "payment"', async () => {
      const result = await service.handleWebhook(
        { type: 'merchant_order', data: { id: '1' } },
        undefined, undefined,
      );
      expect(result).toEqual({ status: 'ignored' });
    });

    it('devuelve { status: "ignored" } si no hay dataId', async () => {
      const result = await service.handleWebhook(
        { type: 'payment' },
        undefined, undefined,
      );
      expect(result).toEqual({ status: 'ignored' });
    });

    // ─── Sin walkId (fallback con token de plataforma) ─────────────────────

    describe('sin walkId (fallback)', () => {
      it('devuelve { status: "walk_not_found" } si no existe el walk', async () => {
        mockPaymentGet.mockResolvedValue(approvedPayment());
        prisma.walk.findUnique.mockResolvedValue(null);

        const result = await service.handleWebhook(
          { type: 'payment', data: { id: '99999' } },
          undefined, undefined,
        );
        expect(result).toEqual({ status: 'walk_not_found' });
      });

      it('pago aprobado: usa transaction_details.net_received_amount como walkerAmount', async () => {
        mockPaymentGet.mockResolvedValue(approvedPayment()); // net_received_amount: 1320
        prisma.walk.findUnique.mockResolvedValue(WALK_ROW);
        prisma.walk.update.mockResolvedValue({});
        prisma.payout.upsert.mockResolvedValue({});

        await service.handleWebhook(
          { type: 'payment', data: { id: '99999' } },
          undefined, undefined,
        );

        expect(prisma.walk.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'walk-1' },
            data:  expect.objectContaining({ walkerAmount: 1320 }),
          }),
        );
      });

      it('pago aprobado: usa walk.walkerAmount como fallback si transaction_details es null', async () => {
        mockPaymentGet.mockResolvedValue(approvedPayment({ transaction_details: null }));
        prisma.walk.findUnique.mockResolvedValue(WALK_ROW);
        prisma.walk.update.mockResolvedValue({});
        prisma.payout.upsert.mockResolvedValue({});

        await service.handleWebhook(
          { type: 'payment', data: { id: '99999' } },
          undefined, undefined,
        );

        expect(prisma.walk.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ walkerAmount: WALK_ROW.walkerAmount }),
          }),
        );
      });

      it('pago aprobado: llama a payout.upsert con walkerId y net_received_amount', async () => {
        mockPaymentGet.mockResolvedValue(approvedPayment()); // net_received_amount: 1320
        prisma.walk.findUnique.mockResolvedValue(WALK_ROW);
        prisma.walk.update.mockResolvedValue({});
        prisma.payout.upsert.mockResolvedValue({});

        await service.handleWebhook(
          { type: 'payment', data: { id: '99999' } },
          undefined, undefined,
        );

        expect(prisma.payout.upsert).toHaveBeenCalledTimes(1);
        const upsertCall = prisma.payout.upsert.mock.calls[0][0];
        expect(upsertCall.create.walkerId).toBe('walker-1');
        expect(upsertCall.create.amount).toBe(1320);
        expect(upsertCall.create.status).toBe(PayoutStatus.PENDING);
        expect(upsertCall.update.amount).toEqual({ increment: 1320 });
      });

      it('devuelve { status: "processed" } en el camino feliz', async () => {
        mockPaymentGet.mockResolvedValue(approvedPayment());
        prisma.walk.findUnique.mockResolvedValue(WALK_ROW);
        prisma.walk.update.mockResolvedValue({});
        prisma.payout.upsert.mockResolvedValue({});

        const result = await service.handleWebhook(
          { type: 'payment', data: { id: '99999' } },
          undefined, undefined,
        );
        expect(result).toEqual({ status: 'processed' });
      });
    });

    // ─── Con walkId (token del walker) ─────────────────────────────────────

    describe('con walkId', () => {
      it('(a) usa el token del walker, no el de plataforma, para consultar el pago', async () => {
        mockPaymentGet.mockResolvedValue(approvedPayment());
        prisma.walk.findUnique.mockResolvedValue(WALK_ROW_WITH_WALKER);
        prisma.walk.update.mockResolvedValue({});
        prisma.payout.upsert.mockResolvedValue({});

        await service.handleWebhook(
          { type: 'payment', data: { id: '99999' } },
          undefined, undefined, 'walk-1',
        );

        // MercadoPago debe haber sido instanciado con el token del walker
        expect(MercadoPago as jest.Mock).toHaveBeenCalledWith(
          expect.objectContaining({ accessToken: 'walker-token-xyz' }),
        );
        expect(prisma.payout.upsert).toHaveBeenCalledTimes(1);
      });

      it('(d) devuelve { status: "reference_mismatch" } si external_reference no empieza con walkId', async () => {
        mockPaymentGet.mockResolvedValue(
          approvedPayment({ external_reference: 'walk-OTRO|owner-1' }),
        );
        prisma.walk.findUnique.mockResolvedValue(WALK_ROW_WITH_WALKER);

        const result = await service.handleWebhook(
          { type: 'payment', data: { id: '99999' } },
          undefined, undefined, 'walk-1',
        );

        expect(result).toEqual({ status: 'reference_mismatch' });
        expect(prisma.payout.upsert).not.toHaveBeenCalled();
      });

      it('devuelve { status: "walk_not_found" } si el walk no existe', async () => {
        prisma.walk.findUnique.mockResolvedValue(null);

        const result = await service.handleWebhook(
          { type: 'payment', data: { id: '99999' } },
          undefined, undefined, 'walk-inexistente',
        );
        expect(result).toEqual({ status: 'walk_not_found' });
      });
    });

    // ─── Idempotencia ──────────────────────────────────────────────────────

    describe('idempotencia', () => {
      it('(b) si walk.mpPaymentId ya es el mismo payment.id, no llama a payout.upsert ni walk.update', async () => {
        mockPaymentGet.mockResolvedValue(approvedPayment()); // payment.id = 99999
        prisma.walk.findUnique.mockResolvedValue({
          ...WALK_ROW,
          mpPaymentId: '99999', // ya procesado
        });

        await service.handleWebhook(
          { type: 'payment', data: { id: '99999' } },
          undefined, undefined,
        );

        expect(prisma.payout.upsert).not.toHaveBeenCalled();
        expect(prisma.walk.update).not.toHaveBeenCalled();
      });

      it('procesa normalmente si mpPaymentId es diferente (preference ID aún sin resolver)', async () => {
        mockPaymentGet.mockResolvedValue(approvedPayment());
        prisma.walk.findUnique.mockResolvedValue({
          ...WALK_ROW,
          mpPaymentId: 'pref-abc', // preference ID, no es el payment.id
        });
        prisma.walk.update.mockResolvedValue({});
        prisma.payout.upsert.mockResolvedValue({});

        await service.handleWebhook(
          { type: 'payment', data: { id: '99999' } },
          undefined, undefined,
        );

        expect(prisma.payout.upsert).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ─── reconcilePendingPayments ─────────────────────────────────────────────

  describe('reconcilePendingPayments()', () => {
    const WALK_UNRESOLVED = {
      id:           'walk-1',
      walkerAmount: 1350,
      walkerId:     'walker-1',
      platformFee:  150,
      mpPaymentId:  'pref-abc',   // no numérico = todavía preference ID
      walker:       { mpAccessToken: 'walker-token-xyz' },
      participants: [{ ownerId: 'owner-1' }],
    };

    beforeEach(() => {
      // Reemplazar global.fetch en cada test de este bloque
      global.fetch = jest.fn();
    });

    it('(c) reconcilia un walk con pago approved: llama a walk.update y payout.upsert', async () => {
      prisma.walk.findMany.mockResolvedValue([WALK_UNRESOLVED]);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok:   true,
        json: async () => ({ results: [{ id: 99999, status: 'approved' }] }),
      });
      mockPaymentGet.mockResolvedValue(approvedPayment());
      prisma.walk.update.mockResolvedValue({});
      prisma.payout.upsert.mockResolvedValue({});

      await service.reconcilePendingPayments();

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'walk-1' } }),
      );
      expect(prisma.payout.upsert).toHaveBeenCalledTimes(1);
    });

    it('omite walks con mpPaymentId numérico (ya procesados como payment ID)', async () => {
      prisma.walk.findMany.mockResolvedValue([
        { ...WALK_UNRESOLVED, mpPaymentId: '99999' }, // numérico = ya procesado
      ]);

      await service.reconcilePendingPayments();

      expect(global.fetch).not.toHaveBeenCalled();
      expect(prisma.walk.update).not.toHaveBeenCalled();
    });

    it('no reconcilia si la búsqueda en MP no devuelve pagos approved', async () => {
      prisma.walk.findMany.mockResolvedValue([WALK_UNRESOLVED]);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok:   true,
        json: async () => ({ results: [] }),
      });

      await service.reconcilePendingPayments();

      expect(prisma.walk.update).not.toHaveBeenCalled();
    });

    it('un error en un walk no detiene el procesamiento del siguiente', async () => {
      const WALK_2 = { ...WALK_UNRESOLVED, id: 'walk-2', mpPaymentId: 'pref-def' };
      prisma.walk.findMany.mockResolvedValue([WALK_UNRESOLVED, WALK_2]);

      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({
          ok:   true,
          json: async () => ({ results: [{ id: 99999, status: 'approved' }] }),
        });
      mockPaymentGet.mockResolvedValue(
        approvedPayment({ external_reference: 'walk-2|owner-1' }),
      );
      prisma.walk.update.mockResolvedValue({});
      prisma.payout.upsert.mockResolvedValue({});

      await service.reconcilePendingPayments();

      // walk-2 debe haberse procesado aunque walk-1 haya fallado
      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'walk-2' } }),
      );
    });
  });

  // ─── Verificación de firma HMAC ───────────────────────────────────────────

  describe('handleWebhook() — firma HMAC con MP_WEBHOOK_SECRET configurado', () => {
    const WEBHOOK_SECRET = 'clave-de-prueba-para-hmac-tests';
    const DATA_ID        = '77777';
    const X_REQUEST_ID   = 'req-test-001';
    const TS             = '1700000000';

    let signedService: PaymentsService;
    let signedPrisma:  ReturnType<typeof buildPrismaMock>;

    // Construye el HMAC exactamente como lo hace verifyWebhookSignature en producción
    function computeHmac(dataId: string, requestId: string, ts: string): string {
      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
      return crypto.createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');
    }

    beforeEach(async () => {
      signedPrisma = buildPrismaMock();

      const configWithSecret = {
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            MP_ACCESS_TOKEN:   'platform-mp-token',
            FRONTEND_URL:      'http://localhost:3000',
            API_URL:           'http://localhost:3001',
            MP_WEBHOOK_SECRET: WEBHOOK_SECRET,
            MP_CLIENT_ID:      'client-id',
            MP_CLIENT_SECRET:  'client-secret',
          };
          return values[key] ?? null;
        }),
        getOrThrow: jest.fn((key: string) => {
          const values: Record<string, string> = {
            MP_CLIENT_ID:    'client-id',
            MP_CLIENT_SECRET: 'client-secret',
            API_URL:         'http://localhost:3001',
            JWT_SECRET:      'jwt-test-secret',
          };
          if (!values[key]) throw new Error(`Missing config: ${key}`);
          return values[key];
        }),
      };
      const cryptoMock = {
        encrypt: jest.fn((s: string) => s),
        decrypt: jest.fn((s: string) => s),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaymentsService,
          { provide: PrismaService, useValue: signedPrisma },
          { provide: ConfigService, useValue: configWithSecret },
          { provide: CryptoService, useValue: cryptoMock },
          { provide: JwtService,    useValue: new JwtService() },
          { provide: NotificationsService, useValue: buildNotificationsServiceMock() },
        ],
      }).compile();

      signedService = module.get<PaymentsService>(PaymentsService);
    });

    it('firma inválida → lanza UnauthorizedException y NO toca ninguna tabla de DB', async () => {
      const badSig = `ts=${TS},v1=${'0'.repeat(64)}`; // 64 ceros ≠ HMAC real

      await expect(
        signedService.handleWebhook(
          { type: 'payment', data: { id: DATA_ID } },
          badSig,
          X_REQUEST_ID,
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(signedPrisma.walk.findUnique).not.toHaveBeenCalled();
      expect(signedPrisma.walk.update).not.toHaveBeenCalled();
      expect(signedPrisma.payout.upsert).not.toHaveBeenCalled();
    });

    it('firma válida (HMAC correcto) → no lanza UnauthorizedException', async () => {
      const validV1  = computeHmac(DATA_ID, X_REQUEST_ID, TS);
      const validSig = `ts=${TS},v1=${validV1}`;

      // Tipo no 'payment' para confirmar que la firma pasó sin procesar nada más
      const result = await signedService.handleWebhook(
        { type: 'merchant_order', data: { id: DATA_ID } },
        validSig,
        X_REQUEST_ID,
      );

      expect(result).toEqual({ status: 'ignored' });
    });

    it('firma válida + pago aprobado → pasa verificación y procesa el pago', async () => {
      const validV1  = computeHmac(DATA_ID, X_REQUEST_ID, TS);
      const validSig = `ts=${TS},v1=${validV1}`;

      mockPaymentGet.mockResolvedValue(
        approvedPayment({ id: Number(DATA_ID), external_reference: 'walk-1|owner-1' }),
      );
      signedPrisma.walk.findUnique.mockResolvedValue(WALK_ROW);
      signedPrisma.walk.update.mockResolvedValue({});
      signedPrisma.payout.upsert.mockResolvedValue({});

      const result = await signedService.handleWebhook(
        { type: 'payment', data: { id: DATA_ID } },
        validSig,
        X_REQUEST_ID,
      );

      expect(result).toEqual({ status: 'processed' });
      expect(signedPrisma.walk.update).toHaveBeenCalledTimes(1);
      expect(signedPrisma.payout.upsert).toHaveBeenCalledTimes(1);
    });

    it('firma con ts alterado → lanza UnauthorizedException (HMAC no coincide)', async () => {
      const validV1     = computeHmac(DATA_ID, X_REQUEST_ID, TS);
      const tamperedSig = `ts=9999999999,v1=${validV1}`; // ts cambiado → manifest distinto

      await expect(
        signedService.handleWebhook(
          { type: 'payment', data: { id: DATA_ID } },
          tamperedSig,
          X_REQUEST_ID,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── Fail-loud: sin MP_WEBHOOK_SECRET en producción ───────────────────────

  describe('handleWebhook() — sin MP_WEBHOOK_SECRET configurado', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    async function buildServiceWithoutWebhookSecret() {
      const noSecretPrisma = buildPrismaMock();
      const noSecretConfig = {
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            MP_ACCESS_TOKEN: 'platform-mp-token',
            FRONTEND_URL:    'http://localhost:3000',
            API_URL:         'http://localhost:3001',
            // MP_WEBHOOK_SECRET deliberadamente ausente
            MP_CLIENT_ID:     'client-id',
            MP_CLIENT_SECRET: 'client-secret',
          };
          return values[key] ?? null;
        }),
        getOrThrow: jest.fn((key: string) => {
          const values: Record<string, string> = {
            MP_CLIENT_ID:     'client-id',
            MP_CLIENT_SECRET: 'client-secret',
            API_URL:          'http://localhost:3001',
            JWT_SECRET:       'jwt-test-secret',
          };
          if (!values[key]) throw new Error(`Missing config: ${key}`);
          return values[key];
        }),
      };
      const cryptoMock = {
        encrypt: jest.fn((s: string) => s),
        decrypt: jest.fn((s: string) => s),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaymentsService,
          { provide: PrismaService, useValue: noSecretPrisma },
          { provide: ConfigService, useValue: noSecretConfig },
          { provide: CryptoService, useValue: cryptoMock },
          { provide: JwtService,    useValue: new JwtService() },
          { provide: NotificationsService, useValue: buildNotificationsServiceMock() },
        ],
      }).compile();

      return {
        noSecretService: module.get<PaymentsService>(PaymentsService),
        noSecretPrisma,
      };
    }

    it('NODE_ENV=production sin secret → UnauthorizedException y NO procesa el pago', async () => {
      process.env.NODE_ENV = 'production';
      const { noSecretService, noSecretPrisma } = await buildServiceWithoutWebhookSecret();

      await expect(
        noSecretService.handleWebhook(
          { type: 'payment', data: { id: '99999' } },
          'ts=1700000000,v1=cualquiervalor',
          'req-1',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(noSecretPrisma.walk.findUnique).not.toHaveBeenCalled();
      expect(noSecretPrisma.walk.update).not.toHaveBeenCalled();
      expect(noSecretPrisma.payout.upsert).not.toHaveBeenCalled();
    });

    it('fuera de producción sin secret → loguea warning y sigue procesando (no rompe tests/dev)', async () => {
      process.env.NODE_ENV = 'test';
      const { noSecretService, noSecretPrisma } = await buildServiceWithoutWebhookSecret();

      mockPaymentGet.mockResolvedValue(approvedPayment());
      noSecretPrisma.walk.findUnique.mockResolvedValue(WALK_ROW);
      noSecretPrisma.walk.update.mockResolvedValue({});
      noSecretPrisma.payout.upsert.mockResolvedValue({});

      const result = await noSecretService.handleWebhook(
        { type: 'payment', data: { id: '99999' } },
        'ts=1700000000,v1=cualquiervalor',
        'req-1',
      );

      expect(result).toEqual({ status: 'processed' });
    });
  });

  // ─── Fail-loud: webhook sin headers de firma en producción ────────────────

  describe('handleWebhook() — sin x-signature / x-request-id', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('NODE_ENV=production sin headers → UnauthorizedException y NO procesa el pago', async () => {
      process.env.NODE_ENV = 'production';

      await expect(
        service.handleWebhook(
          { type: 'payment', data: { id: '99999' } },
          undefined,
          undefined,
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.walk.findUnique).not.toHaveBeenCalled();
      expect(prisma.walk.update).not.toHaveBeenCalled();
      expect(prisma.payout.upsert).not.toHaveBeenCalled();
    });

    it('NODE_ENV=production con solo x-signature (sin x-request-id) → UnauthorizedException', async () => {
      process.env.NODE_ENV = 'production';

      await expect(
        service.handleWebhook(
          { type: 'payment', data: { id: '99999' } },
          'ts=1700000000,v1=cualquiervalor',
          undefined,
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.walk.update).not.toHaveBeenCalled();
    });

    it('fuera de producción sin headers → sigue procesando como hoy (dev/tests)', async () => {
      process.env.NODE_ENV = 'test';

      mockPaymentGet.mockResolvedValue(approvedPayment());
      prisma.walk.findUnique.mockResolvedValue(WALK_ROW);
      prisma.walk.update.mockResolvedValue({});
      prisma.payout.upsert.mockResolvedValue({});

      const result = await service.handleWebhook(
        { type: 'payment', data: { id: '99999' } },
        undefined,
        undefined,
      );

      expect(result).toEqual({ status: 'processed' });
    });
  });

  // ─── OAuth state firmado (CSRF) ────────────────────────────────────────────

  describe('getWalkerConnectUrl() / handleWalkerCallback() — state firmado', () => {
    const VICTIM_USER_ID   = 'owner-user-victima';
    const ATTACKER_USER_ID = 'owner-user-atacante';

    let oauthService: PaymentsService;
    let oauthPrisma:  ReturnType<typeof buildPrismaMock>;
    let realJwt:       JwtService;

    beforeEach(async () => {
      oauthPrisma = buildPrismaMock();
      realJwt = new JwtService();

      const cryptoMock = {
        encrypt: jest.fn((s: string) => s),
        decrypt: jest.fn((s: string) => s),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaymentsService,
          { provide: PrismaService, useValue: oauthPrisma },
          { provide: ConfigService, useValue: buildConfigMock() },
          { provide: CryptoService, useValue: cryptoMock },
          { provide: JwtService,    useValue: realJwt },
          { provide: NotificationsService, useValue: buildNotificationsServiceMock() },
        ],
      }).compile();

      oauthService = module.get<PaymentsService>(PaymentsService);
    });

    it('getWalkerConnectUrl: el state es un JWT firmado, no el userId crudo', () => {
      const { url } = oauthService.getWalkerConnectUrl(VICTIM_USER_ID);

      // El userId no debe aparecer en texto plano como state=<userId>
      expect(url).not.toContain(`state=${VICTIM_USER_ID}`);

      const stateParam = decodeURIComponent(new URL(url).searchParams.get('state') ?? '');
      expect(stateParam.split('.')).toHaveLength(3); // luce como un JWT (header.payload.signature)

      const decoded = realJwt.decode(stateParam) as { sub: string; purpose: string; exp: number };
      expect(decoded.sub).toBe(VICTIM_USER_ID);
      expect(decoded.purpose).toBe('mp-connect');
      expect(decoded.exp).toBeDefined();
    });

    it('handleWalkerCallback: acepta un state válido y usa el userId extraído del token', async () => {
      const state = oauthService.getWalkerConnectUrl(VICTIM_USER_ID);
      const stateToken = decodeURIComponent(new URL(state.url).searchParams.get('state') ?? '');

      oauthPrisma.walkerProfile.findUnique.mockResolvedValue({ id: 'wp-victima', userId: VICTIM_USER_ID });
      oauthPrisma.walkerProfile.update.mockResolvedValue({});
      global.fetch = jest.fn().mockResolvedValue({
        ok:   true,
        json: async () => ({ access_token: 'mp-access-token', user_id: 555 }),
      });

      await oauthService.handleWalkerCallback('auth-code', stateToken);

      expect(oauthPrisma.walkerProfile.findUnique).toHaveBeenCalledWith({ where: { userId: VICTIM_USER_ID } });
      expect(oauthPrisma.walkerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: VICTIM_USER_ID } }),
      );
    });

    it('CSRF: un state forjado con el userId de otro usuario (token firmado con secret distinto) es rechazado', async () => {
      // El atacante intenta forjar un callback con el userId de la víctima, pero no conoce JWT_SECRET
      const forgedState = new JwtService().sign(
        { sub: VICTIM_USER_ID, purpose: 'mp-connect' },
        { secret: 'secret-del-atacante', expiresIn: '10m' },
      );

      await expect(
        oauthService.handleWalkerCallback('attacker-code', forgedState),
      ).rejects.toThrow(UnauthorizedException);

      expect(oauthPrisma.walkerProfile.findUnique).not.toHaveBeenCalled();
      expect(oauthPrisma.walkerProfile.update).not.toHaveBeenCalled();
    });

    it('CSRF: el viejo ataque (state = userId crudo de la víctima) ya no funciona', async () => {
      // Antes del fix, un atacante podía mandar state=<userId de la víctima> directamente
      await expect(
        oauthService.handleWalkerCallback('attacker-code', VICTIM_USER_ID),
      ).rejects.toThrow(UnauthorizedException);

      expect(oauthPrisma.walkerProfile.findUnique).not.toHaveBeenCalled();
    });

    it('rechaza un state expirado', async () => {
      const expiredState = realJwt.sign(
        { sub: VICTIM_USER_ID, purpose: 'mp-connect' },
        { secret: 'jwt-test-secret', expiresIn: '-10s' }, // ya vencido
      );

      await expect(
        oauthService.handleWalkerCallback('auth-code', expiredState),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza un token válido pero con purpose distinto (no reusable para otros flujos)', async () => {
      const wrongPurposeState = realJwt.sign(
        { sub: VICTIM_USER_ID, purpose: 'otro-purpose' },
        { secret: 'jwt-test-secret', expiresIn: '10m' },
      );

      await expect(
        oauthService.handleWalkerCallback('auth-code', wrongPurposeState),
      ).rejects.toThrow(UnauthorizedException);

      expect(oauthPrisma.walkerProfile.findUnique).not.toHaveBeenCalled();
    });

    it('el atacante no puede reusar su propio state válido para conectar la cuenta de la víctima', async () => {
      // El atacante firma un state legítimo para SU PROPIO userId (vía el flujo normal)
      const attackerFlow = oauthService.getWalkerConnectUrl(ATTACKER_USER_ID);
      const attackerState = decodeURIComponent(new URL(attackerFlow.url).searchParams.get('state') ?? '');

      oauthPrisma.walkerProfile.findUnique.mockResolvedValue({ id: 'wp-atacante', userId: ATTACKER_USER_ID });
      oauthPrisma.walkerProfile.update.mockResolvedValue({});
      global.fetch = jest.fn().mockResolvedValue({
        ok:   true,
        json: async () => ({ access_token: 'mp-access-token', user_id: 555 }),
      });

      await oauthService.handleWalkerCallback('attacker-code', attackerState);

      // El token conecta la cuenta MP del ATACANTE, nunca la de la víctima
      expect(oauthPrisma.walkerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: ATTACKER_USER_ID } }),
      );
      expect(oauthPrisma.walkerProfile.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: VICTIM_USER_ID } }),
      );
    });
  });
});
