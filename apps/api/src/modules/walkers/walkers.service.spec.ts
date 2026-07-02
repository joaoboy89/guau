import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { WalkersService } from './walkers.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROFILE_ID  = 'walker-profile-1';
const USER_ID     = 'user-1';
const SCHEDULE_ID = 'schedule-1';

const BASE_PROFILE = {
  id:                 PROFILE_ID,
  userId:             USER_ID,
  bio:                'Me encantan los perros',
  rating:             4.5,
  totalReviews:       10,
  isAvailable:        true,
  maxDogsPerWalk:     3,
  centerLat:          -34.5885,
  centerLng:          -58.4233,
  radiusKm:           5,
  verificationStatus: VerificationStatus.VERIFIED,
  // Campos sensibles que getPublicProfile debe excluir
  dniNumber:          '12345678',
  dniPhotoUrl:        'https://example.com/dni.jpg',
  selfieUrl:          'https://example.com/selfie.jpg',
  mpAccessToken:      'mp-access-token',
  mpUserId:           'mp-user-id',
  verificationNotes:  'Alguna nota interna',
  refreshTokenHash:   'some-refresh-hash',
};

// Fila tal como la devuelve $queryRaw (campos planos, sin JOIN anidado)
const BASE_WALKER_ROW = {
  id:                 PROFILE_ID,
  userId:             USER_ID,
  bio:                'Me encantan los perros',
  rating:             4.5,
  totalReviews:       10,
  isAvailable:        true,
  maxDogsPerWalk:     3,
  centerLat:          -34.5885,
  centerLng:          -58.4233,
  radiusKm:           5,
  verificationStatus: 'VERIFIED',
  firstName:          'Juan',
  lastName:           'Pérez',
  avatarUrl:          null,
  distanceKm:         2.3,
};

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    // $queryRaw se llama como template literal tag: prisma.$queryRaw`...`
    // En runtime se convierte en una llamada de función normal, por eso jest.fn() es suficiente.
    $queryRaw:     jest.fn(),
    walkerProfile: {
      findUnique: jest.fn(),
      update:     jest.fn(),
    },
    walkerSchedule: {
      findFirst:  jest.fn(),
      findUnique: jest.fn(),
      findMany:   jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
    },
    walk: {
      findMany: jest.fn(),
    },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WalkersService', () => {
  let service: WalkersService;
  let prisma:  ReturnType<typeof buildPrismaMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalkersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WalkersService>(WalkersService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── search() ───────────────────────────────────────────────────────────────

  describe('search()', () => {
    const BASE_DTO = { lat: -34.5885, lng: -58.4233 };

    it('camino feliz sin date: llama a $queryRaw y devuelve resultados mapeados con user anidado', async () => {
      prisma.$queryRaw.mockResolvedValue([BASE_WALKER_ROW]);

      const result = await service.search(BASE_DTO);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id:           PROFILE_ID,
        bio:          BASE_WALKER_ROW.bio,
        rating:       BASE_WALKER_ROW.rating,
        distanceKm:   BASE_WALKER_ROW.distanceKm,
        user: {
          firstName: 'Juan',
          lastName:  'Pérez',
          avatarUrl: null,
        },
      });
      // Los campos del usuario no deben estar en el nivel raíz
      expect(result[0]).not.toHaveProperty('firstName');
      expect(result[0]).not.toHaveProperty('lastName');
    });

    it('con date: devuelve solo los paseadores con horario activo que cubre ese día/hora', async () => {
      // Usamos mediodía UTC: minimiza el riesgo de que un offset de TZ cambie el día.
      const date      = '2026-07-06T12:00:00.000Z';
      // Calculamos dayOfWeek y timeStr igual que el servicio (tiempo local del proceso)
      const dayOfWeek = new Date(date).getDay();
      const timeStr   = new Date(date).toTimeString().slice(0, 5);

      const walker1 = { ...BASE_WALKER_ROW, id: 'walker-1' };
      const walker2 = { ...BASE_WALKER_ROW, id: 'walker-2' };

      prisma.$queryRaw.mockResolvedValue([walker1, walker2]);
      // walker-1 tiene horario que cubre todo el día; walker-2 no aparece en el resultado
      prisma.walkerSchedule.findMany.mockResolvedValue([
        {
          walkerId:   'walker-1',
          dayOfWeek,
          startTime:  '00:00',
          endTime:    '23:59',
          isActive:   true,
        },
        // walker-2 sin horario activo para este día → no está en schedules
      ]);

      const result = await service.search({ ...BASE_DTO, date });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('walker-1');
      // Verifica que se llamó a walkerSchedule.findMany con el día correcto
      expect(prisma.walkerSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ dayOfWeek }) }),
      );
    });

    it('con walkTypeId: NO filtra el array (comportamiento documentado — la lógica se resuelve al crear reserva)', async () => {
      const walker1 = { ...BASE_WALKER_ROW, id: 'walker-1' };
      const walker2 = { ...BASE_WALKER_ROW, id: 'walker-2' };

      prisma.$queryRaw.mockResolvedValue([walker1, walker2]);
      // Solo walker-1 tiene walks de ese tipo, pero el servicio no filtra el array
      prisma.walk.findMany.mockResolvedValue([{ walkerId: 'walker-1' }]);

      const result = await service.search({ ...BASE_DTO, walkTypeId: 'walk-type-1' });

      // Ambos paseadores deben estar en el resultado (no se filtra por walkTypeId)
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['walker-1', 'walker-2']);
    });
  });

  // ─── getPublicProfile() ─────────────────────────────────────────────────────

  describe('getPublicProfile()', () => {
    it('lanza NotFoundException si el perfil no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.getPublicProfile('walker-99')).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si verificationStatus no es VERIFIED', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue({
        ...BASE_PROFILE,
        verificationStatus: VerificationStatus.PENDING,
        user:      { firstName: 'Juan', lastName: 'Pérez', avatarUrl: null, createdAt: new Date() },
        schedules: [],
      });
      await expect(service.getPublicProfile(PROFILE_ID)).rejects.toThrow(NotFoundException);
    });

    it('camino feliz: no incluye campos sensibles en la respuesta', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue({
        ...BASE_PROFILE,
        user:      { firstName: 'Juan', lastName: 'Pérez', avatarUrl: null, createdAt: new Date() },
        schedules: [],
      });

      const result = await service.getPublicProfile(PROFILE_ID);

      expect(result).not.toHaveProperty('dniNumber');
      expect(result).not.toHaveProperty('dniPhotoUrl');
      expect(result).not.toHaveProperty('selfieUrl');
      expect(result).not.toHaveProperty('mpAccessToken');
      expect(result).not.toHaveProperty('mpUserId');
      expect(result).not.toHaveProperty('verificationNotes');
      expect(result).not.toHaveProperty('refreshTokenHash');
      // Sí incluye campos seguros
      expect(result).toHaveProperty('id', PROFILE_ID);
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('schedules');
    });
  });

  // ─── getMyProfile() ─────────────────────────────────────────────────────────

  describe('getMyProfile()', () => {
    it('lanza NotFoundException si el perfil no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.getMyProfile(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('camino feliz: devuelve el perfil con user y schedules incluidos', async () => {
      const fullProfile = {
        ...BASE_PROFILE,
        user: {
          id: USER_ID, email: 'walker@guau.com', firstName: 'Juan', lastName: 'Pérez',
          avatarUrl: null, phone: null, emailVerifiedAt: new Date(), createdAt: new Date(),
        },
        schedules: [],
      };
      prisma.walkerProfile.findUnique.mockResolvedValue(fullProfile);

      const result = await service.getMyProfile(USER_ID);

      expect(result).toEqual(fullProfile);
      expect(prisma.walkerProfile.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
    });
  });

  // ─── updateMyProfile() ──────────────────────────────────────────────────────

  describe('updateMyProfile()', () => {
    it('lanza NotFoundException si el perfil no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.updateMyProfile(USER_ID, { bio: 'nuevo' })).rejects.toThrow(NotFoundException);
    });

    it('camino feliz: llama a walkerProfile.update con los datos del dto', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_PROFILE);
      const dto     = { bio: 'nuevo bio', maxDogsPerWalk: 5 };
      const updated = { ...BASE_PROFILE, ...dto };
      prisma.walkerProfile.update.mockResolvedValue(updated);

      const result = await service.updateMyProfile(USER_ID, dto);

      expect(prisma.walkerProfile.update).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        data:  dto,
      });
      expect(result).toEqual(updated);
    });
  });

  // ─── updateAvailability() ───────────────────────────────────────────────────

  describe('updateAvailability()', () => {
    it('lanza NotFoundException si el perfil no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.updateAvailability(USER_ID, { isAvailable: true }))
        .rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si isAvailable=true y estado no es VERIFIED', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue({
        ...BASE_PROFILE,
        verificationStatus: VerificationStatus.PENDING,
      });
      await expect(service.updateAvailability(USER_ID, { isAvailable: true }))
        .rejects.toThrow(ForbiddenException);
    });

    it('camino feliz: permite isAvailable=false sin importar el estado de verificación', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue({
        ...BASE_PROFILE,
        verificationStatus: VerificationStatus.PENDING,
      });
      prisma.walkerProfile.update.mockResolvedValue({ id: PROFILE_ID, isAvailable: false });

      await expect(service.updateAvailability(USER_ID, { isAvailable: false })).resolves.not.toThrow();
      expect(prisma.walkerProfile.update).toHaveBeenCalledTimes(1);
    });

    it('camino feliz: permite isAvailable=true cuando está VERIFIED', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue({
        ...BASE_PROFILE,
        verificationStatus: VerificationStatus.VERIFIED,
      });
      prisma.walkerProfile.update.mockResolvedValue({ id: PROFILE_ID, isAvailable: true });

      await expect(service.updateAvailability(USER_ID, { isAvailable: true })).resolves.not.toThrow();
      expect(prisma.walkerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isAvailable: true } }),
      );
    });
  });

  // ─── createSchedule() ───────────────────────────────────────────────────────

  describe('createSchedule()', () => {
    const CREATE_DTO = { dayOfWeek: 1, startTime: '08:00', endTime: '14:00' };

    it('lanza NotFoundException si el perfil no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.createSchedule(USER_ID, CREATE_DTO)).rejects.toThrow(NotFoundException);
    });

    it('lanza ConflictException si ya existe un horario activo para ese día', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_PROFILE);
      prisma.walkerSchedule.findFirst.mockResolvedValue({
        id: 'existing-schedule', walkerId: PROFILE_ID, dayOfWeek: 1, isActive: true,
      });
      await expect(service.createSchedule(USER_ID, CREATE_DTO)).rejects.toThrow(ConflictException);
    });

    it('camino feliz: crea el horario con el walkerId del perfil', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_PROFILE);
      prisma.walkerSchedule.findFirst.mockResolvedValue(null);
      const created = { id: SCHEDULE_ID, walkerId: PROFILE_ID, ...CREATE_DTO, isActive: true };
      prisma.walkerSchedule.create.mockResolvedValue(created);

      const result = await service.createSchedule(USER_ID, CREATE_DTO);

      expect(prisma.walkerSchedule.create).toHaveBeenCalledWith({
        data: { walkerId: PROFILE_ID, ...CREATE_DTO },
      });
      expect(result).toEqual(created);
    });
  });

  // ─── updateSchedule() ───────────────────────────────────────────────────────

  describe('updateSchedule()', () => {
    const UPDATE_DTO = { startTime: '09:00', endTime: '15:00' };

    it('lanza NotFoundException si el perfil no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.updateSchedule(USER_ID, SCHEDULE_ID, UPDATE_DTO))
        .rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si el horario no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_PROFILE);
      prisma.walkerSchedule.findUnique.mockResolvedValue(null);
      await expect(service.updateSchedule(USER_ID, SCHEDULE_ID, UPDATE_DTO))
        .rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si el horario pertenece a otro paseador', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_PROFILE); // id = PROFILE_ID
      prisma.walkerSchedule.findUnique.mockResolvedValue({
        id: SCHEDULE_ID, walkerId: 'otro-walker-id', dayOfWeek: 1, isActive: true,
      });
      await expect(service.updateSchedule(USER_ID, SCHEDULE_ID, UPDATE_DTO))
        .rejects.toThrow(NotFoundException);
    });

    it('camino feliz: actualiza el horario', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_PROFILE);
      prisma.walkerSchedule.findUnique.mockResolvedValue({
        id: SCHEDULE_ID, walkerId: PROFILE_ID, dayOfWeek: 1, isActive: true,
      });
      const updated = { id: SCHEDULE_ID, walkerId: PROFILE_ID, ...UPDATE_DTO, dayOfWeek: 1, isActive: true };
      prisma.walkerSchedule.update.mockResolvedValue(updated);

      const result = await service.updateSchedule(USER_ID, SCHEDULE_ID, UPDATE_DTO);

      expect(prisma.walkerSchedule.update).toHaveBeenCalledWith({
        where: { id: SCHEDULE_ID },
        data:  UPDATE_DTO,
      });
      expect(result).toEqual(updated);
    });
  });

  // ─── setZone() ──────────────────────────────────────────────────────────────

  describe('setZone()', () => {
    const ZONE_DTO = { centerLat: -34.6, centerLng: -58.4, radiusKm: 10 };

    it('lanza NotFoundException si el perfil no existe', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.setZone(USER_ID, ZONE_DTO)).rejects.toThrow(NotFoundException);
    });

    it('camino feliz: actualiza centerLat, centerLng y radiusKm', async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(BASE_PROFILE);
      const updated = { id: PROFILE_ID, ...ZONE_DTO };
      prisma.walkerProfile.update.mockResolvedValue(updated);

      const result = await service.setZone(USER_ID, ZONE_DTO);

      expect(prisma.walkerProfile.update).toHaveBeenCalledWith({
        where:  { userId: USER_ID },
        data:   { centerLat: ZONE_DTO.centerLat, centerLng: ZONE_DTO.centerLng, radiusKm: ZONE_DTO.radiusKm },
        select: { id: true, centerLat: true, centerLng: true, radiusKm: true },
      });
      expect(result).toEqual(updated);
    });
  });
});
