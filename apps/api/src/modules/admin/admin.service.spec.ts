import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { VerificationStatus, WalkStatus, PayoutStatus, UserRole } from '@prisma/client';
import { NOTIFICATION_TYPES } from '@guau/shared';
import { AdminService } from './admin.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WALKER_PROFILE_ID = 'wp-1';
const WALKER_USER_ID    = 'wu-1';

const BASE_WALKER_PROFILE = {
  id:                 WALKER_PROFILE_ID,
  userId:             WALKER_USER_ID,
  verificationStatus: VerificationStatus.PENDING,
  user: { id: WALKER_USER_ID, firstName: 'Juan' },
};

// Payouts con estructura completa que usa processPayouts()
const PENDING_PAYOUTS = [
  { id: 'pay-1', amount: 1500, walker: { user: { id: 'wu-1', firstName: 'Juan' } } },
  { id: 'pay-2', amount: 2500, walker: { user: { id: 'wu-2', firstName: 'María' } } },
];

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    walkerProfile: {
      findMany:  jest.fn(),
      findUnique: jest.fn(),
      update:    jest.fn(),
      groupBy:   jest.fn(),
      count:     jest.fn(),
    },
    walk: {
      findMany:  jest.fn(),
      count:     jest.fn(),
      groupBy:   jest.fn(),
      aggregate: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    payout: {
      findMany:   jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AdminService', () => {
  let service:       AdminService;
  let prisma:        ReturnType<typeof buildPrismaMock>;
  let notifications: { create: jest.Mock };

  beforeEach(async () => {
    prisma        = buildPrismaMock();
    notifications = { create: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService,        useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getPendingWalkers() ──────────────────────────────────────────────────

  describe('getPendingWalkers()', () => {
    it('camino feliz: llama a walkerProfile.findMany con filtro PENDING y select explícito (sin mpAccessToken)', async () => {
      const profiles = [BASE_WALKER_PROFILE];
      prisma.walkerProfile.findMany.mockResolvedValue(profiles);

      const result = await service.getPendingWalkers();

      expect(prisma.walkerProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where:  { verificationStatus: VerificationStatus.PENDING },
          select: expect.objectContaining({ user: expect.anything() }),
        }),
      );
      // El select no debe incluir campos sensibles de OAuth
      const callArg = prisma.walkerProfile.findMany.mock.calls[0][0];
      expect(callArg.select).not.toHaveProperty('mpAccessToken');
      expect(callArg.select).not.toHaveProperty('mpUserId');
      expect(result).toEqual(profiles);
    });
  });

  // ─── verifyWalker() ───────────────────────────────────────────────────────

  describe('verifyWalker()', () => {
    it('lanza BadRequestException si action es "reject" y no viene notes', async () => {
      await expect(service.verifyWalker(WALKER_PROFILE_ID, { action: 'reject' }))
        .rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el walkerProfile no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.verifyWalker(WALKER_PROFILE_ID, { action: 'approve' }))
        .rejects.toThrow(NotFoundException);
    });

    it('action "approve": actualiza a VERIFIED y notifica con WALK_CONFIRMED', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER_PROFILE);
      const updated = { ...BASE_WALKER_PROFILE, verificationStatus: VerificationStatus.VERIFIED };
      prisma.walkerProfile.update.mockResolvedValue(updated);

      const result = await service.verifyWalker(WALKER_PROFILE_ID, { action: 'approve' });

      expect(prisma.walkerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: WALKER_PROFILE_ID },
          data:  expect.objectContaining({
            verificationStatus: VerificationStatus.VERIFIED,
          }),
        }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: WALKER_USER_ID,
          type:   NOTIFICATION_TYPES.WALK_CONFIRMED,
        }),
      );
      expect(result).toEqual(updated);
      expect(result).not.toHaveProperty('mpAccessToken');
      expect(result).not.toHaveProperty('mpUserId');
    });

    it('action "reject" con notes: actualiza a REJECTED con verificationNotes y notifica con WALK_REJECTED', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER_PROFILE);
      const updated = {
        ...BASE_WALKER_PROFILE,
        verificationStatus: VerificationStatus.REJECTED,
        verificationNotes: 'Foto ilegible',
      };
      prisma.walkerProfile.update.mockResolvedValue(updated);

      const result = await service.verifyWalker(WALKER_PROFILE_ID, {
        action: 'reject',
        notes:  'Foto ilegible',
      });

      expect(prisma.walkerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            verificationStatus: VerificationStatus.REJECTED,
            verificationNotes:  'Foto ilegible',
          }),
        }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: WALKER_USER_ID,
          type:   NOTIFICATION_TYPES.WALK_REJECTED,
        }),
      );
      expect(result).toEqual(updated);
      expect(result).not.toHaveProperty('mpAccessToken');
      expect(result).not.toHaveProperty('mpUserId');
    });
  });

  // ─── getAllWalks() ────────────────────────────────────────────────────────

  describe('getAllWalks()', () => {
    it('sin filtros: llama a findMany + count en paralelo y devuelve { data, meta } con defaults page=1 limit=20', async () => {
      const walks = [{ id: 'w1' }];
      prisma.walk.findMany.mockResolvedValue(walks);
      prisma.walk.count.mockResolvedValue(1);

      const result = await service.getAllWalks({});

      expect(prisma.walk.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.walk.count).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        data: walks,
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
    });

    it('con status y walkerId: se agregan como filtros en el where', async () => {
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(0);

      await service.getAllWalks({ status: 'PENDING', walkerId: 'wp-99' });

      const expected = expect.objectContaining({
        where: { status: WalkStatus.PENDING, walkerId: 'wp-99' },
      });
      expect(prisma.walk.findMany).toHaveBeenCalledWith(expected);
      expect(prisma.walk.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: WalkStatus.PENDING, walkerId: 'wp-99' } }),
      );
    });

    it('con page/limit custom: skip = (page-1)*limit y totalPages = ceil(total/limit)', async () => {
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(45);

      const result = await service.getAllWalks({ page: 3, limit: 10 });

      // skip = (3-1)*10 = 20
      expect(prisma.walk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      // totalPages = ceil(45/10) = 5
      expect(result.meta).toEqual({ total: 45, page: 3, limit: 10, totalPages: 5 });
    });
  });

  // ─── getStats() ───────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('camino feliz: arma walkerStatusMap y walkStatusMap con valores concretos; status ausente devuelve 0', async () => {
      // walkersByStatus: VERIFIED=5, PENDING=3 — REJECTED ausente → debe devolver 0
      const walkersByStatus = [
        { verificationStatus: VerificationStatus.VERIFIED, _count: 5 },
        { verificationStatus: VerificationStatus.PENDING,  _count: 3 },
      ];
      // walksByStatus: COMPLETED=10, PENDING=2
      const walksByStatus = [
        { status: WalkStatus.COMPLETED, _count: 10 },
        { status: WalkStatus.PENDING,   _count: 2  },
      ];

      // Los 8 valores del Promise.all en orden:
      prisma.user.count
        .mockResolvedValueOnce(100)   // totalOwners
        .mockResolvedValueOnce(50);   // totalWalkers
      prisma.walkerProfile.groupBy.mockResolvedValue(walkersByStatus);
      prisma.walk.groupBy.mockResolvedValue(walksByStatus);
      prisma.walk.aggregate
        .mockResolvedValueOnce({      // revenueTotal
          _sum: { platformFee: 1500, totalAmount: 10000, walkerAmount: 8500 },
        })
        .mockResolvedValueOnce({      // revenueThisWeek
          _sum: { platformFee: 300, totalAmount: 2000 },
        });
      prisma.walkerProfile.count.mockResolvedValue(12); // activeWalkers
      prisma.walk.count.mockResolvedValue(8);           // completedThisWeek

      const result = await service.getStats();

      // Usuarios
      expect(result.users).toEqual({ totalOwners: 100, totalWalkers: 50, total: 150 });

      // walkers: REJECTED ausente → 0
      expect(result.walkers).toEqual({
        pending:   3,
        verified:  5,
        rejected:  0,   // no estaba en walkersByStatus
        activeNow: 12,
      });

      // walks: byStatus y total (reduce de _count)
      expect(result.walks.byStatus).toEqual({ COMPLETED: 10, PENDING: 2 });
      expect(result.walks.total).toBe(12); // 10 + 2
      expect(result.walks.completedThisWeek).toBe(8);

      // revenue
      expect(result.revenue).toEqual({
        totalGross:       10000,
        totalPlatformFee:  1500,
        totalWalkerPaid:   8500,
        thisWeekGross:     2000,
        thisWeekFee:        300,
      });
    });
  });

  // ─── processPayouts() ─────────────────────────────────────────────────────

  describe('processPayouts()', () => {
    it('sin pagos pendientes: devuelve { processed: 0 } sin llamar a updateMany', async () => {
      prisma.payout.findMany.mockResolvedValue([]);

      const result = await service.processPayouts();

      expect(result).toEqual({
        processed: 0,
        message:   'No hay pagos pendientes para procesar',
      });
      expect(prisma.payout.updateMany).not.toHaveBeenCalled();
    });

    it('con pagos pendientes: llama a updateMany dos veces (PROCESSING → COMPLETED)', async () => {
      prisma.payout.findMany.mockResolvedValue(PENDING_PAYOUTS);
      prisma.payout.updateMany.mockResolvedValue({});

      await service.processPayouts();

      expect(prisma.payout.updateMany).toHaveBeenCalledTimes(2);
      // Primera llamada: PROCESSING
      expect(prisma.payout.updateMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: { status: PayoutStatus.PROCESSING } }),
      );
      // Segunda llamada: COMPLETED
      expect(prisma.payout.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ data: { status: PayoutStatus.COMPLETED } }),
      );
    });

    it('con pagos pendientes: llama a notifications.create una vez por payout', async () => {
      prisma.payout.findMany.mockResolvedValue(PENDING_PAYOUTS);
      prisma.payout.updateMany.mockResolvedValue({});

      await service.processPayouts();

      expect(notifications.create).toHaveBeenCalledTimes(PENDING_PAYOUTS.length);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: PENDING_PAYOUTS[0].walker.user.id,
          type:   NOTIFICATION_TYPES.WALK_COMPLETED,
        }),
      );
    });

    it('con pagos pendientes: calcula totalTransferred sumando amounts y devuelve conteo correcto', async () => {
      prisma.payout.findMany.mockResolvedValue(PENDING_PAYOUTS);
      prisma.payout.updateMany.mockResolvedValue({});

      const result = await service.processPayouts();

      const expectedTotal = PENDING_PAYOUTS.reduce((s, p) => s + p.amount, 0); // 4000
      expect(result).toMatchObject({
        processed:        PENDING_PAYOUTS.length,
        totalTransferred: expectedTotal,
      });
    });
  });
});
