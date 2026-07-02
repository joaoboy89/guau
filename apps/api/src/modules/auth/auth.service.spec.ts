import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../../common/services/mail.service';

jest.mock('bcryptjs', () => ({
  hash:    jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_USER = {
  id:               'user-1',
  email:            'test@guau.com',
  firstName:        'Juan',
  lastName:         'Pérez',
  passwordHash:     'hashed-pw',
  role:             UserRole.OWNER,
  isActive:         true,
  emailVerifiedAt:  new Date(),
  refreshTokenHash: 'hashed-rt',
};

const REGISTER_OWNER_DTO = {
  email:     'new@guau.com',
  password:  'pass1234',
  firstName: 'Ana',
  lastName:  'García',
  phone:     '+5491100000000',
};

const REGISTER_WALKER_DTO = {
  ...REGISTER_OWNER_DTO,
  bio: 'Me encantan los perros',
};

const LOGIN_DTO = { email: BASE_USER.email, password: 'pass1234' };

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildPrismaMock() {
  return { user: { create: jest.fn() } };
}

function buildUsersMock() {
  return {
    findByEmail:           jest.fn(),
    findById:              jest.fn(),
    updateRefreshTokenHash: jest.fn().mockResolvedValue({}),
    markEmailVerified:     jest.fn().mockResolvedValue({}),
  };
}

function buildJwtMock() {
  return {
    sign:      jest.fn().mockReturnValue('email-token'),
    signAsync: jest.fn().mockResolvedValue('jwt-token'),
    verify:    jest.fn(),
  };
}

function buildConfigMock() {
  const vals: Record<string, string> = {
    JWT_SECRET:              'test-secret',
    JWT_REFRESH_SECRET:      'test-refresh-secret',
    JWT_EMAIL_SECRET:        'test-email-secret',
    JWT_EXPIRES_IN:          '15m',
    JWT_REFRESH_EXPIRES_IN:  '7d',
  };
  return {
    get:         jest.fn((k: string) => vals[k] ?? null),
    getOrThrow:  jest.fn((k: string) => {
      if (!vals[k]) throw new Error(`Missing: ${k}`);
      return vals[k];
    }),
  };
}

function buildMailMock() {
  return {
    sendVerificationEmail: jest.fn(),
    sendWelcomeEmail:      jest.fn(),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let prisma:  ReturnType<typeof buildPrismaMock>;
  let users:   ReturnType<typeof buildUsersMock>;
  let jwt:     ReturnType<typeof buildJwtMock>;
  let mail:    ReturnType<typeof buildMailMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    users  = buildUsersMock();
    jwt    = buildJwtMock();
    mail   = buildMailMock();

    // bcrypt defaults: hash succeeds, compare matches
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService,  useValue: prisma },
        { provide: UsersService,   useValue: users  },
        { provide: JwtService,     useValue: jwt    },
        { provide: ConfigService,  useValue: buildConfigMock() },
        { provide: MailService,    useValue: mail   },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── registerOwner ──────────────────────────────────────────────────────────

  describe('registerOwner()', () => {
    it('lanza ConflictException si el email ya existe', async () => {
      users.findByEmail.mockResolvedValue(BASE_USER);
      await expect(service.registerOwner(REGISTER_OWNER_DTO))
        .rejects.toThrow(ConflictException);
    });

    it('crea el user con role OWNER y ownerProfile anidado', async () => {
      users.findByEmail.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'new-1', ...REGISTER_OWNER_DTO });

      await service.registerOwner(REGISTER_OWNER_DTO);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role:         UserRole.OWNER,
            ownerProfile: { create: {} },
          }),
        }),
      );
    });

    it('hashea la contraseña antes de guardarla', async () => {
      users.findByEmail.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'new-1' });

      await service.registerOwner(REGISTER_OWNER_DTO);

      expect(bcrypt.hash).toHaveBeenCalledWith(REGISTER_OWNER_DTO.password, 12);
      const createCall = prisma.user.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).toBe('hashed-pw');
    });

    it('envía email de verificación', async () => {
      users.findByEmail.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'new-1', email: REGISTER_OWNER_DTO.email, firstName: REGISTER_OWNER_DTO.firstName });

      await service.registerOwner(REGISTER_OWNER_DTO);

      expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    });

    it('devuelve mensaje de éxito', async () => {
      users.findByEmail.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'new-1', email: REGISTER_OWNER_DTO.email, firstName: REGISTER_OWNER_DTO.firstName });

      const result = await service.registerOwner(REGISTER_OWNER_DTO);

      expect(result.message).toMatch(/registro exitoso/i);
    });
  });

  // ─── registerWalker ─────────────────────────────────────────────────────────

  describe('registerWalker()', () => {
    it('lanza ConflictException si el email ya existe', async () => {
      users.findByEmail.mockResolvedValue(BASE_USER);
      await expect(service.registerWalker(REGISTER_WALKER_DTO))
        .rejects.toThrow(ConflictException);
    });

    it('crea el user con role WALKER y walkerProfile anidado', async () => {
      users.findByEmail.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'new-2', ...REGISTER_WALKER_DTO });

      await service.registerWalker(REGISTER_WALKER_DTO);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role:          UserRole.WALKER,
            walkerProfile: { create: { bio: REGISTER_WALKER_DTO.bio } },
          }),
        }),
      );
    });

    it('envía email de verificación', async () => {
      users.findByEmail.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'new-2', email: REGISTER_WALKER_DTO.email, firstName: REGISTER_WALKER_DTO.firstName });

      await service.registerWalker(REGISTER_WALKER_DTO);

      expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    });
  });

  // ─── login ──────────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('lanza UnauthorizedException si el usuario no existe', async () => {
      users.findByEmail.mockResolvedValue(null);
      await expect(service.login(LOGIN_DTO)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si isActive es false', async () => {
      users.findByEmail.mockResolvedValue({ ...BASE_USER, isActive: false });
      await expect(service.login(LOGIN_DTO)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si la contraseña es incorrecta', async () => {
      users.findByEmail.mockResolvedValue(BASE_USER);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.login(LOGIN_DTO)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza ForbiddenException si el email no está verificado', async () => {
      users.findByEmail.mockResolvedValue({ ...BASE_USER, emailVerifiedAt: null });
      await expect(service.login(LOGIN_DTO)).rejects.toThrow(ForbiddenException);
    });

    it('camino feliz: devuelve accessToken, refreshToken y perfil de usuario', async () => {
      users.findByEmail.mockResolvedValue(BASE_USER);

      const result = await service.login(LOGIN_DTO);

      expect(result).toMatchObject({
        accessToken:  expect.any(String),
        refreshToken: expect.any(String),
        user: {
          id:        BASE_USER.id,
          email:     BASE_USER.email,
          firstName: BASE_USER.firstName,
          lastName:  BASE_USER.lastName,
          role:      BASE_USER.role,
        },
      });
    });

    it('camino feliz: guarda el hash del nuevo refresh token', async () => {
      users.findByEmail.mockResolvedValue(BASE_USER);

      await service.login(LOGIN_DTO);

      expect(bcrypt.hash).toHaveBeenCalledTimes(1);
      expect(users.updateRefreshTokenHash).toHaveBeenCalledWith(BASE_USER.id, 'hashed-pw');
    });
  });

  // ─── refreshTokens ──────────────────────────────────────────────────────────

  describe('refreshTokens()', () => {
    it('lanza UnauthorizedException si el usuario no existe', async () => {
      users.findById.mockResolvedValue(null);
      await expect(service.refreshTokens('user-1', 'rt')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si no hay refreshTokenHash en DB', async () => {
      users.findById.mockResolvedValue({ ...BASE_USER, refreshTokenHash: null });
      await expect(service.refreshTokens('user-1', 'rt')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el refresh token no coincide', async () => {
      users.findById.mockResolvedValue(BASE_USER);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.refreshTokens('user-1', 'wrong-rt')).rejects.toThrow(UnauthorizedException);
    });

    it('camino feliz: devuelve nuevos accessToken y refreshToken', async () => {
      users.findById.mockResolvedValue(BASE_USER);

      const result = await service.refreshTokens('user-1', 'valid-rt');

      expect(result).toMatchObject({
        accessToken:  expect.any(String),
        refreshToken: expect.any(String),
      });
      expect(users.updateRefreshTokenHash).toHaveBeenCalledWith(BASE_USER.id, 'hashed-pw');
    });
  });

  // ─── logout ─────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('llama a updateRefreshTokenHash con null', async () => {
      await service.logout('user-1');
      expect(users.updateRefreshTokenHash).toHaveBeenCalledWith('user-1', null);
    });

    it('devuelve mensaje de sesión cerrada', async () => {
      const result = await service.logout('user-1');
      expect(result.message).toMatch(/sesión cerrada/i);
    });
  });

  // ─── getMe ──────────────────────────────────────────────────────────────────

  describe('getMe()', () => {
    it('lanza UnauthorizedException si el usuario no existe en DB', async () => {
      // getMe usa this.prisma.user.findUnique directamente
      // Lo mockeamos extendiendo el prismaMock con user.findUnique
      (prisma as any).user.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.getMe('user-1')).rejects.toThrow(UnauthorizedException);
    });

    it('devuelve id, email, firstName, lastName y role', async () => {
      const profile = {
        id: BASE_USER.id, email: BASE_USER.email,
        firstName: BASE_USER.firstName, lastName: BASE_USER.lastName,
        role: BASE_USER.role,
      };
      (prisma as any).user.findUnique = jest.fn().mockResolvedValue(profile);

      const result = await service.getMe('user-1');

      expect(result).toEqual(profile);
    });
  });

  // ─── verifyEmail ────────────────────────────────────────────────────────────

  describe('verifyEmail()', () => {
    it('lanza BadRequestException si el JWT de email es inválido', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error('invalid'); });
      await expect(service.verifyEmail('bad-token')).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si no se encuentra el usuario', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ sub: 'user-1' });
      users.findById.mockResolvedValue(null);
      await expect(service.verifyEmail('ok-token')).rejects.toThrow(BadRequestException);
    });

    it('devuelve "ya verificado" si emailVerifiedAt ya está seteado', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ sub: 'user-1' });
      users.findById.mockResolvedValue(BASE_USER); // emailVerifiedAt is set

      const result = await service.verifyEmail('ok-token');

      expect(result.message).toMatch(/ya verificado/i);
      expect(users.markEmailVerified).not.toHaveBeenCalled();
    });

    it('camino feliz: marca email como verificado y envía bienvenida', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ sub: 'user-1' });
      users.findById.mockResolvedValue({ ...BASE_USER, emailVerifiedAt: null });

      const result = await service.verifyEmail('ok-token');

      expect(users.markEmailVerified).toHaveBeenCalledWith(BASE_USER.id);
      expect(mail.sendWelcomeEmail).toHaveBeenCalledTimes(1);
      expect(result.message).toMatch(/verificad/i);
      expect(result.role).toBe(BASE_USER.role);
    });
  });
});
