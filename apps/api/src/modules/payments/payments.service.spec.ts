import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { WalkStatus, PayoutStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';

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
const WALK_BASE = {
  id: 'walk-1',
  walkTypeId: 'wt-1',
  status: WalkStatus.CONFIRMED,
  mpPaymentId: null as string | null,
  platformFee: 150,
  walkerAmount: 1350,
  mode: 'EXCLUSIVO',
  pickupAddress: 'Palermo',
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

  beforeEach(async () => {
    prisma = buildPrismaMock();
    config = buildConfigMock();

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
});
