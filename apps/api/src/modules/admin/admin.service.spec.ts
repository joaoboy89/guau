import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { VerificationStatus, WalkStatus } from '@prisma/client';
import { NOTIFICATION_TYPES } from '@guau/shared';
import { AdminService } from './admin.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WALKER_PROFILE_ID = 'wp-1';
const WALKER_USER_ID    = 'wu-1';
const ADMIN_ID           = 'admin-1';
const ADMIN_EMAIL        = 'admin@guau.com';

const BASE_WALKER_PROFILE = {
  id:                 WALKER_PROFILE_ID,
  userId:             WALKER_USER_ID,
  verificationStatus: VerificationStatus.PENDING,
  verificationNotes:  null as string | null,
  user: { id: WALKER_USER_ID, firstName: 'Juan', email: 'juan@test.com' },
};

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
      count:      jest.fn(),
      findUnique: jest.fn(),
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
    prisma.user.findUnique.mockResolvedValue({ email: ADMIN_EMAIL });

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

  // ─── getWalkers() ─────────────────────────────────────────────────────────

  describe('getWalkers()', () => {
    it('camino feliz: filtra por status, pagina, y el select no trae DNI/selfie ni campos de OAuth', async () => {
      const profiles = [BASE_WALKER_PROFILE];
      prisma.walkerProfile.findMany.mockResolvedValue(profiles);
      prisma.walkerProfile.count.mockResolvedValue(1);

      const result = await service.getWalkers({ status: VerificationStatus.PENDING, page: 1, limit: 20 });

      expect(prisma.walkerProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where:  { verificationStatus: VerificationStatus.PENDING },
          select: expect.objectContaining({ user: expect.anything() }),
          skip: 0,
          take: 20,
        }),
      );
      const callArg = prisma.walkerProfile.findMany.mock.calls[0][0];
      expect(callArg.select).not.toHaveProperty('dniNumber');
      expect(callArg.select).not.toHaveProperty('dniPhotoUrl');
      expect(callArg.select).not.toHaveProperty('selfieUrl');
      expect(callArg.select).not.toHaveProperty('mpAccessToken');
      expect(callArg.select).not.toHaveProperty('mpUserId');
      expect(result).toEqual({ data: profiles, meta: { total: 1, page: 1, limit: 20, totalPages: 1 } });
    });

    it('tambien puede filtrar por SUSPENDED (la pantalla necesita ver ambas colas)', async () => {
      prisma.walkerProfile.findMany.mockResolvedValue([]);
      prisma.walkerProfile.count.mockResolvedValue(0);

      await service.getWalkers({ status: VerificationStatus.SUSPENDED, page: 1, limit: 20 });

      expect(prisma.walkerProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { verificationStatus: VerificationStatus.SUSPENDED } }),
      );
    });

    it('pagina: page 2 con limit 10 pide skip 10', async () => {
      prisma.walkerProfile.findMany.mockResolvedValue([]);
      prisma.walkerProfile.count.mockResolvedValue(25);

      const result = await service.getWalkers({ status: VerificationStatus.PENDING, page: 2, limit: 10 });

      expect(prisma.walkerProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(result.meta).toEqual({ total: 25, page: 2, limit: 10, totalPages: 3 });
    });
  });

  // ─── verifyWalker() ───────────────────────────────────────────────────────

  describe('verifyWalker()', () => {
    it('lanza BadRequestException si action es "reject" y no viene notes', async () => {
      await expect(service.verifyWalker(WALKER_PROFILE_ID, { action: 'reject' }, ADMIN_ID))
        .rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si action es "suspend" y no viene notes', async () => {
      await expect(service.verifyWalker(WALKER_PROFILE_ID, { action: 'suspend' }, ADMIN_ID))
        .rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si action es "reinstate" y no viene notes', async () => {
      await expect(service.verifyWalker(WALKER_PROFILE_ID, { action: 'reinstate' }, ADMIN_ID))
        .rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el walkerProfile no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.verifyWalker(WALKER_PROFILE_ID, { action: 'approve' }, ADMIN_ID))
        .rejects.toThrow(NotFoundException);
    });

    it('REJECTED es terminal: cualquier accion sobre un rechazado tira ConflictException', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue({
        ...BASE_WALKER_PROFILE,
        verificationStatus: VerificationStatus.REJECTED,
      });

      await expect(service.verifyWalker(WALKER_PROFILE_ID, { action: 'approve' }, ADMIN_ID))
        .rejects.toThrow(ConflictException);
      await expect(
        service.verifyWalker(WALKER_PROFILE_ID, { action: 'suspend', notes: 'x' }, ADMIN_ID),
      ).rejects.toThrow(ConflictException);
      expect(prisma.walkerProfile.update).not.toHaveBeenCalled();
    });

    it('"reinstate" solo es valido desde SUSPENDED — desde PENDING tira ConflictException', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue({
        ...BASE_WALKER_PROFILE,
        verificationStatus: VerificationStatus.PENDING,
      });

      await expect(
        service.verifyWalker(WALKER_PROFILE_ID, { action: 'reinstate', notes: 'motivo' }, ADMIN_ID),
      ).rejects.toThrow(ConflictException);
      expect(prisma.walkerProfile.update).not.toHaveBeenCalled();
    });

    it('"approve" sobre un SUSPENDED tira ConflictException — el camino de vuelta es "reinstate"', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue({
        ...BASE_WALKER_PROFILE,
        verificationStatus: VerificationStatus.SUSPENDED,
      });

      await expect(service.verifyWalker(WALKER_PROFILE_ID, { action: 'approve' }, ADMIN_ID))
        .rejects.toThrow(ConflictException);
      expect(prisma.walkerProfile.update).not.toHaveBeenCalled();
    });

    it('action "approve": pasa a VERIFIED, guarda metodo/fecha/admin y notifica con WALK_CONFIRMED', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER_PROFILE);
      const updated = { ...BASE_WALKER_PROFILE, verificationStatus: VerificationStatus.VERIFIED };
      prisma.walkerProfile.update.mockResolvedValue(updated);

      const result = await service.verifyWalker(WALKER_PROFILE_ID, { action: 'approve' }, ADMIN_ID);

      expect(prisma.walkerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: WALKER_PROFILE_ID },
          data:  expect.objectContaining({
            verificationStatus: VerificationStatus.VERIFIED,
            verificationMethod: 'PERSONAL',
            verifiedAt: expect.any(Date),
            verifiedById: ADMIN_ID,
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

    it('action "reject" con notes: pasa a REJECTED y notifica con WALK_REJECTED', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER_PROFILE);
      const updated = {
        ...BASE_WALKER_PROFILE,
        verificationStatus: VerificationStatus.REJECTED,
      };
      prisma.walkerProfile.update.mockResolvedValue(updated);

      const result = await service.verifyWalker(
        WALKER_PROFILE_ID,
        { action: 'reject', notes: 'Foto ilegible' },
        ADMIN_ID,
      );

      expect(prisma.walkerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            verificationStatus: VerificationStatus.REJECTED,
            verificationNotes: expect.stringContaining('RECHAZADO por admin@guau.com: Foto ilegible'),
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
    });

    it('action "suspend" con notes: pasa a SUSPENDED y notifica con WALKER_SUSPENDED', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue({
        ...BASE_WALKER_PROFILE,
        verificationStatus: VerificationStatus.VERIFIED,
      });
      prisma.walkerProfile.update.mockResolvedValue({
        ...BASE_WALKER_PROFILE,
        verificationStatus: VerificationStatus.SUSPENDED,
      });

      await service.verifyWalker(
        WALKER_PROFILE_ID,
        { action: 'suspend', notes: 'Denuncia de un dueño, en revision' },
        ADMIN_ID,
      );

      expect(prisma.walkerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ verificationStatus: VerificationStatus.SUSPENDED }),
        }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NOTIFICATION_TYPES.WALKER_SUSPENDED }),
      );
    });

    it('action "reinstate" desde SUSPENDED con notes: vuelve a VERIFIED y notifica con WALKER_REINSTATED', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue({
        ...BASE_WALKER_PROFILE,
        verificationStatus: VerificationStatus.SUSPENDED,
        verificationNotes: '[2026-09-01] SUSPENDIDO por admin@guau.com: denuncia',
      });
      prisma.walkerProfile.update.mockResolvedValue({
        ...BASE_WALKER_PROFILE,
        verificationStatus: VerificationStatus.VERIFIED,
      });

      await service.verifyWalker(
        WALKER_PROFILE_ID,
        { action: 'reinstate', notes: 'Se aclaro el malentendido' },
        ADMIN_ID,
      );

      expect(prisma.walkerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            verificationStatus: VerificationStatus.VERIFIED,
            // Append, no overwrite: la nota vieja de la suspension sigue ahi.
            verificationNotes: expect.stringContaining('[2026-09-01] SUSPENDIDO por admin@guau.com: denuncia'),
          }),
        }),
      );
      const savedNotes = prisma.walkerProfile.update.mock.calls[0][0].data.verificationNotes;
      expect(savedNotes).toContain('REACTIVADO por admin@guau.com: Se aclaro el malentendido');
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NOTIFICATION_TYPES.WALKER_REINSTATED }),
      );
    });

    it('las notas se ACUMULAN, nunca se pisan: approve sin nota no borra el historial existente', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue({
        ...BASE_WALKER_PROFILE,
        verificationNotes: '[2026-08-01] RECHAZADO por otro@guau.com: motivo viejo',
      });
      prisma.walkerProfile.update.mockResolvedValue(BASE_WALKER_PROFILE);

      await service.verifyWalker(WALKER_PROFILE_ID, { action: 'approve' }, ADMIN_ID);

      expect(prisma.walkerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            verificationNotes: '[2026-08-01] RECHAZADO por otro@guau.com: motivo viejo',
          }),
        }),
      );
    });
  });

  // ─── getStats() ───────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('camino feliz: arma walkerStatusMap y walkStatusMap con valores concretos; status ausente devuelve 0', async () => {
      // walkersByStatus: VERIFIED=5, PENDING=3 — SUSPENDED/REJECTED ausentes → deben devolver 0
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

      // walkers: SUSPENDED/REJECTED ausentes → 0
      expect(result.walkers).toEqual({
        pending:   3,
        verified:  5,
        suspended: 0,
        rejected:  0,
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
});
