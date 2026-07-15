import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalkStatus, WalkMode, VerificationStatus, UserRole } from '@prisma/client';
import { WalksService } from './walks.service';
import { PrismaService } from '../../database/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WALKER_PROFILE_ID = 'wp-1';
const OWNER_PROFILE_ID  = 'op-1';
const WALK_ID           = 'walk-1';
const WALKER_USER_ID    = 'walker-user-1';
const OWNER_USER_ID     = 'owner-user-1';
const DOG_ID            = 'dog-1';
const WALK_TYPE_ID      = 'wt-1';

const BASE_WALKER = {
  id:                 WALKER_PROFILE_ID,
  userId:             WALKER_USER_ID,
  verificationStatus: VerificationStatus.VERIFIED,
  isAvailable:        true,
  maxDogsPerWalk:     3,
};

const BASE_OWNER = {
  id:     OWNER_PROFILE_ID,
  userId: OWNER_USER_ID,
};

const BASE_WALK_TYPE = {
  id:                  WALK_TYPE_ID,
  isActive:            true,
  basePrice:           1000,
  exclusiveMultiplier: 2,
};

const BASE_SCHEDULE = {
  id:        'schedule-1',
  walkerId:  WALKER_PROFILE_ID,
  dayOfWeek: 1,
  startTime: '00:00',
  endTime:   '23:59',
  isActive:  true,
};

const BASE_WALK = {
  id:          WALK_ID,
  walkerId:    WALKER_PROFILE_ID,
  status:      WalkStatus.PENDING,
  scheduledAt: new Date('2026-07-06T12:00:00.000Z'),
  totalAmount: 1000,
};

// Versión extendida con relaciones (equivalente al WALK_INCLUDE del servicio)
const WALK_FULL = {
  ...BASE_WALK,
  walkType:     { id: WALK_TYPE_ID, name: 'Paseo básico', basePrice: 1000 },
  walker:       {
    id: WALKER_PROFILE_ID,
    user: { firstName: 'Juan', lastName: 'Pérez', avatarUrl: null, phone: null },
  },
  participants: [],
};

const CREATE_DTO = {
  walkerId:       WALKER_PROFILE_ID,
  walkTypeId:     WALK_TYPE_ID,
  dogIds:         [DOG_ID],
  scheduledAt:    '2026-07-06T12:00:00.000Z',
  pickupLat:      -34.5885,
  pickupLng:      -58.4233,
  pickupAddress:  'Av. Santa Fe 1234, Palermo',
  mode:           WalkMode.GRUPAL,
};

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    // $transaction ejecuta el callback con el mismo prisma mock (sin DB real)
    $transaction:    jest.fn(),
    ownerProfile:    { findUnique: jest.fn() },
    walkerProfile:   { findUnique: jest.fn() },
    dog:             { findMany: jest.fn() },
    walkType:        { findUnique: jest.fn() },
    walkerSchedule:  { findFirst: jest.fn() },
    walkParticipant: {
      count:     jest.fn(),
      findMany:  jest.fn(),
      findFirst: jest.fn(),
      createMany: jest.fn(),
    },
    walk: {
      create:     jest.fn(),
      findUnique: jest.fn(),
      findMany:   jest.fn(),
      update:     jest.fn(),
    },
    walkLocation: { findMany: jest.fn() },
  };
}

