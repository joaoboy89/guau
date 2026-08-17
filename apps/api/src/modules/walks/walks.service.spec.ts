import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WalkStatus, WalkMode, VerificationStatus, UserRole, NotPerformedReason, ClosedBy, StartVerification,
} from '@prisma/client';
import { WalksService } from './walks.service';
import { PrismaService } from '../../database/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../../common/services/mail.service';
import {
  NOTIFICATION_TYPES, START_WITHOUT_CODE_REASON, START_WITHOUT_CODE_REASON_LABEL, PICKUP_CODE,
} from '@guau/shared';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WALKER_PROFILE_ID = 'wp-1';
const OWNER_PROFILE_ID  = 'op-1';
const WALK_ID           = 'walk-1';
const WALKER_USER_ID    = 'walker-user-1';
const OWNER_USER_ID     = 'owner-user-1';
const DOG_ID            = 'dog-1';
const WALK_TYPE_ID      = 'wt-1';
// Para los tests de start() que necesitan pasar el codigo correcto — no
// forma parte de BASE_WALK/WALK_FULL (que no lo tienen) para no alterar
// ningun test que compara contra expectedPublicWalk().
const TEST_PICKUP_CODE  = '4821';

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
  id:            WALK_ID,
  walkerId:      WALKER_PROFILE_ID,
  status:        WalkStatus.PENDING,
  scheduledAt:   new Date('2026-07-06T12:00:00.000Z'),
  // "Ya en camino" por defecto (no null): la mayoría de estos tests no le
  // interesa la ofuscación del punto de encuentro, así que el default deja
  // ver la dirección real y coincide con expectedPublicWalk() sin que cada
  // test tenga que pensar en esto. Los tests de ofuscación (más abajo) lo
  // pisan a null a propósito.
  onWayAt:       new Date('2026-07-06T09:00:00.000Z') as Date | null,
  totalAmount:   1000,
  pickupAddress: 'Av. Santa Fe 1234, Palermo',
  pickupLat:     -34.5885,
  pickupLng:     -58.4233,
};

// Versión extendida con relaciones (equivalente al WALK_INCLUDE del servicio,
// ya en la forma que devuelve Prisma con select — no include — en owner y dog)
const WALK_FULL = {
  ...BASE_WALK,
  startedAt: null,
  walkType: { id: WALK_TYPE_ID, label: 'Paseo básico', durationMinutes: 30 },
  walker: {
    id:                  WALKER_PROFILE_ID,
    bio:                 'Amante de los perros',
    rating:              4.8,
    totalReviews:        12,
    isAvailable:         true,
    verificationStatus:  VerificationStatus.VERIFIED,
    maxDogsPerWalk:      3,
    user: { firstName: 'Juan', lastName: 'Pérez', avatarUrl: null, phone: null },
  },
  participants: [],
};

// Forma que devuelve toPublicWalk() — usada por findById() y las dos ramas
// de findMyWalks(). Reconstruida acá campo por campo (no como spread de
// WALK_FULL) para que un campo agregado a WALK_FULL sin querer no se cuele
// en la aserción y tape una regresión (ej. walkerId, que WALK_FULL sí tiene
// pero la salida pública no debe tener).
function expectedPublicWalk(walk: typeof WALK_FULL, isPaid: boolean) {
  return {
    id:            walk.id,
    status:        walk.status,
    scheduledAt:   walk.scheduledAt,
    startedAt:     walk.startedAt,
    pickupAddress: walk.pickupAddress,
    pickupLat:     walk.pickupLat,
    pickupLng:     walk.pickupLng,
    totalAmount:   walk.totalAmount,
    walkType:      walk.walkType,
    walker:        walk.walker,
    participants:  walk.participants,
    isPaid,
    isExpired:     walk.scheduledAt.getTime() <= Date.now(),
  };
}

// Siempre en el futuro relativo a "ahora" — evita que la suite se rompa con el
// paso del tiempo una vez que create() valida que scheduledAt sea futuro.
const FUTURE_SCHEDULED_AT = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const CREATE_DTO = {
  walkerId:       WALKER_PROFILE_ID,
  walkTypeId:     WALK_TYPE_ID,
  dogIds:         [DOG_ID],
  scheduledAt:    FUTURE_SCHEDULED_AT,
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
      count:      jest.fn(),
    },
    walkLocation: { findMany: jest.fn() },
  };
}

// Solo para tests — nunca en producción (la real sale de una variable de
// entorno, ver .env.example). Necesita >=16 caracteres para pasar
// validatePickupZoneSecret().
const TEST_PICKUP_ZONE_SECRET = 'solo-para-tests-nunca-en-produccion';

