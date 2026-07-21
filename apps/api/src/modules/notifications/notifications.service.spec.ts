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

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where:   { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take:    50,
      });
      expect(result).toEqual([{ id: 'n-1' }]);
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
});
