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
  // "Debería haber arrancado hace 10 minutos" — el escenario real de este
  // aviso (T+5m / T+10m). Con 30 min de duración, el fin esperado todavía
  // está 20 minutos en el futuro: no expiró, sigue siendo candidato.
  scheduledAt: new Date(Date.now() - 10 * 60 * 1000),
  walkType: { durationMinutes: 30 },
  participants: [{ owner: { user: { id: 'owner-user-1' } } }],
};

const CLOSE_CANDIDATE = {
  id: 'walk-4',
  startedAt: new Date(Date.now() - 60 * 60 * 1000), // arrancó hace 1h
  walkType: { durationMinutes: 30 }, // fin esperado hace 30min — ya venció
  walker: { user: { id: 'walker-user-3' } },
  participants: [{
    owner: { user: { id: 'owner-user-3' } },
    dog: { name: 'Lolo' },
  }],
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

  // sendReminders() llama a walk.findMany 6 veces siempre en el mismo orden:
  // onWay T-1h15, onWay T-1h10, dueño T+5m, dueño T+10m, cierre fin+0,
  // cierre fin+30m. Los tests que no les interesan los dos últimos pasan []
  // — mockSixPasses les pone ese default para no repetirlo en cada test.
  function mockSixPasses(passes: {
    onWay1?: unknown[]; onWay2?: unknown[];
    notStarted1?: unknown[]; notStarted2?: unknown[];
    close1?: unknown[]; close2?: unknown[];
  }) {
    prisma.walk.findMany
      .mockResolvedValueOnce(passes.onWay1 ?? [])
      .mockResolvedValueOnce(passes.onWay2 ?? [])
      .mockResolvedValueOnce(passes.notStarted1 ?? [])
      .mockResolvedValueOnce(passes.notStarted2 ?? [])
      .mockResolvedValueOnce(passes.close1 ?? [])
      .mockResolvedValueOnce(passes.close2 ?? []);
  }

  describe('recordatorio al paseador ("voy en camino")', () => {
    it('CONFIRMED, onWayAt null, dentro de la ventana → crea la notificación', async () => {
      mockSixPasses({ onWay1: [WALKER_CANDIDATE] });

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
      mockSixPasses({ onWay1: [WALKER_CANDIDATE] });
      prisma.notification.findMany.mockResolvedValue([{ data: { walkId: 'walk-1' } }]);

      await service.sendReminders();

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('T-1h15 y T-1h10 son tipos de notificación distintos — no se pisan entre sí', async () => {
      // Ya existe el recordatorio 1 (T-1h15), pero no el 2 (T-1h10): el
      // mismo walk tiene que recibir igual el segundo aviso.
      mockSixPasses({ onWay1: [WALKER_CANDIDATE], onWay2: [WALKER_CANDIDATE] });
      prisma.notification.findMany
        .mockResolvedValueOnce([{ data: { walkId: 'walk-1' } }]) // pase 1: ya avisado
        .mockResolvedValueOnce([]); // pase 2: todavía no

      await service.sendReminders();

      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NOTIFICATION_TYPES.WALK_ONWAY_REMINDER_2 }),
      );
    });

    // El bug real (producción, 2026-08): la primera corrida mandó 9
    // recordatorios con un solo paseo futuro en la base — el WHERE de
    // remindWalker solo tenía `lte: threshold`, sin cota inferior, así que
    // "decía" todo paseo anterior a dentro de X minutos, TODO el pasado
    // incluido. Los tests viejos nunca lo cazaron porque `mockSixPasses`
    // devuelve candidatos ya armados, como si el WHERE los hubiera filtrado
    // — ningún test alimentaba un candidato fuera de la ventana para ver si
    // la query lo hubiera dejado pasar.
    //
    // Acá la cota vive entera en el WHERE (ver el comentario del método), y
    // el mock de Prisma no ejecuta ningún WHERE real — así que la única
    // forma honesta de probarlo es reconstruir el filtro que el WHERE
    // describe y aplicarlo, en vez de devolver el candidato tal cual.
    it('un paseo CONFIRMED con scheduledAt en el pasado no genera recordatorio de paseador — la query lo excluye', async () => {
      const staleWalker = {
        ...WALKER_CANDIDATE,
        id: 'walk-old',
        scheduledAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // hace dos meses
      };
      prisma.walk.findMany.mockImplementation((args: any) => {
        const bounds = args?.where?.scheduledAt as { gte?: Date; lte?: Date } | undefined;
        const t = staleWalker.scheduledAt.getTime();
        const passesGte = !bounds?.gte || t >= bounds.gte.getTime();
        const passesLte = !bounds?.lte || t <= bounds.lte.getTime();
        return Promise.resolve(passesGte && passesLte ? [staleWalker] : []);
      });

      await service.sendReminders();

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('la consulta de "voy en camino" pide scheduledAt >= ahora, no solo un techo (cota inferior real en el WHERE)', async () => {
      mockSixPasses({});

      await service.sendReminders();

      // Primera llamada = onWay1 (T-1h15).
      const where = prisma.walk.findMany.mock.calls[0][0].where;
      const gte = where.scheduledAt.gte as Date;
      const lte = where.scheduledAt.lte as Date;
      expect(gte.getTime()).toBeGreaterThan(Date.now() - 5_000);
      expect(gte.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
      expect(lte.getTime()).toBeGreaterThan(gte.getTime());
    });
  });

  describe('aviso al dueño (el paseo no arrancó)', () => {
    it('CONFIRMED/WALKER_ON_WAY vencido → avisa al primer participante, con el texto de politicas.md', async () => {
      mockSixPasses({ notStarted1: [OWNER_CANDIDATE] });

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
      mockSixPasses({ notStarted1: [OWNER_CANDIDATE] });
      prisma.notification.findMany.mockResolvedValue([{ data: { walkId: 'walk-2' } }]);

      await service.sendReminders();

      expect(notifications.create).not.toHaveBeenCalled();
    });

    // El bug real (producción, 2026-08): remindOwner tampoco tenía cota
    // inferior — `threshold = now - minutesAfter` con `scheduledAt: { lte:
    // threshold }` "decía" todo paseo anterior a esa fecha, sin importar
    // cuánto. Los tests viejos no lo cazaron por el mismo motivo que
    // remindWalker: OWNER_CANDIDATE no tenía ni scheduledAt ni duración, así
    // que nada podía calificar como "afuera de la ventana". A diferencia de
    // remindWalker, acá la cota SÍ vive en memoria (no en el WHERE): Prisma
    // no puede comparar `scheduledAt + walkType.durationMinutes` contra
    // `now`, así que el candidato inyectado en el mock atraviesa el WHERE
    // (que en el mock no filtra nada) y es la propia función la que tiene
    // que rechazarlo — acá sí es un test de comportamiento genuino, no una
    // simulación del WHERE como en remindWalker.
    it('un paseo muy viejo (mucho más allá de su propio fin esperado) NO genera recordatorio de dueño', async () => {
      const staleOwner = {
        ...OWNER_CANDIDATE,
        id: 'walk-old-owner',
        scheduledAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // hace dos meses
        // misma duración de 30 min que OWNER_CANDIDATE — el fin esperado
        // quedó hace casi dos meses, muy pasado.
      };
      mockSixPasses({ notStarted1: [staleOwner] });

      await service.sendReminders();

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('justo en su propio fin esperado ya NO genera recordatorio; un minuto antes, sí', async () => {
      const durationMinutes = 30;
      const scheduledAt = new Date(Date.now() - (durationMinutes + 1) * 60_000); // fin esperado hace 1 min
      const justExpired = { ...OWNER_CANDIDATE, id: 'walk-just-expired', scheduledAt, walkType: { durationMinutes } };
      mockSixPasses({ notStarted1: [justExpired] });

      await service.sendReminders();
      expect(notifications.create).not.toHaveBeenCalled();

      jest.clearAllMocks();
      prisma.notification.findMany.mockResolvedValue([]);
      const aboutToExpire = {
        ...justExpired,
        id: 'walk-about-to-expire',
        scheduledAt: new Date(Date.now() - (durationMinutes - 1) * 60_000), // fin esperado en 1 min
      };
      mockSixPasses({ notStarted1: [aboutToExpire] });

      await service.sendReminders();
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { walkId: 'walk-about-to-expire' } }),
      );
    });
  });

  // ─── Recordatorios de cierre — "el paseo que arranca y nunca se cierra" ──

  describe('recordatorios de cierre (fin esperado)', () => {
    it('IN_PROGRESS vencido → avisa a las DOS partes, con tipos distintos', async () => {
      mockSixPasses({ close1: [CLOSE_CANDIDATE] });

      await service.sendReminders();

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'walker-user-3',
          type: NOTIFICATION_TYPES.WALK_CLOSE_REMINDER_1_WALKER,
          body: 'Acordate de cerrar el paseo de Lolo.',
          data: { walkId: 'walk-4' },
        }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'owner-user-3',
          type: NOTIFICATION_TYPES.WALK_CLOSE_REMINDER_1_OWNER,
          body: '¿Ya te devolvieron a Lolo?',
          data: { walkId: 'walk-4' },
        }),
      );
    });

    it('si ya existen las dos notificaciones del milestone, no duplica ninguna', async () => {
      mockSixPasses({ close1: [CLOSE_CANDIDATE] });
      prisma.notification.findMany.mockResolvedValue([{ data: { walkId: 'walk-4' } }]);

      await service.sendReminders();

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('paseador y dueño no se pisan: si ya se avisó al paseador pero no al dueño, el dueño igual recibe el suyo', async () => {
      mockSixPasses({ close1: [CLOSE_CANDIDATE] });
      prisma.notification.findMany
        .mockResolvedValueOnce([{ data: { walkId: 'walk-4' } }]) // tipo walker: ya avisado
        .mockResolvedValueOnce([]); // tipo owner: todavía no

      await service.sendReminders();

      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NOTIFICATION_TYPES.WALK_CLOSE_REMINDER_1_OWNER }),
      );
    });

    it('un IN_PROGRESS que todavía no llegó al fin esperado NO recibe recordatorio', async () => {
      const notYetDue = {
        ...CLOSE_CANDIDATE,
        startedAt: new Date(), // recién arrancó
      };
      mockSixPasses({ close1: [notYetDue] });

      await service.sendReminders();

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('fin+0 y fin+30m son milestones (y tipos) distintos — no se pisan entre sí', async () => {
      mockSixPasses({ close1: [CLOSE_CANDIDATE], close2: [CLOSE_CANDIDATE] });
      prisma.notification.findMany
        .mockResolvedValueOnce([{ data: { walkId: 'walk-4' } }]) // close1 walker: ya avisado
        .mockResolvedValueOnce([{ data: { walkId: 'walk-4' } }]) // close1 owner: ya avisado
        .mockResolvedValueOnce([]) // close2 walker: todavía no
        .mockResolvedValueOnce([]); // close2 owner: todavía no

      await service.sendReminders();

      expect(notifications.create).toHaveBeenCalledTimes(2);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NOTIFICATION_TYPES.WALK_CLOSE_REMINDER_2_WALKER }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NOTIFICATION_TYPES.WALK_CLOSE_REMINDER_2_OWNER }),
      );
    });
  });

  // ─── Ventana 4: techo explícito ──────────────────────────────────────────

  describe('take', () => {
    it('las seis consultas piden take: 50', async () => {
      mockSixPasses({});

      await service.sendReminders();

      expect(prisma.walk.findMany).toHaveBeenCalledTimes(6);
      for (const call of prisma.walk.findMany.mock.calls) {
        expect(call[0]).toEqual(expect.objectContaining({ take: 50 }));
      }
    });
  });

  // ─── Ventana 5: idempotencia sin N+1 ─────────────────────────────────────

  describe('costo de la idempotencia', () => {
    it('con varios candidatos en el mismo pase, consulta notification.findMany UNA sola vez (no una por candidato)', async () => {
      const other = { ...WALKER_CANDIDATE, id: 'walk-3', walker: { user: { id: 'walker-user-2' } } };
      mockSixPasses({ onWay1: [WALKER_CANDIDATE, other] });

      await service.sendReminders();

      expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledTimes(2);
    });
  });
});