function buildConfigMock() {
  return {
    get: jest.fn((key: string) => {
      if (key === 'MP_MARKETPLACE_FEE') return '0.15';
      if (key === 'PICKUP_ZONE_SECRET') return TEST_PICKUP_ZONE_SECRET;
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
  let notificationsService:  { notifyWalkStatusChange: jest.Mock; notifyNewWalkRequest: jest.Mock; create: jest.Mock };
  let mail:                  { sendNotPerformedAlert: jest.Mock };

  beforeEach(async () => {
    prisma = buildPrismaMock();
    // El callback de $transaction recibe el mismo mock como "tx"
    prisma.$transaction.mockImplementation(
      (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma),
    );

    trackingGateway      = { emitStatusChanged: jest.fn() };
    chatService          = { ensureConversationForWalk: jest.fn().mockResolvedValue({}) };
    notificationsService = {
      notifyWalkStatusChange: jest.fn().mockResolvedValue({}),
      notifyNewWalkRequest:   jest.fn().mockResolvedValue({}),
      create:                 jest.fn().mockResolvedValue({}),
    };
    mail = { sendNotPerformedAlert: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalksService,
        { provide: PrismaService,          useValue: prisma },
        { provide: ConfigService,          useValue: buildConfigMock() },
        { provide: TrackingGateway,        useValue: trackingGateway },
        { provide: ChatService,            useValue: chatService },
        { provide: NotificationsService,   useValue: notificationsService },
        { provide: MailService,            useValue: mail },
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
    // confirm() consulta walk.findMany para assertNoOverdueInProgress — sin
    // esto, un test que no lo necesita (todos salvo los de bloqueo) rompe
    // con "undefined no tiene .find()". Default: sin IN_PROGRESS vencidos.
    prisma.walk.findMany.mockResolvedValue([]);
  }

  // ─── constructor — validación de MP_MARKETPLACE_FEE ────────────────────────

  describe('constructor — validación de MP_MARKETPLACE_FEE', () => {
    function buildServiceWithFee(feeValue: string | null) {
      const cfg = {
        get: jest.fn((key: string) => {
          if (key === 'MP_MARKETPLACE_FEE') return feeValue;
          if (key === 'PICKUP_ZONE_SECRET') return TEST_PICKUP_ZONE_SECRET;
          return null;
        }),
      };
      return () => new WalksService(prisma as any, cfg as any);
    }

    it('sin MP_MARKETPLACE_FEE seteada, no revienta (usa default 0.15)', () => {
      expect(buildServiceWithFee(null)).not.toThrow();
    });

    it('"0.15" es una fracción válida', () => {
      expect(buildServiceWithFee('0.15')).not.toThrow();
    });

    it('"15" (porcentaje en vez de fracción) revienta al arrancar', () => {
      expect(buildServiceWithFee('15')).toThrow();
    });

    it('"0" revienta al arrancar (fuera de rango)', () => {
      expect(buildServiceWithFee('0')).toThrow();
    });

    it('"1" revienta al arrancar (fuera de rango — comisión del 100%)', () => {
      expect(buildServiceWithFee('1')).toThrow();
    });

    it('"abc" (no numérico) revienta al arrancar', () => {
      expect(buildServiceWithFee('abc')).toThrow();
    });
  });

  // Falla cerrado, mismo criterio que MP_MARKETPLACE_FEE arriba: sin este
  // secreto, la ofuscación del punto de encuentro es reversible con el
  // walkId a la vista (ver packages/shared/geo/pickup-zone.ts) — mejor que
  // la API no arranque a que sirva una protección decorativa.
  describe('constructor — validación de PICKUP_ZONE_SECRET', () => {
    function buildServiceWithSecret(secretValue: string | null) {
      const cfg = {
        get: jest.fn((key: string) => {
          if (key === 'MP_MARKETPLACE_FEE') return '0.15';
          if (key === 'PICKUP_ZONE_SECRET') return secretValue;
          return null;
        }),
      };
      return () => new WalksService(prisma as any, cfg as any);
    }

    it('sin PICKUP_ZONE_SECRET seteada, revienta al arrancar', () => {
      expect(buildServiceWithSecret(null)).toThrow();
    });

    it('vacía, revienta al arrancar', () => {
      expect(buildServiceWithSecret('')).toThrow();
    });

    it('demasiado corta (menos de 16 caracteres), revienta al arrancar', () => {
      expect(buildServiceWithSecret('corta')).toThrow();
    });

    it('con exactamente 16 caracteres, no revienta (límite inclusive)', () => {
      expect(buildServiceWithSecret('a'.repeat(16))).not.toThrow();
    });

    it('con un secreto largo, no revienta', () => {
      expect(buildServiceWithSecret(TEST_PICKUP_ZONE_SECRET)).not.toThrow();
    });
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('lanza BadRequestException si scheduledAt está en el pasado', async () => {
      const pastDto = { ...CREATE_DTO, scheduledAt: new Date(Date.now() - 60_000).toISOString() };
      await expect(service.create(OWNER_USER_ID, pastDto)).rejects.toThrow(BadRequestException);
      // Falla antes de tocar la DB
      expect(prisma.ownerProfile.findUnique).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si scheduledAt es exactamente ahora (no estrictamente futuro)', async () => {
      const nowDto = { ...CREATE_DTO, scheduledAt: new Date().toISOString() };
      await expect(service.create(OWNER_USER_ID, nowDto)).rejects.toThrow(BadRequestException);
    });

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

    it('camino feliz: notifica al paseador de la nueva solicitud tras commitear la transacción', async () => {
      setupCreateMocks();

      await service.create(OWNER_USER_ID, CREATE_DTO);

      expect(notificationsService.notifyNewWalkRequest).toHaveBeenCalledWith(WALK_ID);
      expect(notificationsService.notifyNewWalkRequest).toHaveBeenCalledTimes(1);
    });

    it('un fallo del servicio de notificaciones no rompe la creación de la reserva', async () => {
      setupCreateMocks();
      notificationsService.notifyNewWalkRequest.mockRejectedValue(new Error('boom'));

      const result = await service.create(OWNER_USER_ID, CREATE_DTO);

      expect(result).toEqual(expectedPublicWalk(WALK_FULL, false));
    });
  });

  // ─── create() — validación de horario en hora argentina (fix timezone) ────
  // WalkerSchedule.dayOfWeek/startTime/endTime se interpretan en hora
  // argentina. Estas fechas son fijas (no relativas a "ahora") a propósito:
  // lo que se está probando es la conversión de un instante UTC puntual a
  // día/hora ART, no "cualquier fecha futura" — un offset relativo perdería
  // el día de semana exacto que cada caso necesita.

  describe('create() — validación de horario en hora argentina (fix timezone)', () => {
    it('reserva 21:00 ART (que cruza el día en UTC) matchea la franja del día ART correcto', async () => {
      setupCreateMocks();
      // 2030-01-09T00:00:00Z = miércoles 00:00 UTC = martes 21:00 ART
      const dto = { ...CREATE_DTO, scheduledAt: '2030-01-09T00:00:00.000Z' };
      prisma.walkerSchedule.findFirst.mockResolvedValue({
        id: 'schedule-tue', walkerId: WALKER_PROFILE_ID,
        dayOfWeek: 2, startTime: '18:00', endTime: '23:59', isActive: true,
      });

      await expect(service.create(OWNER_USER_ID, dto)).resolves.toBeDefined();

      // dayOfWeek 2 = martes — NO miércoles (que es lo que getDay() daría en UTC)
      expect(prisma.walkerSchedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dayOfWeek: 2,
            startTime: { lte: '21:00' },
            endTime: { gt: '21:00' },
          }),
        }),
      );
    });

    it('reserva 20:59 ART con franja hasta 23:59 — matchea justo antes del límite', async () => {
      setupCreateMocks();
      // 2030-01-08T23:59:00Z = martes 20:59 ART
      const dto = { ...CREATE_DTO, scheduledAt: '2030-01-08T23:59:00.000Z' };
      prisma.walkerSchedule.findFirst.mockResolvedValue({
        id: 'schedule-tue', walkerId: WALKER_PROFILE_ID,
        dayOfWeek: 2, startTime: '18:00', endTime: '23:59', isActive: true,
      });

      await expect(service.create(OWNER_USER_ID, dto)).resolves.toBeDefined();

      expect(prisma.walkerSchedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dayOfWeek: 2,
            startTime: { lte: '20:59' },
            endTime: { gt: '20:59' },
          }),
        }),
      );
    });

    it('reserva en franja normal 9-18 sigue funcionando después del fix', async () => {
      setupCreateMocks();
      // 2030-01-15T15:00:00Z = martes 12:00 ART
      const dto = { ...CREATE_DTO, scheduledAt: '2030-01-15T15:00:00.000Z' };
      prisma.walkerSchedule.findFirst.mockResolvedValue({
        id: 'schedule-tue', walkerId: WALKER_PROFILE_ID,
        dayOfWeek: 2, startTime: '09:00', endTime: '18:00', isActive: true,
      });

      await expect(service.create(OWNER_USER_ID, dto)).resolves.toBeDefined();

      expect(prisma.walkerSchedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dayOfWeek: 2,
            startTime: { lte: '12:00' },
            endTime: { gt: '12:00' },
          }),
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

    it('WALKER: camino feliz — devuelve walks filtrados por walkerId del perfil, con isPaid e isExpired', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([WALK_FULL]);
      prisma.walk.count.mockResolvedValue(1);

      const result = await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, {});

      expect(prisma.walk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { walkerId: WALKER_PROFILE_ID, scheduledAt: { gte: expect.any(Date) } },
        }),
      );
      // WALK_FULL no tiene mpPaymentId (undefined) → isPaid false;
      // scheduledAt 2026-07-06 ya pasó → isExpired true.
      expect(result.data).toEqual([expectedPublicWalk(WALK_FULL, false)]);
    });

    it('OWNER: lanza NotFoundException si no existe ownerProfile', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(null);
      await expect(service.findMyWalks(OWNER_USER_ID, UserRole.OWNER, {}))
        .rejects.toThrow(NotFoundException);
    });

    it('OWNER: camino feliz — filtra walks por participants.some(ownerId), con isPaid e isExpired', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walk.findMany.mockResolvedValue([WALK_FULL]);
      prisma.walk.count.mockResolvedValue(1);

      const result = await service.findMyWalks(OWNER_USER_ID, UserRole.OWNER, {});

      // El where ya no arma un id: { in: [...] } a partir de una consulta
      // previa de WalkParticipant — filtra directo por la relación.
      expect(prisma.walk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            participants: { some: { ownerId: OWNER_PROFILE_ID } },
            scheduledAt: { gte: expect.any(Date) },
          },
        }),
      );
      expect(result.data).toEqual([expectedPublicWalk(WALK_FULL, false)]);
    });

    it('OWNER: findMyWalks ya no hace la consulta previa de walkParticipant.findMany', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(0);

      await service.findMyWalks(OWNER_USER_ID, UserRole.OWNER, {});

      expect(prisma.walkParticipant.findMany).not.toHaveBeenCalled();
    });

    it('OWNER: un paseo con dos participantes del mismo dueño (dos perros) aparece una sola vez', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      // El mock ya representa lo que Prisma devolvería con participants.some:
      // el walk aparece UNA vez en el array, con los dos participantes
      // adentro — some() es un WHERE EXISTS, no un join que duplica filas.
      const sameOwner = { id: OWNER_PROFILE_ID, user: { firstName: 'Ana', lastName: 'Gómez', avatarUrl: null } };
      prisma.walk.findMany.mockResolvedValue([{
        ...WALK_FULL,
        participants: [
          { dog: { id: 'd1', name: 'Toto', size: 'MEDIANO' }, owner: sameOwner },
          { dog: { id: 'd2', name: 'Luna', size: 'PEQUEÑO' }, owner: sameOwner },
        ],
      }]);
      prisma.walk.count.mockResolvedValue(1);

      const result = await service.findMyWalks(OWNER_USER_ID, UserRole.OWNER, {});

      expect(result.data).toHaveLength(1);
      expect(result.data[0].participants).toHaveLength(2);
    });

    it('OWNER: aplica los defaults (limit 50, ventana de 30 días) sin parámetros', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(0);

      await service.findMyWalks(OWNER_USER_ID, UserRole.OWNER, {});

      expect(prisma.walk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
      const calledWhere = prisma.walk.findMany.mock.calls[0][0].where;
      expect(calledWhere).toHaveProperty('scheduledAt.gte');
    });

    it('WALKER: isPaid es true cuando mpPaymentId es numérico', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([{ ...WALK_FULL, mpPaymentId: '99999' }]);
      prisma.walk.count.mockResolvedValue(1);

      const result = await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, {});

      expect(result.data[0].isPaid).toBe(true);
    });

    it('OWNER: isExpired es false cuando scheduledAt es futuro', async () => {
      const futureWalk = { ...WALK_FULL, scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walkParticipant.findMany.mockResolvedValue([{ walkId: WALK_ID }]);
      prisma.walk.findMany.mockResolvedValue([futureWalk]);
      prisma.walk.count.mockResolvedValue(1);

      const result = await service.findMyWalks(OWNER_USER_ID, UserRole.OWNER, {});

      expect(result.data[0].isExpired).toBe(false);
    });

    it('con query.status aplica filtro adicional en el where', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(0);

      await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, { status: WalkStatus.PENDING });

      // PENDING no lleva filtro de fecha (ver test dedicado más abajo) —
      // el where acá es solo walkerId + status.
      expect(prisma.walk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { walkerId: WALKER_PROFILE_ID, status: WalkStatus.PENDING },
        }),
      );
    });

    it('lista blanca en findMyWalks: no expone mpPaymentId ni mpRefundId', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([
        { ...WALK_FULL, mpPaymentId: '99999', mpRefundId: 'refund-1' },
      ]);
      prisma.walk.count.mockResolvedValue(1);

      const result = await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, {});

      expect(result.data[0]).not.toHaveProperty('mpPaymentId');
      expect(result.data[0]).not.toHaveProperty('mpRefundId');
    });

    it('el walker de findMyWalks no arrastra mpAccessToken aunque venga en el dato crudo', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([
        { ...WALK_FULL, walker: { ...WALK_FULL.walker, mpAccessToken: 'no-es-un-token-real', mpUserId: 'fake-123' } },
      ]);
      prisma.walk.count.mockResolvedValue(1);

      const result = await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, {});

      expect(result.data[0].walker).not.toHaveProperty('mpAccessToken');
      expect(result.data[0].walker).not.toHaveProperty('mpUserId');
    });

    it('el owner de un participante en findMyWalks no expone domicilio ni coordenadas', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([{
        ...WALK_FULL,
        participants: [{
          dog: { id: 'd1', name: 'Toto', size: 'MEDIANO' },
          owner: {
            id: 'o1',
            address: 'Calle Falsa 123', neighborhood: 'Palermo', lat: -34.5, lng: -58.4,
            user: { firstName: 'Ana', lastName: 'Gómez', avatarUrl: null },
          },
        }],
      }]);
      prisma.walk.count.mockResolvedValue(1);

      const result = await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, {});

      const owner = result.data[0].participants[0].owner;
      expect(owner).not.toHaveProperty('address');
      expect(owner).not.toHaveProperty('neighborhood');
      expect(owner).not.toHaveProperty('lat');
      expect(owner).not.toHaveProperty('lng');
    });

    // ─── Paginación (Ventana 4) ──────────────────────────────────────────────

    it('aplica take y skip según page/limit, en las dos ramas', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(0);

      await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, { page: 3, limit: 20 });

      expect(prisma.walk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }), // (page 3 - 1) * 20
      );
    });

    it('OWNER: aplica take y skip según page/limit', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walkParticipant.findMany.mockResolvedValue([{ walkId: WALK_ID }]);
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(0);

      await service.findMyWalks(OWNER_USER_ID, UserRole.OWNER, { page: 2, limit: 10 });

      expect(prisma.walk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    // Fail closed: el que no manda page/limit/days no queda sin protección —
    // queda con los defaults (limit 50, ventana de 30 días). Este test es la
    // garantía de que "no pedir nada" no es lo mismo que "pedir todo".
    it('sin parámetros, aplica los defaults: limit 50 y ventana de 30 días', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(0);

      const before = Date.now();
      const result = await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, {});
      const after = Date.now();

      expect(prisma.walk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
      const calledWhere = prisma.walk.findMany.mock.calls[0][0].where;
      const gte = calledWhere.scheduledAt.gte.getTime();
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      // El threshold tiene que caer en la ventana [ahora-30d antes de la
      // llamada, ahora-30d después de la llamada] — con margen de milisegundos
      // por el tiempo real que tarda en ejecutar el test.
      expect(gte).toBeGreaterThanOrEqual(before - THIRTY_DAYS_MS);
      expect(gte).toBeLessThanOrEqual(after - THIRTY_DAYS_MS);
      expect(result.meta).toEqual({ total: 0, page: 1, limit: 50, totalPages: 0, days: 30 });
    });

    it('status=PENDING NO aplica el filtro de fecha — un pendiente viejo aparece igual', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(0);

      await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, { status: WalkStatus.PENDING });

      const calledWhere = prisma.walk.findMany.mock.calls[0][0].where;
      expect(calledWhere).not.toHaveProperty('scheduledAt');
    });

    it('status=PENDING SÍ aplica el techo de limit — la excepción es de producto, no de defensa', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(0);

      await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, {
        status: WalkStatus.PENDING,
        limit: 5,
      });

      expect(prisma.walk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });

    it('sin status, usa el threshold de scheduledAt derivado de days (por defecto 30)', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(0);

      await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, { days: 10 });

      const calledWhere = prisma.walk.findMany.mock.calls[0][0].where;
      const gte = calledWhere.scheduledAt.gte as Date;
      const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
      // Un walk de hace 60 días quedaría antes de este threshold (no viene);
      // uno de hace 5 días, después (sí viene) — es lo que Prisma filtraría
      // con este gte en una base real.
      const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
      const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
      expect(sixtyDaysAgo).toBeLessThan(gte.getTime());
      expect(fiveDaysAgo).toBeGreaterThan(gte.getTime());
      expect(gte.getTime()).toBeGreaterThan(Date.now() - TEN_DAYS_MS - 5000);
    });

    it('meta.totalPages se calcula bien y meta.days refleja la ventana usada', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(45);

      const result = await service.findMyWalks(WALKER_USER_ID, UserRole.WALKER, { limit: 20, days: 15 });

      expect(result.meta).toEqual({ total: 45, page: 1, limit: 20, totalPages: 3, days: 15 });
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

    it('default-deny: ForbiddenException para un rol desconocido (no WALKER/OWNER/ADMIN)', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_FULL);
      await expect(service.findById(OWNER_USER_ID, 'SUPERUSER', WALK_ID))
        .rejects.toThrow(ForbiddenException);
    });

    it('ADMIN tiene acceso explícito sin chequeo de pertenencia/participación', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_FULL);

      const result = await service.findById('admin-user-1', UserRole.ADMIN, WALK_ID);

      expect(result).toEqual(expectedPublicWalk(WALK_FULL, false));
      expect(prisma.walkerProfile.findUnique).not.toHaveBeenCalled();
      expect(prisma.ownerProfile.findUnique).not.toHaveBeenCalled();
    });

    it('camino feliz WALKER: el paseador del walk puede verlo y walker no expone mpAccessToken', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_FULL);
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      const result = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);
      expect(result).toEqual(expectedPublicWalk(WALK_FULL, false));
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
      expect(result).toEqual(expectedPublicWalk(WALK_FULL, false));
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

    it('isExpired es true cuando scheduledAt ya pasó', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_FULL); // scheduledAt: 2026-07-06, ya pasado
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      const result = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);
      expect(result.isExpired).toBe(true);
    });

    it('isExpired es false cuando scheduledAt es futuro', async () => {
      const futureWalk = { ...WALK_FULL, scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
      prisma.walk.findUnique.mockResolvedValue(futureWalk);
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      const result = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);
      expect(result.isExpired).toBe(false);
    });

    it('lista blanca: no expone mpPaymentId ni mpRefundId en la respuesta', async () => {
      prisma.walk.findUnique.mockResolvedValue({
        ...WALK_FULL,
        mpPaymentId: '99999',
        mpRefundId: 'refund-1',
      });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      const result = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);
      expect(result).not.toHaveProperty('mpPaymentId');
      expect(result).not.toHaveProperty('mpRefundId');
    });

    // ─── Lista blanca anidada — hay que ensuciar el mock para que pruebe algo.
    // Un test de ausencia solo vale si el campo estaba presente a la entrada:
    // si el mock nunca tuvo el campo, "no lo tiene a la salida" no prueba nada.

    it('el walker de la salida no arrastra mpAccessToken aunque venga en el dato crudo', async () => {
      prisma.walk.findUnique.mockResolvedValue({
        ...WALK_FULL,
        walker: { ...WALK_FULL.walker, mpAccessToken: 'no-es-un-token-real', mpUserId: 'fake-123' },
      });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      const result = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);
      expect(result.walker).not.toHaveProperty('mpAccessToken');
      expect(result.walker).not.toHaveProperty('mpUserId');
    });

    it('el owner de un participante no expone domicilio ni coordenadas aunque vengan en el dato crudo', async () => {
      prisma.walk.findUnique.mockResolvedValue({
        ...WALK_FULL,
        participants: [{
          dog: { id: 'd1', name: 'Toto', size: 'MEDIANO' },
          owner: {
            id: 'o1',
            address: 'Calle Falsa 123', neighborhood: 'Palermo', lat: -34.5, lng: -58.4,
            user: { firstName: 'Ana', lastName: 'Gómez', avatarUrl: null },
          },
        }],
      });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      const result = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);
      const owner = result.participants[0].owner;
      expect(owner).not.toHaveProperty('address');
      expect(owner).not.toHaveProperty('neighborhood');
      expect(owner).not.toHaveProperty('lat');
      expect(owner).not.toHaveProperty('lng');
    });
  });

  // ─── confirm() ────────────────────────────────────────────────────────────

  describe('confirm()', () => {
    it('ForbiddenException si no existe walkerProfile', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.confirm(WALKER_USER_ID, WALK_ID)).rejects.toThrow(ForbiddenException);
    });

    it('IDOR: ForbiddenException si el walkerProfile existe pero NO es el asignado al walk', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER); // id = WALKER_PROFILE_ID
      prisma.walk.findUnique.mockResolvedValue({ ...BASE_WALK, walkerId: 'wp-otro-paseador' });
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

    // Las 7 rutas que escriben (confirm/reject/on-way/start/finish/cancel, más
    // create) pasan por updateStatus(), que ahora también devuelve
    // toPublicWalk(). Antes devolvían el Walk crudo de Prisma: mpPaymentId,
    // platformFee, commissionRate, walkerId, y el walker/participants sin
    // recortar. No era fuga entre usuarios (a quien llama ya se le validó la
    // pertenencia), pero es la misma info que la lista blanca decidió que no
    // viaja, saliendo por otra puerta. confirm() alcanza para probarlo — el
    // resto comparte el mismo updateStatus().
    it('lista blanca: la respuesta de confirm() no expone plata interna ni mpAccessToken del walker', async () => {
      setupWalkerWalk(WalkStatus.PENDING);
      prisma.walk.update.mockResolvedValue({
        ...WALK_FULL,
        status: WalkStatus.CONFIRMED,
        mpPaymentId: '99999',
        platformFee: 450,
        commissionRate: 0.15,
        walkerAmount: 2420.91,
        walker: { ...WALK_FULL.walker, mpAccessToken: 'no-es-un-token-real', mpUserId: 'fake-123' },
      });

      const result = await service.confirm(WALKER_USER_ID, WALK_ID);

      expect(result).not.toHaveProperty('mpPaymentId');
      expect(result).not.toHaveProperty('platformFee');
      expect(result).not.toHaveProperty('commissionRate');
      expect(result).not.toHaveProperty('walkerAmount');
      expect(result).not.toHaveProperty('walkerId');
      expect(result.walker).not.toHaveProperty('mpAccessToken');
      expect(result.walker).not.toHaveProperty('mpUserId');
    });
  });

  // ─── reject() ─────────────────────────────────────────────────────────────

  describe('reject()', () => {
    it('ForbiddenException si no existe walkerProfile', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.reject(WALKER_USER_ID, WALK_ID)).rejects.toThrow(ForbiddenException);
    });

    it('IDOR: ForbiddenException si el walkerProfile existe pero NO es el asignado al walk', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findUnique.mockResolvedValue({ ...BASE_WALK, walkerId: 'wp-otro-paseador' });
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

    it('IDOR: ForbiddenException si el walkerProfile existe pero NO es el asignado al walk', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findUnique.mockResolvedValue({ ...BASE_WALK, walkerId: 'wp-otro-paseador' });
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

    it('camino feliz: pasa a WALKER_ON_WAY y setea onWayAt', async () => {
      setupWalkerWalk(WalkStatus.CONFIRMED); // BASE_WALK.scheduledAt ya pasó — canMarkOnWay no tiene techo, sigue true
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.WALKER_ON_WAY });

      await service.markOnWay(WALKER_USER_ID, WALK_ID);

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status:  WalkStatus.WALKER_ON_WAY,
            onWayAt: expect.any(Date),
          }),
        }),
      );
    });

    // ─── Guard de tiempo: "voy en camino" recién desde T-2h ────────────────

    it('BadRequestException si todavía no llegó a T-2h, con el horario en el mensaje', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      const scheduledAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4h en el futuro — antes de T-2h
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK, status: WalkStatus.CONFIRMED, scheduledAt, walkType: WALK_FULL.walkType,
      });

      await expect(service.markOnWay(WALKER_USER_ID, WALK_ID)).rejects.toThrow(BadRequestException);
      await expect(service.markOnWay(WALKER_USER_ID, WALK_ID)).rejects.toThrow(/Vas a poder/);
      expect(prisma.walk.update).not.toHaveBeenCalled();
    });
  });

  // ─── start() ──────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('ForbiddenException si no existe walkerProfile', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.start(WALKER_USER_ID, WALK_ID)).rejects.toThrow(ForbiddenException);
    });

    it('IDOR: ForbiddenException si el walkerProfile existe pero NO es el asignado al walk', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findUnique.mockResolvedValue({ ...BASE_WALK, walkerId: 'wp-otro-paseador' });
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

    it('camino feliz: pasa a IN_PROGRESS, setea startedAt y startedLate: false (a tiempo)', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      // scheduledAt = ahora — bien adentro de la ventana, mucho antes de T+10m
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK, status: WalkStatus.WALKER_ON_WAY, scheduledAt: new Date(),
        pickupCode: TEST_PICKUP_CODE, pickupCodeAttempts: 0,
      });
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.IN_PROGRESS });

      await service.start(WALKER_USER_ID, WALK_ID, { pickupCode: TEST_PICKUP_CODE });

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status:      WalkStatus.IN_PROGRESS,
            startedAt:   expect.any(Date),
            startedLate: false,
          }),
        }),
      );
    });

    // ─── Guard de tiempo: se habilita desde T-5m, sin techo ─────────────────

    it('BadRequestException si todavía no llegó a T-5m, con el horario en el mensaje', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      const scheduledAt = new Date(Date.now() + 30 * 60 * 1000); // 30min en el futuro — antes de T-5m
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK, status: WalkStatus.WALKER_ON_WAY, scheduledAt,
      });

      await expect(service.start(WALKER_USER_ID, WALK_ID)).rejects.toThrow(BadRequestException);
      await expect(service.start(WALKER_USER_ID, WALK_ID)).rejects.toThrow(/Vas a poder/);
      expect(prisma.walk.update).not.toHaveBeenCalled();
    });

    // canStart ya no tiene techo (bloque C, segunda parte): un inicio mucho
    // despues de T+10m ahora SE PERMITE — evidencia, no candado. Lo unico
    // que cambia es que queda marcado como tardio.
    it('mucho despues de T+10m: SÍ permite iniciar (ya no hay ventana cerrada) y marca startedLate: true', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      const scheduledAt = new Date(Date.now() - 60 * 60 * 1000); // 1h en el pasado — muy despues de T+10m
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK, status: WalkStatus.WALKER_ON_WAY, scheduledAt,
        pickupCode: TEST_PICKUP_CODE, pickupCodeAttempts: 0,
      });
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.IN_PROGRESS });

      await expect(
        service.start(WALKER_USER_ID, WALK_ID, { pickupCode: TEST_PICKUP_CODE }),
      ).resolves.toBeDefined();

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ startedLate: true }),
        }),
      );
    });

    it('justo en el límite de T+10m (11 min tarde): startedLate true; a los 9 min: false', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.IN_PROGRESS });

      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK, status: WalkStatus.WALKER_ON_WAY,
        scheduledAt: new Date(Date.now() - 11 * 60 * 1000),
        pickupCode: TEST_PICKUP_CODE, pickupCodeAttempts: 0,
      });
      await service.start(WALKER_USER_ID, WALK_ID, { pickupCode: TEST_PICKUP_CODE });
      expect(prisma.walk.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ startedLate: true }) }),
      );

      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK, status: WalkStatus.WALKER_ON_WAY,
        scheduledAt: new Date(Date.now() - 9 * 60 * 1000),
        pickupCode: TEST_PICKUP_CODE, pickupCodeAttempts: 0,
      });
      await service.start(WALKER_USER_ID, WALK_ID, { pickupCode: TEST_PICKUP_CODE });
      expect(prisma.walk.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ startedLate: false }) }),
      );
    });
  });

  // ─── Bloque D1 — código de retiro (docs/guau-politicas.md §3) ─────────────

  describe('bloque D1 — código de retiro', () => {
    // ─── El código NUNCA sale en el payload del paseador ─────────────────
    // El test que más importa del bloque: si un refactor futuro rompe esto,
    // toda la mecánica del código se vuelve decorativa (el paseador lo lee
    // de la respuesta y lo ingresa sin haber visto al dueño).

    it.each([
      WalkStatus.PENDING,
      WalkStatus.CONFIRMED,
      WalkStatus.WALKER_ON_WAY,
      WalkStatus.IN_PROGRESS,
      WalkStatus.COMPLETED,
    ])('el paseador NUNCA ve pickupCode en el payload — estado %s', async (status) => {
      prisma.walk.findUnique.mockResolvedValue({ ...WALK_FULL, status, pickupCode: TEST_PICKUP_CODE });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      const result = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);

      // No alcanza con pickupCode === undefined: eso también lo cumple un
      // objeto que SÍ tiene la clave con valor null. Lo que la política
      // exige es que la clave no exista.
      expect('pickupCode' in result).toBe(false);
    });

    it('el dueño SÍ ve pickupCode desde CONFIRMED', async () => {
      prisma.walk.findUnique.mockResolvedValue({
        ...WALK_FULL, status: WalkStatus.CONFIRMED, pickupCode: TEST_PICKUP_CODE,
      });
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue({
        id: 'p-1', walkId: WALK_ID, ownerId: OWNER_PROFILE_ID,
      });

      const result = await service.findById(OWNER_USER_ID, UserRole.OWNER, WALK_ID);

      expect((result as { pickupCode?: string }).pickupCode).toBe(TEST_PICKUP_CODE);
    });

    // ─── Generación en confirm() ───────────────────────────────────────────

    it('confirm() genera un pickupCode de 4 dígitos numéricos, en un update separado del de status', async () => {
      setupWalkerWalk(WalkStatus.PENDING);
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.CONFIRMED });

      await service.confirm(WALKER_USER_ID, WALK_ID);

      expect(prisma.walk.update).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ data: { pickupCode: expect.stringMatching(/^\d{4}$/) } }),
      );
      expect(prisma.walk.update).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ data: { status: WalkStatus.CONFIRMED } }),
      );
    });

    // ─── start() — validación del código ───────────────────────────────────

    describe('start() con código', () => {
      function setupWalkOnWay(pickupCodeAttempts: number) {
        prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
        prisma.walk.findUnique.mockResolvedValue({
          ...BASE_WALK, status: WalkStatus.WALKER_ON_WAY, scheduledAt: new Date(),
          pickupCode: TEST_PICKUP_CODE, pickupCodeAttempts,
        });
      }

      it('código correcto: arranca con startVerification CODE y startVerifyReason null', async () => {
        setupWalkOnWay(0);
        prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.IN_PROGRESS });

        await service.start(WALKER_USER_ID, WALK_ID, { pickupCode: TEST_PICKUP_CODE });

        expect(prisma.walk.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              startVerification: StartVerification.CODE,
              startVerifyReason: null,
            }),
          }),
        );
      });

      it('código incorrecto: BadRequestException, incrementa pickupCodeAttempts en la base y NO inicia el paseo', async () => {
        setupWalkOnWay(0);
        prisma.walk.update.mockResolvedValue({ pickupCodeAttempts: 1 });

        await expect(service.start(WALKER_USER_ID, WALK_ID, { pickupCode: '0000' }))
          .rejects.toThrow(BadRequestException);

        expect(prisma.walk.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: WALK_ID },
            data: { pickupCodeAttempts: { increment: 1 } },
          }),
        );
        expect(prisma.walk.update).not.toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ status: WalkStatus.IN_PROGRESS }) }),
        );
      });

      it('el mensaje de código incorrecto es idéntico sin importar el código (ninguna pista de "casi")', async () => {
        setupWalkOnWay(0);
        prisma.walk.update.mockResolvedValue({ pickupCodeAttempts: 1 });
        let farMessage: string | undefined;
        try {
          await service.start(WALKER_USER_ID, WALK_ID, { pickupCode: '0000' });
        } catch (e) {
          farMessage = (e as BadRequestException).message;
        }

        setupWalkOnWay(0);
        prisma.walk.update.mockResolvedValue({ pickupCodeAttempts: 1 });
        let closeMessage: string | undefined;
        try {
          // 3 de 4 dígitos coinciden con TEST_PICKUP_CODE ('4821') — tiene
          // que dar EXACTAMENTE el mismo mensaje que uno que no coincide en
          // ninguno.
          await service.start(WALKER_USER_ID, WALK_ID, { pickupCode: '4820' });
        } catch (e) {
          closeMessage = (e as BadRequestException).message;
        }

        expect(farMessage).toBeDefined();
        expect(farMessage).toEqual(closeMessage);
      });

      it('el contador de intentos persiste entre llamadas — no vive en memoria del proceso', async () => {
        // Simula que esta request es un contenedor nuevo (Cloud Run reciclado):
        // el service no tiene ningún estado propio, así que el único lugar de
        // donde puede salir "ya fallaste 3 veces" es lo que devuelve la base.
        // Con MAX_ATTEMPTS=5, este es el 4to intento: todavía queda 1.
        setupWalkOnWay(3);
        prisma.walk.update.mockResolvedValue({ pickupCodeAttempts: 4 });

        await expect(service.start(WALKER_USER_ID, WALK_ID, { pickupCode: '0000' }))
          .rejects.toThrow(/Te quedan 1 intento/);
      });

      it('límite de 5 intentos: el sexto rebota aunque el código sea correcto', async () => {
        setupWalkOnWay(PICKUP_CODE.MAX_ATTEMPTS); // ya agotó los 5, persistido en la "base"

        await expect(service.start(WALKER_USER_ID, WALK_ID, { pickupCode: TEST_PICKUP_CODE }))
          .rejects.toThrow(BadRequestException);
        await expect(service.start(WALKER_USER_ID, WALK_ID, { pickupCode: TEST_PICKUP_CODE }))
          .rejects.toThrow(/límite de intentos/);
        // Ni siquiera llega a comparar el código — el límite corta antes,
        // así que tampoco escribe pickupCodeAttempts de nuevo.
        expect(prisma.walk.update).not.toHaveBeenCalled();
      });
    });

    // ─── start() sin código — evidencia, no candado ────────────────────────

    describe('start() sin código', () => {
      function setupWalkOnWay() {
        prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
        prisma.walk.findUnique.mockResolvedValue({
          ...BASE_WALK, status: WalkStatus.WALKER_ON_WAY, scheduledAt: new Date(),
          pickupCode: TEST_PICKUP_CODE, pickupCodeAttempts: 0,
        });
        prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.IN_PROGRESS });
      }

      it('motivo predefinido: arranca igual, startVerification NONE, guarda la etiqueta legible', async () => {
        setupWalkOnWay();

        await service.start(
          WALKER_USER_ID, WALK_ID, { reason: START_WITHOUT_CODE_REASON.BUILDING_STAFF },
        );

        expect(prisma.walk.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: WalkStatus.IN_PROGRESS,
              startVerification: StartVerification.NONE,
              startVerifyReason: START_WITHOUT_CODE_REASON_LABEL.BUILDING_STAFF,
            }),
          }),
        );
      });

      it('motivo "otro": guarda el texto libre tal cual', async () => {
        setupWalkOnWay();

        await service.start(WALKER_USER_ID, WALK_ID, {
          reason: START_WITHOUT_CODE_REASON.OTHER,
          otherReason: 'Me lo dejó el kiosquero de la esquina',
        });

        expect(prisma.walk.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: WalkStatus.IN_PROGRESS,
              startVerification: StartVerification.NONE,
              startVerifyReason: 'Me lo dejó el kiosquero de la esquina',
            }),
          }),
        );
      });

      it('sin código NI motivo: BadRequestException, no inicia el paseo (el paseo nunca queda sin poder arrancar, pero tampoco arranca sin que alguien elija un camino)', async () => {
        prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
        prisma.walk.findUnique.mockResolvedValue({
          ...BASE_WALK, status: WalkStatus.WALKER_ON_WAY, scheduledAt: new Date(),
          pickupCode: TEST_PICKUP_CODE, pickupCodeAttempts: 0,
        });

        await expect(service.start(WALKER_USER_ID, WALK_ID)).rejects.toThrow(BadRequestException);
        expect(prisma.walk.update).not.toHaveBeenCalled();
      });
    });
  });

  // ─── finish() ─────────────────────────────────────────────────────────────

  describe('finish()', () => {
    it('ForbiddenException si no existe walkerProfile', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.finish(WALKER_USER_ID, WALK_ID)).rejects.toThrow(ForbiddenException);
    });

    it('IDOR: ForbiddenException si el walkerProfile existe pero NO es el asignado al walk', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findUnique.mockResolvedValue({ ...BASE_WALK, walkerId: 'wp-otro-paseador' });
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
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      // Arrancó hace 1h, dura 30min (WALK_FULL.walkType) — el fin esperado
      // (hace 30min) menos 15min ya quedó bien atrás.
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK,
        status: WalkStatus.IN_PROGRESS,
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
        walkType: WALK_FULL.walkType,
      });
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

    // ─── Guard de tiempo: se habilita fin esperado - 15m ────────────────────

    it('BadRequestException si todavía no llegó a fin esperado - 15m, con el horario en el mensaje', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      // Arrancó hace 5min, dura 30min → fin esperado en 25min, se habilita en 10min — todavía no.
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK,
        status: WalkStatus.IN_PROGRESS,
        startedAt: new Date(Date.now() - 5 * 60 * 1000),
        walkType: WALK_FULL.walkType,
      });

      await expect(service.finish(WALKER_USER_ID, WALK_ID)).rejects.toThrow(BadRequestException);
      await expect(service.finish(WALKER_USER_ID, WALK_ID)).rejects.toThrow(/Vas a poder/);
      expect(prisma.walk.update).not.toHaveBeenCalled();
    });

    // ─── Estado inconsistente: IN_PROGRESS sin startedAt ────────────────────
    // No debería pasar por la app (start() siempre lo escribe), pero el
    // backlog registra intervenciones manuales por SQL en producción — un
    // UPDATE a mano puede dejar el paseo así. Tiene que dar una excepción
    // clara, no un crash por leer .getTime() de null.

    it('UnprocessableEntityException si IN_PROGRESS pero startedAt es null (estado inconsistente), y lo loguea como error', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK,
        status: WalkStatus.IN_PROGRESS,
        startedAt: null,
        walkType: WALK_FULL.walkType,
      });
      const loggerErrorSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

      await expect(service.finish(WALKER_USER_ID, WALK_ID)).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.walk.update).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining(WALK_ID));
    });
  });

  // ─── cancel() ─────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('lanza NotFoundException si el walk no existe', async () => {
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.cancel(WALKER_USER_ID, UserRole.WALKER, WALK_ID, {}))
        .rejects.toThrow(NotFoundException);
    });

    // ─── Autorización primero, siempre (ver resolveCancelTarget) ────────────
    // Estos son el corazón del fix: verifican que un no-autorizado recibe
    // siempre el mismo error, sin importar el estado interno del paseo. Si
    // alguien vuelve a mover el orden (auth después de estado/plata), se
    // rompen.

    it('WALKER: ForbiddenException si el walk no le pertenece', async () => {
      prisma.walk.findUnique.mockResolvedValue({ ...BASE_WALK, walkerId: 'other-walker' });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER); // id = WALKER_PROFILE_ID
      await expect(service.cancel(WALKER_USER_ID, UserRole.WALKER, WALK_ID, {}))
        .rejects.toThrow(ForbiddenException);
    });

    it('WALKER ajeno recibe 403, no 400, aunque el paseo esté en un estado no cancelable', async () => {
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK, status: WalkStatus.IN_PROGRESS, walkerId: 'other-walker',
      });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      await expect(service.cancel(WALKER_USER_ID, UserRole.WALKER, WALK_ID, {}))
        .rejects.toThrow(ForbiddenException);
    });

    it('OWNER que no es participante recibe 403, no 400, aunque el paseo esté pagado — la autorización corre primero y no filtra el estado de pago', async () => {
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK, status: WalkStatus.CONFIRMED, mpPaymentId: '99999',
      });
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue(null); // no es participante

      await expect(service.cancel(OWNER_USER_ID, UserRole.OWNER, WALK_ID, {}))
        .rejects.toThrow(ForbiddenException);
      expect(prisma.walk.update).not.toHaveBeenCalled();
    });

    it('ADMIN no puede cancelar por esta ruta — deny-by-default explícito (el refund pasa por admin/walks/:id/refund)', async () => {
      prisma.walk.findUnique.mockResolvedValue({ ...BASE_WALK, status: WalkStatus.CONFIRMED });

      await expect(service.cancel('admin-user-1', UserRole.ADMIN, WALK_ID, {}))
        .rejects.toThrow(ForbiddenException);
      expect(prisma.walk.update).not.toHaveBeenCalled();
    });

    // ─── Estado — corre después de resolver la autorización ─────────────────

    it('lanza BadRequestException si el walk no está en PENDING ni CONFIRMED', async () => {
      prisma.walk.findUnique.mockResolvedValue({ ...BASE_WALK, status: WalkStatus.IN_PROGRESS });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER); // la auth corre primero
      await expect(service.cancel(WALKER_USER_ID, UserRole.WALKER, WALK_ID, {}))
        .rejects.toThrow(BadRequestException);
    });

    // ─── Guard de plata: falla cerrado ante un paseo pagado ──────────────────

    it('WALKER: lanza BadRequestException si el paseo ya está pagado (mpPaymentId numérico)', async () => {
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK, status: WalkStatus.CONFIRMED, mpPaymentId: '99999',
      });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER); // la auth corre primero y pasa
      await expect(service.cancel(WALKER_USER_ID, UserRole.WALKER, WALK_ID, {}))
        .rejects.toThrow(BadRequestException);
      expect(prisma.walk.update).not.toHaveBeenCalled();
    });

    it('OWNER: lanza BadRequestException si el paseo ya está pagado (mpPaymentId numérico)', async () => {
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK, status: WalkStatus.CONFIRMED, mpPaymentId: '99999',
      });
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue({
        id: 'p-1', walkId: WALK_ID, ownerId: OWNER_PROFILE_ID,
      });
      await expect(service.cancel(OWNER_USER_ID, UserRole.OWNER, WALK_ID, {}))
        .rejects.toThrow(BadRequestException);
      expect(prisma.walk.update).not.toHaveBeenCalled();
    });

    it('SÍ cancela cuando mpPaymentId es un preference id no numérico (checkout abandonado, no es un pago real) — evita el falso positivo', async () => {
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK, status: WalkStatus.CONFIRMED, mpPaymentId: '3541787996-9905f4f5-abc',
      });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.CANCELLED_WALKER });

      await expect(
        service.cancel(WALKER_USER_ID, UserRole.WALKER, WALK_ID, {}),
      ).resolves.toBeDefined();
      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: WalkStatus.CANCELLED_WALKER }) }),
      );
    });

    it('sigue cancelando con mpPaymentId === null (nunca se abrió el checkout)', async () => {
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK, status: WalkStatus.CONFIRMED, mpPaymentId: null,
      });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.CANCELLED_WALKER });

      await expect(
        service.cancel(WALKER_USER_ID, UserRole.WALKER, WALK_ID, {}),
      ).resolves.toBeDefined();
      expect(prisma.walk.update).toHaveBeenCalled();
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

  // ─── reportWalkerNoShow() ───────────────────────────────────────────────

  describe('reportWalkerNoShow()', () => {
    const REPORTABLE_WALK = {
      id: WALK_ID,
      status: WalkStatus.CONFIRMED as WalkStatus,
      scheduledAt: new Date(Date.now() - 15 * 60 * 1000), // T+10m ya pasó
      mpPaymentId: null as string | null,
      totalAmount: 1000,
      walker: { user: { id: WALKER_USER_ID, firstName: 'Juan', lastName: 'Pérez' } },
      participants: [{ ownerId: OWNER_PROFILE_ID, dog: { name: 'Lolo' } }],
    };

    function setupReport(overrides: Partial<typeof REPORTABLE_WALK> = {}) {
      prisma.ownerProfile.findUnique.mockResolvedValue({
        id: OWNER_PROFILE_ID,
        user: { firstName: 'Ana', lastName: 'Gómez', email: 'ana@test.com' },
      });
      prisma.walk.findUnique.mockResolvedValue({ ...REPORTABLE_WALK, ...overrides });
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.NOT_PERFORMED });
    }

    it('ForbiddenException si no existe ownerProfile', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(null);
      await expect(service.reportWalkerNoShow(OWNER_USER_ID, WALK_ID)).rejects.toThrow(ForbiddenException);
    });

    it('NotFoundException si el walk no existe', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue({
        id: OWNER_PROFILE_ID, user: { firstName: 'Ana', lastName: 'Gómez', email: 'ana@test.com' },
      });
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.reportWalkerNoShow(OWNER_USER_ID, WALK_ID)).rejects.toThrow(NotFoundException);
    });

    it('IDOR: ForbiddenException si el dueño no es participante de este paseo', async () => {
      setupReport({ participants: [{ ownerId: 'otro-owner', dog: { name: 'Fido' } }] });
      await expect(service.reportWalkerNoShow(OWNER_USER_ID, WALK_ID)).rejects.toThrow(ForbiddenException);
    });

    it('BadRequestException en un estado no válido (ej. PENDING)', async () => {
      setupReport({ status: WalkStatus.PENDING });
      await expect(service.reportWalkerNoShow(OWNER_USER_ID, WALK_ID)).rejects.toThrow(BadRequestException);
    });

    it('BadRequestException antes de T+10m, con el horario en el mensaje', async () => {
      setupReport({ scheduledAt: new Date(Date.now() + 60 * 60 * 1000) }); // 1h en el futuro
      await expect(service.reportWalkerNoShow(OWNER_USER_ID, WALK_ID)).rejects.toThrow(BadRequestException);
      await expect(service.reportWalkerNoShow(OWNER_USER_ID, WALK_ID)).rejects.toThrow(/Vas a poder/);
    });

    it('no vence: mucho después de T+10m sigue permitiendo reportar', async () => {
      setupReport({ scheduledAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }); // hace un mes
      await expect(service.reportWalkerNoShow(OWNER_USER_ID, WALK_ID)).resolves.toBeDefined();
    });

    it('camino feliz desde CONFIRMED: marca NOT_PERFORMED/WALKER_NO_SHOW y notifica al paseador', async () => {
      setupReport();
      await service.reportWalkerNoShow(OWNER_USER_ID, WALK_ID);

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: WalkStatus.NOT_PERFORMED,
            notPerformedReason: NotPerformedReason.WALKER_NO_SHOW,
            notPerformedAt: expect.any(Date),
          }),
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: WALKER_USER_ID,
          type: NOTIFICATION_TYPES.WALK_WALKER_NO_SHOW_REPORTED,
          data: { walkId: WALK_ID },
        }),
      );
    });

    it('camino feliz desde WALKER_ON_WAY: también válido', async () => {
      setupReport({ status: WalkStatus.WALKER_ON_WAY });
      await expect(service.reportWalkerNoShow(OWNER_USER_ID, WALK_ID)).resolves.toBeDefined();
    });

    it('paseo pagado (mpPaymentId numérico) → alerta al admin', async () => {
      setupReport({ mpPaymentId: '99999' });
      await service.reportWalkerNoShow(OWNER_USER_ID, WALK_ID);
      expect(mail.sendNotPerformedAlert).toHaveBeenCalledTimes(1);
    });

    it('paseo sin pagar → NO alerta al admin', async () => {
      setupReport({ mpPaymentId: null });
      await service.reportWalkerNoShow(OWNER_USER_ID, WALK_ID);
      expect(mail.sendNotPerformedAlert).not.toHaveBeenCalled();
    });
  });

  // ─── confirmReceipt() ────────────────────────────────────────────────────

  describe('confirmReceipt()', () => {
    const RECEIPT_WALK = {
      id: WALK_ID,
      status: WalkStatus.IN_PROGRESS as WalkStatus,
      startedAt: new Date(Date.now() - 60 * 60 * 1000) as Date | null,
      walkType: { durationMinutes: 30 },
      walker: { user: { id: WALKER_USER_ID } },
      participants: [{ ownerId: OWNER_PROFILE_ID }],
    };

    function setupReceipt(overrides: Partial<typeof RECEIPT_WALK> = {}) {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walk.findUnique.mockResolvedValue({ ...RECEIPT_WALK, ...overrides });
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.COMPLETED });
    }

    it('ForbiddenException si no existe ownerProfile', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(null);
      await expect(service.confirmReceipt(OWNER_USER_ID, WALK_ID)).rejects.toThrow(ForbiddenException);
    });

    it('NotFoundException si el walk no existe', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.confirmReceipt(OWNER_USER_ID, WALK_ID)).rejects.toThrow(NotFoundException);
    });

    it('IDOR: ForbiddenException si el dueño no es participante', async () => {
      setupReceipt({ participants: [{ ownerId: 'otro-owner' }] });
      await expect(service.confirmReceipt(OWNER_USER_ID, WALK_ID)).rejects.toThrow(ForbiddenException);
    });

    it('BadRequestException si el walk no está en IN_PROGRESS', async () => {
      setupReceipt({ status: WalkStatus.CONFIRMED });
      await expect(service.confirmReceipt(OWNER_USER_ID, WALK_ID)).rejects.toThrow(BadRequestException);
    });

    it('UnprocessableEntityException si está IN_PROGRESS sin startedAt (estado inconsistente)', async () => {
      setupReceipt({ startedAt: null });
      await expect(service.confirmReceipt(OWNER_USER_ID, WALK_ID)).rejects.toThrow(UnprocessableEntityException);
    });

    it('camino feliz: pasa a COMPLETED con closedBy OWNER y notifica al paseador', async () => {
      setupReceipt();
      await service.confirmReceipt(OWNER_USER_ID, WALK_ID);

      expect(prisma.walk.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: WalkStatus.COMPLETED,
            closedBy: ClosedBy.OWNER,
            endedAt: expect.any(Date),
          }),
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: WALKER_USER_ID, type: NOTIFICATION_TYPES.WALK_CLOSED_BY_OWNER }),
      );
    });

    // endedLate = endedAt > (startedAt + duración + 60min). Duración 30min,
    // así que el borde exacto es 90min desde que arrancó.
    it('endedLate: false justo antes del umbral (90m), true justo después', async () => {
      const notLate = new Date(Date.now() - 90 * 60 * 1000 + 1000);
      setupReceipt({ startedAt: notLate });
      await service.confirmReceipt(OWNER_USER_ID, WALK_ID);
      expect(prisma.walk.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ endedLate: false }) }),
      );

      const late = new Date(Date.now() - 90 * 60 * 1000 - 1000);
      setupReceipt({ startedAt: late });
      await service.confirmReceipt(OWNER_USER_ID, WALK_ID);
      expect(prisma.walk.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ endedLate: true }) }),
      );
    });
  });

  // ─── Ofuscación del punto de encuentro (anti-desintermediación) ─────────

  describe('ofuscación del punto de encuentro (findById)', () => {
    const WALK_NO_ONWAY = { ...WALK_FULL, onWayAt: null };

    it('WALKER, onWayAt null: pickupAddress viene null y las coordenadas NO son las reales', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_NO_ONWAY);
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      const result = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);

      expect(result.pickupAddress).toBeNull();
      expect(result.pickupLat).not.toBe(WALK_FULL.pickupLat);
      expect(result.pickupLng).not.toBe(WALK_FULL.pickupLng);
    });

    it('el desplazamiento es determinista: dos consultas del mismo walk dan el mismo punto aproximado', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_NO_ONWAY);
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      const first  = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);
      const second = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);

      expect(second.pickupLat).toBe(first.pickupLat);
      expect(second.pickupLng).toBe(first.pickupLng);
    });

    it('WALKER, onWayAt seteado: dirección y coordenadas reales', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_FULL); // onWayAt no-null por default
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);

      const result = await service.findById(WALKER_USER_ID, UserRole.WALKER, WALK_ID);

      expect(result.pickupAddress).toBe(WALK_FULL.pickupAddress);
      expect(result.pickupLat).toBe(WALK_FULL.pickupLat);
      expect(result.pickupLng).toBe(WALK_FULL.pickupLng);
    });

    it('OWNER siempre ve la dirección real, aunque onWayAt sea null', async () => {
      prisma.walk.findUnique.mockResolvedValue(WALK_NO_ONWAY);
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue({ id: 'p-1', walkId: WALK_ID, ownerId: OWNER_PROFILE_ID });

      const result = await service.findById(OWNER_USER_ID, UserRole.OWNER, WALK_ID);

      expect(result.pickupAddress).toBe(WALK_FULL.pickupAddress);
      expect(result.pickupLat).toBe(WALK_FULL.pickupLat);
      expect(result.pickupLng).toBe(WALK_FULL.pickupLng);
    });
  });

  // ─── Bloqueo (bloque B): SOLO confirm() se frena, y solo con un ─────────
  // ─── IN_PROGRESS VENCIDO (nunca uno abierto y normal) ───────────────────

  describe('bloqueo por IN_PROGRESS vencido', () => {
    it('confirm(): BadRequestException si hay un IN_PROGRESS VENCIDO, con el nombre del perro en el mensaje', async () => {
      setupWalkerWalk(WalkStatus.PENDING);
      prisma.walk.findMany.mockResolvedValue([{
        startedAt: new Date(Date.now() - 120 * 60 * 1000), // arrancó hace 2h
        walkType: { durationMinutes: 30 }, // fin esperado hace 90m; +60m de margen ⇒ vencido hace 30m
        participants: [{ dog: { name: 'Lolo' } }],
      }]);

      await expect(service.confirm(WALKER_USER_ID, WALK_ID)).rejects.toThrow(BadRequestException);
      await expect(service.confirm(WALKER_USER_ID, WALK_ID)).rejects.toThrow(/Lolo/);
      expect(prisma.walk.update).not.toHaveBeenCalled();
    });

    it('confirm(): un IN_PROGRESS ABIERTO y normal (todavía no vencido) NO bloquea — es lo esperado en un negocio multi-perro', async () => {
      setupWalkerWalk(WalkStatus.PENDING);
      prisma.walk.findMany.mockResolvedValue([{
        startedAt: new Date(Date.now() - 10 * 60 * 1000), // recién arrancó
        walkType: { durationMinutes: 30 },
        participants: [{ dog: { name: 'Fido' } }],
      }]);
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.CONFIRMED });

      await expect(service.confirm(WALKER_USER_ID, WALK_ID)).resolves.toBeDefined();
    });

    it('confirm(): sin ningún IN_PROGRESS, funciona normal', async () => {
      setupWalkerWalk(WalkStatus.PENDING); // deja walk.findMany en []
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.CONFIRMED });

      await expect(service.confirm(WALKER_USER_ID, WALK_ID)).resolves.toBeDefined();
    });

    // Los dos siguientes son el corazón del punto 4: un refactor futuro que
    // agregue el chequeo acá "por consistencia" rompería el producto (un
    // negocio multi-perro necesita poder iniciar y cerrar sin trabas).
    it('start(): NUNCA se bloquea — ni siquiera consulta otros walks del paseador', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK, status: WalkStatus.WALKER_ON_WAY, scheduledAt: new Date(),
        pickupCode: TEST_PICKUP_CODE, pickupCodeAttempts: 0,
      });
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.IN_PROGRESS });

      await service.start(WALKER_USER_ID, WALK_ID, { pickupCode: TEST_PICKUP_CODE });

      expect(prisma.walk.findMany).not.toHaveBeenCalled();
    });

    it('markOnWay(): NUNCA se bloquea — ni siquiera consulta otros walks del paseador', async () => {
      setupWalkerWalk(WalkStatus.CONFIRMED);
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.WALKER_ON_WAY });

      await service.markOnWay(WALKER_USER_ID, WALK_ID);

      expect(prisma.walk.findMany).not.toHaveBeenCalled();
    });

    it('finish(): NUNCA se bloquea (cerrar siempre está permitido) — ni siquiera consulta otros walks', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walk.findUnique.mockResolvedValue({
        ...BASE_WALK,
        status: WalkStatus.IN_PROGRESS,
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
        walkType: WALK_FULL.walkType,
      });
      prisma.walk.update.mockResolvedValue({ ...WALK_FULL, status: WalkStatus.COMPLETED });

      await service.finish(WALKER_USER_ID, WALK_ID);

      expect(prisma.walk.findMany).not.toHaveBeenCalled();
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

    it('IDOR: ForbiddenException si OWNER no es participante del walk', async () => {
      prisma.walk.findUnique.mockResolvedValue({ id: WALK_ID, walkerId: WALKER_PROFILE_ID });
      prisma.ownerProfile.findUnique.mockResolvedValue(BASE_OWNER);
      prisma.walkParticipant.findFirst.mockResolvedValue(null); // no es participante
      await expect(service.getLocations(OWNER_USER_ID, UserRole.OWNER, WALK_ID))
        .rejects.toThrow(ForbiddenException);
    });

    it('default-deny: ForbiddenException para un rol desconocido (no WALKER/OWNER/ADMIN)', async () => {
      prisma.walk.findUnique.mockResolvedValue({ id: WALK_ID, walkerId: WALKER_PROFILE_ID });
      await expect(service.getLocations(OWNER_USER_ID, 'SUPERUSER', WALK_ID))
        .rejects.toThrow(ForbiddenException);
    });

    it('ADMIN tiene acceso explícito sin chequeo de pertenencia/participación', async () => {
      prisma.walk.findUnique.mockResolvedValue({ id: WALK_ID, walkerId: WALKER_PROFILE_ID });
      prisma.walkLocation.findMany.mockResolvedValue(LOCATIONS);

      const result = await service.getLocations('admin-user-1', UserRole.ADMIN, WALK_ID);

      expect(result).toEqual(LOCATIONS);
      expect(prisma.walkerProfile.findUnique).not.toHaveBeenCalled();
      expect(prisma.ownerProfile.findUnique).not.toHaveBeenCalled();
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

    // Techo de seguridad, no paginación — una ruta es un objeto único. Sin
    // esto, un paseo con muestreo mal configurado (o un cliente enviando de
    // más) trae toda la tabla en una sola respuesta.
    it('aplica un techo de seguridad (take) a la consulta de ubicaciones', async () => {
      prisma.walk.findUnique.mockResolvedValue({ id: WALK_ID, walkerId: WALKER_PROFILE_ID });
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_WALKER);
      prisma.walkLocation.findMany.mockResolvedValue(LOCATIONS);

      await service.getLocations(WALKER_USER_ID, UserRole.WALKER, WALK_ID);

      expect(prisma.walkLocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5000 }),
      );
    });
  });
});
