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

// markNotPerformed() llama a findMany exactamente 4 veces, siempre en el
// mismo orden: never-confirmed, walker-no-show, on-way-never-started,
// canario. Encadenar mockResolvedValueOnce en ese orden es más simple y más
// robusto que inspeccionar la forma del `where` de cada llamada.
function mockFourPasses(
  prisma: ReturnType<typeof buildPrismaMock>,
  passes: [unknown[], unknown[], unknown[], unknown[]],
) {
  const [neverConfirmed, walkerNoShow, onWayNeverStarted, canary] = passes;
  prisma.walk.findMany
    .mockResolvedValueOnce(neverConfirmed)
    .mockResolvedValueOnce(walkerNoShow)
    .mockResolvedValueOnce(onWayNeverStarted)
    .mockResolvedValueOnce(canary);
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

  // ─── Las condiciones ────────────────────────────────────────────────────

  describe('markNotPerformed() — las condiciones', () => {
    it('PENDING vencido → NEVER_CONFIRMED', async () => {
      mockFourPasses(prisma, [[BASE_CANDIDATE], [], [], []]);

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

    it('CONFIRMED sin onWayAt, vencido T + duración del WalkType → WALKER_NO_SHOW', async () => {
      // Agendado hace 2h, dura 30min: T+duración (12:30) quedó bien atrás.
      const longOverdue = { ...BASE_CANDIDATE, scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000) };
      mockFourPasses(prisma, [[], [longOverdue], [], []]);

      await service.markNotPerformed();

      expect(prisma.walk.updateMany).toHaveBeenCalledWith({
        where: { id: 'walk-1', status: { in: [WalkStatus.CONFIRMED] } },
        data: expect.objectContaining({ notPerformedReason: NotPerformedReason.WALKER_NO_SHOW }),
      });
    });

    it('WALKER_NO_SHOW: un CONFIRMED que ya pasó T pero NO llegó a T+duración todavía NO se marca (ya no es a los 5 min fijos)', async () => {
      // Agendado hace 6 minutos, dura 30min: pasó T pero falta mucho para T+duración.
      const recentlyOverdue = { ...BASE_CANDIDATE, scheduledAt: new Date(Date.now() - 6 * 60 * 1000) };
      mockFourPasses(prisma, [[], [recentlyOverdue], [], []]);

      await service.markNotPerformed();

      expect(prisma.walk.updateMany).not.toHaveBeenCalled();
    });

    it('WALKER_ON_WAY vencido T + duración del WalkType → ON_WAY_NEVER_STARTED', async () => {
      const longOverdue = { ...BASE_CANDIDATE, scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000) };
      mockFourPasses(prisma, [[], [], [longOverdue], []]);

      await service.markNotPerformed();

      expect(prisma.walk.updateMany).toHaveBeenCalledWith({
        where: { id: 'walk-1', status: { in: [WalkStatus.WALKER_ON_WAY] } },
        data: expect.objectContaining({ notPerformedReason: NotPerformedReason.ON_WAY_NEVER_STARTED }),
      });
    });

    it('ON_WAY_NEVER_STARTED: un candidato que todavía no llegó a T + duración NO se marca (filtro en memoria)', async () => {
      const notYetDue = { ...BASE_CANDIDATE, scheduledAt: new Date() };
      mockFourPasses(prisma, [[], [], [notYetDue], []]);

      await service.markNotPerformed();

      expect(prisma.walk.updateMany).not.toHaveBeenCalled();
    });

    // El bug que se arregla en esta ronda: antes el tercer pase consultaba
    // status IN (CONFIRMED, WALKER_ON_WAY) — un CONFIRMED que sobraba del
    // cupo (take: 50) del segundo pase caía acá y se llevaba un motivo
    // distinto solo por el largo de la cola. Ahora el tercer pase consulta
    // EXCLUSIVAMENTE WALKER_ON_WAY.
    it('el pase de ON_WAY_NEVER_STARTED consulta solo WALKER_ON_WAY, nunca CONFIRMED', async () => {
      mockFourPasses(prisma, [[], [], [], []]);

      await service.markNotPerformed();

      const [, , thirdCall] = prisma.walk.findMany.mock.calls;
      expect(thirdCall[0]).toEqual(
        expect.objectContaining({ where: expect.objectContaining({ status: WalkStatus.WALKER_ON_WAY }) }),
      );
    });
  });

  // ─── Filtro de fecha (Ventana 5) ─────────────────────────────────────────

  describe('filtro de fecha en las consultas', () => {
    it('walker-no-show y on-way-never-started piden scheduledAt <= now en el WHERE (no traen paseos futuros)', async () => {
      mockFourPasses(prisma, [[], [], [], []]);

      await service.markNotPerformed();

      const [, secondCall, thirdCall] = prisma.walk.findMany.mock.calls;
      expect(secondCall[0].where).toEqual(
        expect.objectContaining({ scheduledAt: { lte: expect.any(Date) } }),
      );
      expect(thirdCall[0].where).toEqual(
        expect.objectContaining({ scheduledAt: { lte: expect.any(Date) } }),
      );
    });
  });

  // ─── Ventana 4: techo explícito ──────────────────────────────────────────

  describe('take', () => {
    it('las cuatro consultas piden take: 50', async () => {
      mockFourPasses(prisma, [[], [], [], []]);

      await service.markNotPerformed();

      expect(prisma.walk.findMany).toHaveBeenCalledTimes(4);
      for (const call of prisma.walk.findMany.mock.calls) {
        expect(call[0]).toEqual(expect.objectContaining({ take: 50 }));
      }
    });
  });

  // ─── Idempotencia ────────────────────────────────────────────────────────

  describe('idempotencia', () => {
    it('si el update no afecta ninguna fila (otra corrida ya lo movió), no cuenta como marcado ni dispara alerta', async () => {
      mockFourPasses(prisma, [[{ ...BASE_CANDIDATE, mpPaymentId: '99999' }], [], [], []]);
      prisma.walk.updateMany.mockResolvedValue({ count: 0 });

      await service.markNotPerformed();

      expect(mail.sendNotPerformedAlert).not.toHaveBeenCalled();
    });

    it('correrlo dos veces: la segunda vez el select ya no trae nada (el walk salió de PENDING/CONFIRMED/WALKER_ON_WAY) y no hay updates', async () => {
      mockFourPasses(prisma, [[BASE_CANDIDATE], [], [], []]);
      await service.markNotPerformed();
      expect(prisma.walk.updateMany).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      mockFourPasses(prisma, [[], [], [], []]); // ya no está PENDING: no vuelve a aparecer
      await service.markNotPerformed();

      expect(prisma.walk.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── La alerta a Joa ─────────────────────────────────────────────────────

  describe('alerta a Joa', () => {
    it('paseo pagado (mpPaymentId numérico) → dispara sendNotPerformedAlert', async () => {
      const paid = { ...BASE_CANDIDATE, mpPaymentId: '99999' };
      mockFourPasses(prisma, [[paid], [], [], []]);

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
      mockFourPasses(prisma, [[{ ...BASE_CANDIDATE, mpPaymentId: null }], [], [], []]);

      await service.markNotPerformed();

      expect(mail.sendNotPerformedAlert).not.toHaveBeenCalled();
    });

    it('paseo con preference id no numérico (checkout abandonado, no es un pago real) → NO dispara la alerta', async () => {
      mockFourPasses(prisma, [
        [{ ...BASE_CANDIDATE, mpPaymentId: '3541787996-9905f4f5-abc' }],
        [], [], [],
      ]);

      await service.markNotPerformed();

      expect(mail.sendNotPerformedAlert).not.toHaveBeenCalled();
    });
  });

  // ─── El canario ──────────────────────────────────────────────────────────

  describe('pase canario (estado sin mapear)', () => {
    it('marca NOBODY_ACTED y alerta a Joa AUNQUE el paseo no esté pagado — la señal es "hay un caso sin mapear", no plata en riesgo', async () => {
      const unpaidAnomaly = { ...BASE_CANDIDATE, scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000), mpPaymentId: null };
      mockFourPasses(prisma, [[], [], [], [unpaidAnomaly]]);

      await service.markNotPerformed();

      expect(prisma.walk.updateMany).toHaveBeenCalledWith({
        where: { id: 'walk-1', status: WalkStatus.CONFIRMED },
        data: expect.objectContaining({ notPerformedReason: NotPerformedReason.NOBODY_ACTED }),
      });
      expect(mail.sendNotPerformedAlert).toHaveBeenCalledTimes(1);
    });

    it('consulta status CONFIRMED con onWayAt no nulo — el único hueco que las otras reglas no cubren', async () => {
      mockFourPasses(prisma, [[], [], [], []]);

      await service.markNotPerformed();

      const [, , , fourthCall] = prisma.walk.findMany.mock.calls;
      expect(fourthCall[0].where).toEqual(
        expect.objectContaining({ status: WalkStatus.CONFIRMED, onWayAt: { not: null } }),
      );
    });

    it('un candidato que todavía no llegó a T + duración NO se marca (mismo filtro en memoria que las otras ramas)', async () => {
      const notYetDue = { ...BASE_CANDIDATE, scheduledAt: new Date() };
      mockFourPasses(prisma, [[], [], [], [notYetDue]]);

      await service.markNotPerformed();

      expect(prisma.walk.updateMany).not.toHaveBeenCalled();
    });
  });
});
