import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { WalkStatus } from '@prisma/client';
import { NOTIFICATION_TYPES } from '@guau/shared';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../database/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

function buildPrismaMock() {
  return {
    notification: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    walk:         { findUnique: jest.fn() },
  };
}

function buildTrackingGatewayMock() {
  return { emitNotification: jest.fn() };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma:  ReturnType<typeof buildPrismaMock>;
  let trackingGateway: ReturnType<typeof buildTrackingGatewayMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    trackingGateway = buildTrackingGatewayMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService,   useValue: prisma },
        { provide: TrackingGateway, useValue: trackingGateway },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getMyNotifications() ─────────────────────────────────────────────────

  describe('getMyNotifications()', () => {
    it('devuelve las últimas 50 notificaciones del usuario, más recientes primero', async () => {
      prisma.notification.findMany.mockResolvedValue([{ id: 'n-1' }]);

      const result = await service.getMyNotifications('user-1');

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where:   { userId: 'user-1' },
          orderBy: { createdAt: 'desc' },
          take:    50,
        }),
      );
      expect(result).toEqual([{ id: 'n-1' }]);
    });

    // Ventana #2 de CLAUDE.md: un findMany sin select es una blacklist
    // implicita — la columna que alguien agregue mañana viaja sola en el
    // mismo deploy que la crea. Lista blanca con las ocho columnas reales
    // de Notification (schema.prisma), ni una mas ni una menos.
    it('pide un select explicito con las ocho columnas de Notification, ninguna de mas', async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      await service.getMyNotifications('user-1');

      const call = prisma.notification.findMany.mock.calls[0][0];
      expect(call.select).toEqual({
        id:        true,
        userId:    true,
        title:     true,
        body:      true,
        type:      true,
        data:      true,
        isRead:    true,
        createdAt: true,
      });
    });
  });

  // ─── markAsRead() ─────────────────────────────────────────────────────────

  describe('markAsRead()', () => {
    it('lanza NotFoundException si la notificación no existe', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);
      await expect(service.markAsRead('user-1', 'n-1')).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si la notificación es de otro usuario', async () => {
      prisma.notification.findUnique.mockResolvedValue({ id: 'n-1', userId: 'otro-user' });
      await expect(service.markAsRead('user-1', 'n-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('marca la notificación como leída si pertenece al usuario', async () => {
      prisma.notification.findUnique.mockResolvedValue({ id: 'n-1', userId: 'user-1' });
      prisma.notification.update.mockResolvedValue({ id: 'n-1', isRead: true });

      const result = await service.markAsRead('user-1', 'n-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'n-1' },
        data:  { isRead: true },
      });
      expect(result).toEqual({ id: 'n-1', isRead: true });
    });
  });

  // ─── notifyNewWalkRequest() ───────────────────────────────────────────────

  describe('notifyNewWalkRequest()', () => {
    const WALK_ID = 'walk-1';
    const WALK_ROW = {
      scheduledAt: new Date('2026-08-15T15:30:00.000Z'),
      walkType:    { label: 'Paseo 30min' },
      walker:      { user: { id: 'walker-user-1' } },
    };

    it('si el walk no existe, no crea notificación ni toca el gateway', async () => {
      prisma.walk.findUnique.mockResolvedValue(null);

      await service.notifyNewWalkRequest(WALK_ID);

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(trackingGateway.emitNotification).not.toHaveBeenCalled();
    });

    it('crea la notificación para el USUARIO del paseador (no el walkerProfile.id)', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_ROW);
      prisma.notification.create.mockResolvedValue({ id: 'notif-1' });

      await service.notifyNewWalkRequest(WALK_ID);

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'walker-user-1',
            type:   NOTIFICATION_TYPES.WALK_REQUESTED,
          }),
        }),
      );
    });

    it('el title y el body comunican la solicitud nueva con el tipo de paseo y la fecha', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_ROW);
      prisma.notification.create.mockResolvedValue({ id: 'notif-1' });

      await service.notifyNewWalkRequest(WALK_ID);

      const callData = prisma.notification.create.mock.calls[0][0].data;
      expect(callData.title).toMatch(/nueva solicitud/i);
      expect(callData.body).toContain('Paseo 30min');
    });

    it('emite la notificación en tiempo real via trackingGateway al usuario del paseador', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_ROW);
      prisma.notification.create.mockResolvedValue({ id: 'notif-1', title: 'x' });

      await service.notifyNewWalkRequest(WALK_ID);

      expect(trackingGateway.emitNotification).toHaveBeenCalledWith(
        'walker-user-1',
        { id: 'notif-1', title: 'x' },
      );
    });

    it('incluye el walkId en la data de la notificación', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_ROW);
      prisma.notification.create.mockResolvedValue({ id: 'notif-1' });

      await service.notifyNewWalkRequest(WALK_ID);

      const callData = prisma.notification.create.mock.calls[0][0].data;
      expect(callData.data).toEqual({ walkId: WALK_ID });
    });
  });

  // ─── notifyWalkStatusChange() ─────────────────────────────────────────────

  describe('notifyWalkStatusChange()', () => {
    it('no hace nada si el status no tiene mensaje mapeado', async () => {
      await service.notifyWalkStatusChange('walk-1', WalkStatus.PENDING);
      expect(prisma.walk.findUnique).not.toHaveBeenCalled();
    });

    it('notifica a todos los dueños participantes cuando corresponde (CONFIRMED)', async () => {
      prisma.walk.findUnique.mockResolvedValue({
        walker: { user: { id: 'walker-user-1' } },
        participants: [
          { owner: { user: { id: 'owner-user-1' } } },
          { owner: { user: { id: 'owner-user-2' } } },
        ],
      });
      prisma.notification.create.mockResolvedValue({ id: 'n' });

      await service.notifyWalkStatusChange('walk-1', WalkStatus.CONFIRMED);

      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Cierre del bloque D1 — UNA notificación por paseo, no por perro ──────
  // Un paseo tiene un solo dueño (varios perros suyos, nunca perros de
  // dueños distintos) — ver el comentario del punto 0 en walks.service.ts.
  // Estos tests son la prueba de esa regla: un dueño con 3 perros en el
  // mismo paseo tiene que recibir UNA sola notificación, no tres.

  const OWNER_MULTI_DOG_ROW = {
    participants: [
      { owner: { user: { id: 'owner-user-1' } }, dog: { name: 'Lolo' } },
      { owner: { user: { id: 'owner-user-1' } }, dog: { name: 'Mota' } },
      { owner: { user: { id: 'owner-user-1' } }, dog: { name: 'Rocky' } },
    ],
  };

  describe('notifyPickupCodeExhausted()', () => {
    it('si el walk no existe (o no tiene participantes), no crea notificación', async () => {
      prisma.walk.findUnique.mockResolvedValue(null);
      await service.notifyPickupCodeExhausted('walk-1');
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('crea UNA sola notificación al dueño, aunque el paseo tenga varios perros suyos', async () => {
      prisma.walk.findUnique.mockResolvedValue(OWNER_MULTI_DOG_ROW);
      prisma.notification.create.mockResolvedValue({ id: 'n' });

      await service.notifyPickupCodeExhausted('walk-1');

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'owner-user-1',
            type:   NOTIFICATION_TYPES.WALK_PICKUP_CODE_EXHAUSTED,
            data:   { walkId: 'walk-1' },
          }),
        }),
      );
    });

    it('el texto no menciona un número de intentos ni acusa a nadie', async () => {
      prisma.walk.findUnique.mockResolvedValue(OWNER_MULTI_DOG_ROW);
      prisma.notification.create.mockResolvedValue({ id: 'n' });

      await service.notifyPickupCodeExhausted('walk-1');

      const callData = prisma.notification.create.mock.calls[0][0].data;
      expect(callData.body).not.toMatch(/\d+\s*(veces|intentos)/i);
      expect(callData.body).not.toMatch(/sospech|fraude/i);
    });
  });

  describe('notifyStartedWithoutCode()', () => {
    it('si el walk no existe (o no tiene participantes), no crea notificación', async () => {
      prisma.walk.findUnique.mockResolvedValue(null);
      await service.notifyStartedWithoutCode('walk-1', 'El dueño no tenía el código a mano');
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('crea UNA sola notificación al dueño con el motivo declarado', async () => {
      prisma.walk.findUnique.mockResolvedValue(OWNER_MULTI_DOG_ROW);
      prisma.notification.create.mockResolvedValue({ id: 'n' });

      await service.notifyStartedWithoutCode('walk-1', 'El dueño no tenía el código a mano');

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      const callData = prisma.notification.create.mock.calls[0][0].data;
      expect(callData.userId).toBe('owner-user-1');
      expect(callData.type).toBe(NOTIFICATION_TYPES.WALK_STARTED_NO_CODE);
      expect(callData.data).toEqual({ walkId: 'walk-1' });
      expect(callData.body).toContain('El dueño no tenía el código a mano');
    });

    it('junta el nombre de los perros del paseo en el cuerpo (Lolo y 2 más)', async () => {
      prisma.walk.findUnique.mockResolvedValue(OWNER_MULTI_DOG_ROW);
      prisma.notification.create.mockResolvedValue({ id: 'n' });

      await service.notifyStartedWithoutCode('walk-1', 'motivo');

      const callData = prisma.notification.create.mock.calls[0][0].data;
      expect(callData.body).toContain('Lolo y 2 más');
    });
  });
});
