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
import { Preference, Payment } from 'mercadopago';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    ownerProfile:    { findUnique: jest.fn() },
    walkParticipant: { findFirst: jest.fn() },
    walk:            { findUnique: jest.fn(), update: jest.fn() },
    payout:          { upsert: jest.fn() },
  };
}

function buildConfigMock() {
  const values: Record<string, string> = {
    MP_ACCESS_TOKEN: 'platform-mp-token',
    FRONTEND_URL:    'http://localhost:3000',
    API_URL:         'http://localhost:3001',
    MP_WEBHOOK_SECRET: '',      // empty → skip signature verification in tests
    MP_CLIENT_ID:    'client-id',
    MP_CLIENT_SECRET: 'client-secret',
  };
  return {
    get: jest.fn((key: string) => values[key] ?? null),
    getOrThrow: jest.fn((key: string) => {
      if (!values[key]) throw new Error(`Missing config: ${key}`);
      return values[key];
    }),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService,  useValue: prisma },
        { provide: ConfigService,  useValue: config },
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

    it('lanza BadRequestException si el walk ya tiene mpPaymentId', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue(PARTICIPANT);
      prisma.walk.findUnique.mockResolvedValue({ ...WALK_BASE, mpPaymentId: 'existing-123' });
      await expect(service.createPreference('user-1', DTO))
        .rejects.toThrow(BadRequestException);
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

  // ─── handleWebhook ────────────────────────────────────────────────────────

  describe('handleWebhook()', () => {
    const WALK_ROW = {
      id:           'walk-1',
      walkerAmount: 1350,
      walkerId:     'walker-1',
      platformFee:  150,
    };

    function approvedPayment(overrides: Partial<{
      net_amount: number | null;
      external_reference: string;
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

    it('devuelve { status: "walk_not_found" } si no existe el walk', async () => {
      mockPaymentGet.mockResolvedValue(approvedPayment());
      prisma.walk.findUnique.mockResolvedValue(null);

      const result = await service.handleWebhook(
        { type: 'payment', data: { id: '99999' } },
        undefined, undefined,
      );
      expect(result).toEqual({ status: 'walk_not_found' });
    });

    it('pago aprobado: llama a walk.update con net_amount como walkerAmount', async () => {
      mockPaymentGet.mockResolvedValue(approvedPayment({ net_amount: 1350 }));
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
          data:  expect.objectContaining({ walkerAmount: 1350 }),
        }),
      );
    });

    it('pago aprobado: usa walk.walkerAmount si net_amount es null', async () => {
      mockPaymentGet.mockResolvedValue(approvedPayment({ net_amount: null }));
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

    it('pago aprobado: llama a payout.upsert con walkerId y monto correcto', async () => {
      mockPaymentGet.mockResolvedValue(approvedPayment({ net_amount: 1350 }));
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
      expect(upsertCall.create.amount).toBe(1350);
      expect(upsertCall.create.status).toBe(PayoutStatus.PENDING);
      expect(upsertCall.update.amount).toEqual({ increment: 1350 });
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
});
