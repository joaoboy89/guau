import { Test, TestingModule } from '@nestjs/testing';
import { WalkRemindersService } from './walk-reminders.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '@guau/shared';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WALKER_CANDIDATE = {
  id: 'walk-1',
  scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
  walkType: { label: 'Paseo básico' },
  walker: { user: { id: 'walker-user-1' } },
};

const OWNER_CANDIDATE = {
  id: 'walk-2',
  participants: [{ owner: { user: { id: 'owner-user-1' } } }],
};

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    walk: { findMany: jest.fn() },
    notification: { findMany: jest.fn() },
  };
}

function buildNotificationsMock() {
  return { create: jest.fn().mockResolvedValue({}) };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WalkRemindersService', () => {
  let service: WalkRemindersService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let notifications: ReturnType<typeof buildNotificationsMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    notifications = buildNotificationsMock();
    prisma.notification.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalkRemindersService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<WalkRemindersService>(WalkRemindersService);
  });

  afterEach(() => jest.clearAllMocks());

  // sendReminders() llama a walk.findMany 4 veces siempre en el mismo orden:
  // onWay T-1h15, onWay T-1h10, dueño T+5m, dueño T+15m.
  function mockFourPasses(passes: [unknown[], unknown[], unknown[], unknown[]]) {
    const [onWay1, onWay2, notStarted1, notStarted2] = passes;
    prisma.walk.findMany
      .mockResolvedValueOnce(onWay1)
      .mockResolvedValueOnce(onWay2)
      .mockResolvedValueOnce(notStarted1)
      .mockResolvedValueOnce(notStarted2);
  }

  describe('recordatorio al paseador ("voy en camino")', () => {
    it('CONFIRMED, onWayAt null, dentro de la ventana → crea la notificación', async () => {
      mockFourPasses([[WALKER_CANDIDATE], [], [], []]);

      await service.sendReminders();

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'walker-user-1',
          type: NOTIFICATION_TYPES.WALK_ONWAY_REMINDER_1,
          data: { walkId: 'walk-1' },
        }),
      );
    });

    it('si ya existe una notificación de ese tipo para ese walk, NO crea otra (idempotencia)', async () => {
      mockFourPasses([[WALKER_CANDIDATE], [], [], []]);
      prisma.notification.findMany.mockResolvedValue([{ data: { walkId: 'walk-1' } }]);

      await service.sendReminders();

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('T-1h15 y T-1h10 son tipos de notificación distintos — no se pisan entre sí', async () => {
      // Ya existe el recordatorio 1 (T-1h15), pero no el 2 (T-1h10): el
      // mismo walk tiene que recibir igual el segundo aviso.
      mockFourPasses([[WALKER_CANDIDATE], [WALKER_CANDIDATE], [], []]);
      prisma.notification.findMany
        .mockResolvedValueOnce([{ data: { walkId: 'walk-1' } }]) // pase 1: ya avisado
        .mockResolvedValueOnce([]); // pase 2: todavía no

      await service.sendReminders();

      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NOTIFICATION_TYPES.WALK_ONWAY_REMINDER_2 }),
      );
    });
  });

  describe('aviso al dueño (el paseo no arrancó)', () => {
    it('CONFIRMED/WALKER_ON_WAY vencido → avisa al primer participante, con el texto de politicas.md', async () => {
      mockFourPasses([[], [], [OWNER_CANDIDATE], []]);

      await service.sendReminders();

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'owner-user-1',
          type: NOTIFICATION_TYPES.WALK_NOT_STARTED_ALERT_1,
          body: 'Todavía no se inició el paseo, ¿todo bien?',
          data: { walkId: 'walk-2' },
        }),
      );
    });

    it('si ya existe la notificación T+5m, no la duplica', async () => {
      mockFourPasses([[], [], [OWNER_CANDIDATE], []]);
      prisma.notification.findMany.mockResolvedValue([{ data: { walkId: 'walk-2' } }]);

      await service.sendReminders();

      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  // ─── Ventana 4: techo explícito ──────────────────────────────────────────

  describe('take', () => {
    it('las cuatro consultas piden take: 50', async () => {
      mockFourPasses([[], [], [], []]);

      await service.sendReminders();

      expect(prisma.walk.findMany).toHaveBeenCalledTimes(4);
      for (const call of prisma.walk.findMany.mock.calls) {
        expect(call[0]).toEqual(expect.objectContaining({ take: 50 }));
      }
    });
  });

  // ─── Ventana 5: idempotencia sin N+1 ─────────────────────────────────────

  describe('costo de la idempotencia', () => {
    it('con varios candidatos en el mismo pase, consulta notification.findMany UNA sola vez (no una por candidato)', async () => {
      const other = { ...WALKER_CANDIDATE, id: 'walk-3', walker: { user: { id: 'walker-user-2' } } };
      mockFourPasses([[WALKER_CANDIDATE, other], [], [], []]);

      await service.sendReminders();

      expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledTimes(2);
    });
  });
});
