import { Test, TestingModule } from '@nestjs/testing';
import { WalkExpirationService } from './walk-expiration.service';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../../common/services/mail.service';
import { WalkStatus, NotPerformedReason } from '@prisma/client';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_CANDIDATE = {
  id: 'walk-1',
  scheduledAt: new Date('2026-08-14T12:00:00.000Z'),
  mpPaymentId: null as string | null,
  totalAmount: 1000,
  walkType: { durationMinutes: 30 },
  walker: { user: { firstName: 'Juan', lastName: 'Pérez' } },
  participants: [
    { owner: { user: { firstName: 'Ana', lastName: 'Gómez', email: 'ana@test.com' } } },
  ],
};

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    walk: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

function buildMailMock() {
  return { sendNotPerformedAlert: jest.fn() };
}

// markNotPerformed() llama a findMany exactamente 3 veces, siempre en el
// mismo orden: never-confirmed, walker-no-show, nobody-acted. Encadenar
// mockResolvedValueOnce en ese orden es más simple y más robusto que
// inspeccionar la forma del `where` de cada llamada.
function mockThreePasses(prisma: ReturnType<typeof buildPrismaMock>, passes: unknown[][]) {
  const [neverConfirmed, walkerNoShow, nobodyActed] = passes;
  prisma.walk.findMany
    .mockResolvedValueOnce(neverConfirmed)
    .mockResolvedValueOnce(walkerNoShow)
    .mockResolvedValueOnce(nobodyActed);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WalkExpirationService', () => {
  let service: WalkExpirationService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let mail: ReturnType<typeof buildMailMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    mail = buildMailMock();
    prisma.walk.updateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalkExpirationService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = module.get<WalkExpirationService>(WalkExpirationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Las tres condiciones ──────────────────────────────────────────────────

  describe('markNotPerformed() — las tres condiciones', () => {
    it('PENDING vencido → NEVER_CONFIRMED', async () => {
      mockThreePasses(prisma, [[BASE_CANDIDATE], [], []]);

      await service.markNotPerformed();

      expect(prisma.walk.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.walk.updateMany).toHaveBeenCalledWith({
        where: { id: 'walk-1', status: { in: [WalkStatus.PENDING] } },
        data: expect.objectContaining({
          status: WalkStatus.NOT_PERFORMED,
          notPerformedReason: NotPerformedReason.NEVER_CONFIRMED,
          notPerformedAt: expect.any(Date),
        }),
      });
    });

    it('CONFIRMED sin onWayAt, vencido T+5m → WALKER_NO_SHOW', async () => {
      mockThreePasses(prisma, [[], [BASE_CANDIDATE], []]);

      await service.markNotPerformed();

      expect(prisma.walk.updateMany).toHaveBeenCalledWith({
        where: { id: 'walk-1', status: { in: [WalkStatus.CONFIRMED] } },
        data: expect.objectContaining({ notPerformedReason: NotPerformedReason.WALKER_NO_SHOW }),
      });
    });

    it('CONFIRMED/WALKER_ON_WAY, vencido T + duración del WalkType → NOBODY_ACTED', async () => {
      // Agendado hace 2h, dura 30min: el fin esperado (T+30m) ya quedó bien atrás.
      const longOverdue = {
        ...BASE_CANDIDATE,
        scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      };
      mockThreePasses(prisma, [[], [], [longOverdue]]);

      await service.markNotPerformed();

      expect(prisma.walk.updateMany).toHaveBeenCalledWith({
        where: { id: 'walk-1', status: { in: [WalkStatus.CONFIRMED, WalkStatus.WALKER_ON_WAY] } },
        data: expect.objectContaining({ notPerformedReason: NotPerformedReason.NOBODY_ACTED }),
      });
    });

    it('NOBODY_ACTED: un candidato que todavía no llegó a T + duración NO se marca (filtro en memoria)', async () => {
      const notYetDue = {
        ...BASE_CANDIDATE,
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000), // agendado en el futuro
      };
      mockThreePasses(prisma, [[], [], [notYetDue]]);

      await service.markNotPerformed();

      expect(prisma.walk.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── Ventana 4: techo explícito ──────────────────────────────────────────

  describe('take', () => {
    it('las tres consultas piden take: 50', async () => {
      mockThreePasses(prisma, [[], [], []]);

      await service.markNotPerformed();

      expect(prisma.walk.findMany).toHaveBeenCalledTimes(3);
      for (const call of prisma.walk.findMany.mock.calls) {
        expect(call[0]).toEqual(expect.objectContaining({ take: 50 }));
      }
    });
  });

  // ─── Idempotencia ────────────────────────────────────────────────────────

  describe('idempotencia', () => {
    it('si el update no afecta ninguna fila (otra corrida ya lo movió), no cuenta como marcado ni dispara alerta', async () => {
      mockThreePasses(prisma, [[{ ...BASE_CANDIDATE, mpPaymentId: '99999' }], [], []]);
      prisma.walk.updateMany.mockResolvedValue({ count: 0 });

      await service.markNotPerformed();

      expect(mail.sendNotPerformedAlert).not.toHaveBeenCalled();
    });

    it('correrlo dos veces: la segunda vez el select ya no trae nada (el walk salió de PENDING/CONFIRMED/WALKER_ON_WAY) y no hay updates', async () => {
      mockThreePasses(prisma, [[BASE_CANDIDATE], [], []]);
      await service.markNotPerformed();
      expect(prisma.walk.updateMany).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      mockThreePasses(prisma, [[], [], []]); // ya no está PENDING: no vuelve a aparecer
      await service.markNotPerformed();

      expect(prisma.walk.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── La alerta a Joa ─────────────────────────────────────────────────────

  describe('alerta a Joa', () => {
    it('paseo pagado (mpPaymentId numérico) → dispara sendNotPerformedAlert', async () => {
      const paid = { ...BASE_CANDIDATE, mpPaymentId: '99999' };
      mockThreePasses(prisma, [[paid], [], []]);

      await service.markNotPerformed();

      expect(mail.sendNotPerformedAlert).toHaveBeenCalledTimes(1);
      expect(mail.sendNotPerformedAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          walkId: 'walk-1',
          totalAmount: 1000,
          ownerName: 'Ana Gómez',
          ownerEmail: 'ana@test.com',
          walkerName: 'Juan Pérez',
        }),
      );
    });

    it('paseo sin pagar (mpPaymentId null) → NO dispara sendNotPerformedAlert', async () => {
      mockThreePasses(prisma, [[{ ...BASE_CANDIDATE, mpPaymentId: null }], [], []]);

      await service.markNotPerformed();

      expect(mail.sendNotPerformedAlert).not.toHaveBeenCalled();
    });

    it('paseo con preference id no numérico (checkout abandonado, no es un pago real) → NO dispara la alerta', async () => {
      mockThreePasses(prisma, [
        [{ ...BASE_CANDIDATE, mpPaymentId: '3541787996-9905f4f5-abc' }],
        [],
        [],
      ]);

      await service.markNotPerformed();

      expect(mail.sendNotPerformedAlert).not.toHaveBeenCalled();
    });
  });
});