function buildConfigMock() {
  return {
    get: jest.fn((key: string) => {
      if (key === 'MP_MARKETPLACE_FEE') return '0.15';
      return null;
    }),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WalksService', () => {
  let service:               WalksService;
  let prisma:                ReturnType<typeof buildPrismaMock>;
  let trackingGateway:       { emitStatusChanged: jest.Mock };
  let chatService:           { ensureConversationForWalk: jest.Mock };
  let notificationsService:  { notifyWalkStatusChange: jest.Mock };

  beforeEach(async () => {
    prisma = buildPrismaMock();
    // El callback de $transaction recibe el mismo mock como "tx"
    prisma.$transaction.mockImplementation(
      (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma),
    );

    trackingGateway      = { emitStatusChanged: jest.fn() };
    chatService          = { ensureConversationForWalk: jest.fn().mockResolvedValue({}) };
    notificationsService = { notifyWalkStatusChange: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalksService,
        { provide: PrismaService,          useValue: prisma },
        { provide: ConfigService,          useValue: buildConfigMock() },
        { provide: TrackingGateway,        useValue: trackingGateway },
        { provide: ChatService,            useValue: chatService },
        { provide: NotificationsService,   useValue: notificationsService },
      ],
    }).compile();

    service = module.get<WalksService>(WalksService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Helpers de setup ─────────────────────────────────────────────────────

  // Configura todos los mocks necesarios para los caminos felices de create()
  function setupCreateMocks() {
    prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
    prisma.dog.findMany.mockResolvedValue([
      { id: DOG_ID, ownerId: OWNER_PROFILE_ID, isActive: true },
    ]);
    prisma.walkType.findUnique.mockResolvedValue(BASE_WALK_TYPE);
    prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
    prisma.walkerSchedule.findFirst.mockResolvedValue(BASE_SCHEDULE);
    prisma.walkParticipant.count.mockResolvedValue(0);
    prisma.walk.create.mockResolvedValue({ id: WALK_ID });
    prisma.walkParticipant.createMany.mockResolvedValue({});
    prisma.walk.findUnique.mockResolvedValue(WALK_FULL);
  }

  // Configura mocks para los métodos que usan getWalkerWalkOrThrow (confirm/reject/etc.)
  function setupWalkerWalk(status: WalkStatus) {
    prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
    prisma.walk.findUnique.mockResolvedValue({ ...BASE_WALK, status });
    prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status });
  }

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('lanza NotFoundException si no existe el ownerProfile', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(null);
      await expect(service.create(OWNER_USER_ID, CREATE_DTO)).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si algún perro no existe o no pertenece al dueño', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      // dto.dogIds.length = 1 pero findMany devuelve 0 perros → mismatch
      prisma.dog.findMany.mockResolvedValue([]);
      await expect(service.create(OWNER_USER_ID, CREATE_DTO)).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el walkType no existe', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.dog.findMany.mockResolvedValue([{ id: DOG_ID }]);
      prisma.walkType.findUnique.mockResolvedValue(null);
      await expect(service.create(OWNER_USER_ID, CREATE_DTO)).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si el walkType no está activo', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.dog.findMany.mockResolvedValue([{ id: DOG_ID }]);
      prisma.walkType.findUnique.mockResolvedValue({ ...BASE_WALK_TYPE, isActive: false });
      await expect(service.create(OWNER_USER_ID, CREATE_DTO)).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si el walker no existe', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.dog.findMany.mockResolvedValue([{ id: DOG_ID }]);
      prisma.walkType.findUnique.mockResolvedValue(BASE_WALK_TYPE);
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.create(OWNER_USER_ID, CREATE_DTO)).rejects.toThrow(NotFoundException);
    });

    it('lanza UnprocessableEntityException si el walker no está VERIFIED', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.dog.findMany.mockResolvedValue([{ id: DOG_ID }]);
      prisma.walkType.findUnique.mockResolvedValue(BASE_WALK_TYPE);
      prisma.walkerProfile.findUnique.mockResolvedValue({
        ...BASE_WALKER, verificationStatus: VerificationStatus.PENDING,
      });
      await expect(service.create(OWNER_USER_ID, CREATE_DTO)).rejects.toThrow(UnprocessableEntityException);
    });

    it('lanza UnprocessableEntityException si el walker no está isAvailable', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.dog.findMany.mockResolvedValue([{ id: DOG_ID }]);
      prisma.walkType.findUnique.mockResolvedValue(BASE_WALK_TYPE);
      prisma.walkerProfile.findUnique.mockResolvedValue({ ...BASE_WALKER, isAvailable: false });
      await expect(service.create(OWNER_USER_ID, CREATE_DTO)).rejects.toThrow(UnprocessableEntityException);
    });

    it('lanza UnprocessableEntityException si no hay WalkerSchedule que cubra el horario', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.dog.findMany.mockResolvedValue([{ id: DOG_ID }]);
      prisma.walkType.findUnique.mockResolvedValue(BASE_WALK_TYPE);
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walkerSchedule.findFirst.mockResolvedValue(null);
      await expect(service.create(OWNER_USER_ID, CREATE_DTO)).rejects.toThrow(UnprocessableEntityException);
    });

    it('lanza UnprocessableEntityException si sumar los perros nuevos supera maxDogsPerWalk', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.dog.findMany.mockResolvedValue([{ id: DOG_ID }]);
      prisma.walkType.findUnique.mockResolvedValue(BASE_WALK_TYPE);
      // maxDogsPerWalk = 2, ya hay 2 reservados → 2 + 1 nuevo = 3 > 2
      prisma.walkerProfile.findUnique.mockResolvedValue({ ...BASE_WALKER, maxDogsPerWalk: 2 });
      prisma.walkerSchedule.findFirst.mockResolvedValue(BASE_SCHEDULE);
      prisma.walkParticipant.count.mockResolvedValue(2);
      await expect(service.create(OWNER_USER_ID, CREATE_DTO)).rejects.toThrow(UnprocessableEntityException);
    });

    it('camino feliz GRUPAL: totalAmount = basePrice sin multiplicador', async () => {
      setupCreateMocks();
      const dto = { ...CREATE_DTO, mode: WalkMode.GRUPAL };

      await service.create(OWNER_USER_ID, dto);

      expect(prisma.walk.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalAmount: BASE_WALK_TYPE.basePrice }),
        }),
      );
    });

    it('camino feliz EXCLUSIVO: totalAmount = basePrice * exclusiveMultiplier', async () => {
      setupCreateMocks();
      const dto = { ...CREATE_DTO, mode: WalkMode.EXCLUSIVO };

      await service.create(OWNER_USER_ID, dto);

      expect(prisma.walk.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: BASE_WALK_TYPE.basePrice * BASE_WALK_TYPE.exclusiveMultiplier,
          }),
        }),
      );
    });

    it('camino feliz: platformFee y walkerAmount calculados con commissionRate 0.15', async () => {
      setupCreateMocks();
      const expectedFee = BASE_WALK_TYPE.basePrice * 0.15;

      await service.create(OWNER_USER_ID, CREATE_DTO);

      expect(prisma.walk.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            platformFee:    expectedFee,
            walkerAmount:   BASE_WALK_TYPE.basePrice - expectedFee,
            commissionRate: 0.15,
          }),
        }),
      );
    });

    it('camino feliz: status inicial PENDING y se crea dentro de $transaction', async () => {
      setupCreateMocks();

      await service.create(OWNER_USER_ID, CREATE_DTO);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.walk.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: WalkStatus.PENDING }),
        }),
      );
    });
  });

  // ─── findMyWalks() ────────────────────────────────────────────────────────

  describe('findMyWalks()', () => {
    it('WALKER: lanza NotFoundException si no existe walkerProfile', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, {}))
        .rejects.toThrow(NotFoundException);
    });

    it('WALKER: camino feliz — devuelve walks filtrados por walkerId del perfil', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([WALK_FULL]);

      const result = await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, {});

      expect(prisma.walk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { walkerId: WALKER_PROFILE_ID } }),
      );
      expect(result).toEqual([WALK_FULL]);
    });

    it('OWNER: lanza NotFoundException si no existe ownerProfile', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(null);
      await expect(service.findMyWalks(OWNER_USER_ID, UserRole.OWNER, {}))
        .rejects.toThrow(NotFoundException);
    });

    it('OWNER: camino feliz — devuelve walks a partir de walkIds de WalkParticipant', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walkParticipant.findMany.mockResolvedValue([{ walkId: WALK_ID }]);
      prisma.walk.findMany.mockResolvedValue([WALK_FULL]);

      const result = await service.findMyWalks(OWNER_USER_ID, UserRole.OWNER, {});

      expect(prisma.walk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [WALK_ID] } } }),
      );
      expect(result).toEqual([WALK_FULL]);
    });

    it('con query.status aplica filtro adicional en el where', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([]);

      await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, { status: WalkStatus.PENDING });

      expect(prisma.walk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { walkerId: WALKER_PROFILE_ID, status: WalkStatus.PENDING },
        }),
      );
    });
  });

  // ─── findById() ───────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('lanza NotFoundException si el walk no existe', async () => {
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID))
        .rejects.toThrow(NotFoundException);
    });

    it('ForbiddenException si WALKER no es el paseador del walk', async () => {
      prisma.walk.findUnique.mockResolvedValue({ ...WALK_FULL, walkerId: 'other-walker' });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER); // id = WALKER_PROFILE_ID
      await expect(service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID))
        .rejects.toThrow(ForbiddenException);
    });

    it('ForbiddenException si OWNER no es participante del walk', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_FULL);
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue(null);
      await expect(service.findById(OWNER_USER_ID, UserRole.OWNER, WALK_ID))
        .rejects.toThrow(ForbiddenException);
    });

    it('camino feliz WALKER: el paseador del walk puede verlo y walker no expone mpAccessToken', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_FULL);
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      const result = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);
      expect(result).toEqual({ ...WALK_FULL, isPaid: false });
      expect(result.walker).not.toHaveProperty('mpAccessToken');
      expect(result.walker).not.toHaveProperty('mpUserId');
    });

    it('camino feliz OWNER: un participante puede ver el walk', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_FULL);
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue({
        id: 'p-1', walkId: WALK_ID, ownerId: OWNER_PROFILE_ID,
      });

      const result = await service.findById(OWNER_USER_ID, UserRole.OWNER, WALK_ID);
      expect(result).toEqual({ ...WALK_FULL, isPaid: false });
    });

    it('isPaid es true cuando mpPaymentId es numérico (pago real confirmado)', async () => {
      prisma.walk.findUnique.mockResolvedValue({ ...WALK_FULL, mpPaymentId: '99999' });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      const result = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);
      expect(result.isPaid).toBe(true);
    });

    it('isPaid es false cuando mpPaymentId es un preference id (no numérico)', async () => {
      prisma.walk.findUnique.mockResolvedValue({ ...WALK_FULL, mpPaymentId: '3541787996-9905f4f5-abc' });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      const result = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);
      expect(result.isPaid).toBe(false);
    });
  });

  // ─── confirm() ────────────────────────────────────────────────────────────

  describe('confirm()', () => {
    it('ForbiddenException si no existe walkerProfile', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.confirm(WALKER_USER_ID, WALK_ID)).rejects.toThrow(ForbiddenException);
    });

    it('NotFoundException si el walk no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.confirm(WALKER_USER_ID, WALK_ID)).rejects.toThrow(NotFoundException);
    });

    it('BadRequestException si el walk no está en PENDING', async () => {
      setupWalkerWalk(WalkStatus.CONFIRMED); // ya confirmado → no se puede confirmar de nuevo
      await expect(service.confirm(WALKER_USER_ID, WALK_ID)).rejects.toThrow(BadRequestException);
    });

    it('camino feliz: pasa a CONFIRMED y llama a chatService.ensureConversationForWalk', async () => {
      setupWalkerWalk(WalkStatus.PENDING);
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.CONFIRMED });

      await service.confirm(WALKER_USER_ID, WALK_ID);

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: WalkStatus.CONFIRMED } }),
      );
      expect(chatService.ensureConversationForWalk).toHaveBeenCalledWith(WALK_ID);
    });

    it('camino feliz: emite emitStatusChanged y notifyWalkStatusChange', async () => {
      setupWalkerWalk(WalkStatus.PENDING);
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.CONFIRMED });

      await service.confirm(WALKER_USER_ID, WALK_ID);

      expect(trackingGateway.emitStatusChanged).toHaveBeenCalledWith(WALK_ID, WalkStatus.CONFIRMED);
      expect(notificationsService.notifyWalkStatusChange).toHaveBeenCalledWith(WALK_ID, WalkStatus.CONFIRMED);
    });
  });

  // ─── reject() ─────────────────────────────────────────────────────────────

  describe('reject()', () => {
    it('ForbiddenException si no existe walkerProfile', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.reject(WALKER_USER_ID, WALK_ID)).rejects.toThrow(ForbiddenException);
    });

    it('NotFoundException si el walk no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.reject(WALKER_USER_ID, WALK_ID)).rejects.toThrow(NotFoundException);
    });

    it('BadRequestException si el walk no está en PENDING', async () => {
      setupWalkerWalk(WalkStatus.CONFIRMED);
      await expect(service.reject(WALKER_USER_ID, WALK_ID)).rejects.toThrow(BadRequestException);
    });

    it('camino feliz: pasa a CANCELLED_WALKER', async () => {
      setupWalkerWalk(WalkStatus.PENDING);
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.CANCELLED_WALKER });

      await service.reject(WALKER_USER_ID, WALK_ID);

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: WalkStatus.CANCELLED_WALKER } }),
      );
    });
  });

  // ─── markOnWay() ──────────────────────────────────────────────────────────

  describe('markOnWay()', () => {
    it('ForbiddenException si no existe walkerProfile', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.markOnWay(WALKER_USER_ID, WALK_ID)).rejects.toThrow(ForbiddenException);
    });

    it('NotFoundException si el walk no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.markOnWay(WALKER_USER_ID, WALK_ID)).rejects.toThrow(NotFoundException);
    });

    it('BadRequestException si el walk no está en CONFIRMED', async () => {
      setupWalkerWalk(WalkStatus.PENDING); // requiere CONFIRMED
      await expect(service.markOnWay(WALKER_USER_ID, WALK_ID)).rejects.toThrow(BadRequestException);
    });

    it('camino feliz: pasa a WALKER_ON_WAY', async () => {
      setupWalkerWalk(WalkStatus.CONFIRMED);
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.WALKER_ON_WAY });

      await service.markOnWay(WALKER_USER_ID, WALK_ID);

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: WalkStatus.WALKER_ON_WAY } }),
      );
    });
  });

  // ─── start() ──────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('ForbiddenException si no existe walkerProfile', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.start(WALKER_USER_ID, WALK_ID)).rejects.toThrow(ForbiddenException);
    });

    it('NotFoundException si el walk no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.start(WALKER_USER_ID, WALK_ID)).rejects.toThrow(NotFoundException);
    });

    it('BadRequestException si el walk no está en WALKER_ON_WAY', async () => {
      setupWalkerWalk(WalkStatus.CONFIRMED); // requiere WALKER_ON_WAY
      await expect(service.start(WALKER_USER_ID, WALK_ID)).rejects.toThrow(BadRequestException);
    });

    it('camino feliz: pasa a IN_PROGRESS y setea startedAt', async () => {
      setupWalkerWalk(WalkStatus.WALKER_ON_WAY);
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.IN_PROGRESS });

      await service.start(WALKER_USER_ID, WALK_ID);

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status:    WalkStatus.IN_PROGRESS,
            startedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // ─── finish() ─────────────────────────────────────────────────────────────

  describe('finish()', () => {
    it('ForbiddenException si no existe walkerProfile', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.finish(WALKER_USER_ID, WALK_ID)).rejects.toThrow(ForbiddenException);
    });

    it('NotFoundException si el walk no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.finish(WALKER_USER_ID, WALK_ID)).rejects.toThrow(NotFoundException);
    });

    it('BadRequestException si el walk no está en IN_PROGRESS', async () => {
      setupWalkerWalk(WalkStatus.WALKER_ON_WAY); // requiere IN_PROGRESS
      await expect(service.finish(WALKER_USER_ID, WALK_ID)).rejects.toThrow(BadRequestException);
    });

    it('camino feliz: pasa a COMPLETED y setea endedAt', async () => {
      setupWalkerWalk(WalkStatus.IN_PROGRESS);
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.COMPLETED });

      await service.finish(WALKER_USER_ID, WALK_ID);

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status:  WalkStatus.COMPLETED,
            endedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // ─── cancel() ─────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('lanza NotFoundException si el walk no existe', async () => {
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.cancel(WALKER_USER_ID, UserRole.WALKER, WALK_ID, {}))
        .rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el walk no está en PENDING ni CONFIRMED', async () => {
      prisma.walk.findUnique.mockResolvedValue({ ...BASE_WALK, status: WalkStatus.IN_PROGRESS });
      await expect(service.cancel(WALKER_USER_ID, UserRole.WALKER, WALK_ID, {}))
        .rejects.toThrow(BadRequestException);
    });

    it('WALKER: ForbiddenException si el walk no le pertenece', async () => {
      prisma.walk.findUnique.mockResolvedValue({ ...BASE_WALK, walkerId: 'other-walker' });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER); // id = WALKER_PROFILE_ID
      await expect(service.cancel(WALKER_USER_ID, UserRole.WALKER, WALK_ID, {}))
        .rejects.toThrow(ForbiddenException);
    });

    it('WALKER: camino feliz — pasa a CANCELLED_WALKER con cancellationReason', async () => {
      prisma.walk.findUnique.mockResolvedValue(BASE_WALK); // walkerId = WALKER_PROFILE_ID
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.CANCELLED_WALKER });

      await service.cancel(WALKER_USER_ID, UserRole.WALKER, WALK_ID, { cancellationReason: 'Emergencia' });

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status:             WalkStatus.CANCELLED_WALKER,
            cancellationReason: 'Emergencia',
          }),
        }),
      );
    });

    it('OWNER: ForbiddenException si no existe ownerProfile', async () => {
      prisma.walk.findUnique.mockResolvedValue(BASE_WALK);
      prisma.ownerProfile.findUnique.mockResolvedValue(null);
      await expect(service.cancel(OWNER_USER_ID, UserRole.OWNER, WALK_ID, {}))
        .rejects.toThrow(ForbiddenException);
    });

    it('OWNER: ForbiddenException si no es participante del walk', async () => {
      prisma.walk.findUnique.mockResolvedValue(BASE_WALK);
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue(null);
      await expect(service.cancel(OWNER_USER_ID, UserRole.OWNER, WALK_ID, {}))
        .rejects.toThrow(ForbiddenException);
    });

    it('OWNER: camino feliz — pasa a CANCELLED_OWNER con cancellationReason', async () => {
      prisma.walk.findUnique.mockResolvedValue(BASE_WALK);
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue({
        id: 'p-1', walkId: WALK_ID, ownerId: OWNER_PROFILE_ID,
      });
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.CANCELLED_OWNER });

      await service.cancel(OWNER_USER_ID, UserRole.OWNER, WALK_ID, { cancellationReason: 'No puedo' });

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status:             WalkStatus.CANCELLED_OWNER,
            cancellationReason: 'No puedo',
          }),
        }),
      );
    });
  });

  // ─── getLocations() ───────────────────────────────────────────────────────

  describe('getLocations()', () => {
    const LOCATIONS = [
      { lat: -34.5885, lng: -58.4233, recordedAt: new Date('2026-07-06T10:00:00Z') },
      { lat: -34.5890, lng: -58.4240, recordedAt: new Date('2026-07-06T10:05:00Z') },
    ];

    it('lanza NotFoundException si el walk no existe', async () => {
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.getLocations(WALKER_USER_ID, UserRole.WALKER, WALK_ID))
        .rejects.toThrow(NotFoundException);
    });

    it('ForbiddenException si WALKER no tiene acceso al walk', async () => {
      prisma.walk.findUnique.mockResolvedValue({ id: WALK_ID, walkerId: 'other-walker' });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER); // id = WALKER_PROFILE_ID
      await expect(service.getLocations(WALKER_USER_ID, UserRole.WALKER, WALK_ID))
        .rejects.toThrow(ForbiddenException);
    });

    it('camino feliz: devuelve ubicaciones ordenadas por recordedAt asc', async () => {
      prisma.walk.findUnique.mockResolvedValue({ id: WALK_ID, walkerId: WALKER_PROFILE_ID });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walkLocation.findMany.mockResolvedValue(LOCATIONS);

      const result = await service.getLocations(WALKER_USER_ID, UserRole.WALKER, WALK_ID);

      expect(prisma.walkLocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where:   { walkId: WALK_ID },
          orderBy: { recordedAt: 'asc' },
        }),
      );
      expect(result).toEqual(LOCATIONS);
    });
  });
});
