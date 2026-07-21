import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../../database/prisma.service';

function buildConfigMock() {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      throw new Error(`Missing config: ${key}`);
    }),
  };
}

function buildPrismaMock() {
  return { user: { findUnique: jest.fn() } };
}

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    strategy = new JwtStrategy(
      buildConfigMock() as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('rechaza un payload con purpose (ej. state de MP Connect) sin tocar la DB', async () => {
    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@a.com', role: 'WALKER', purpose: 'mp-connect' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza un payload con cualquier purpose, no solo "mp-connect"', async () => {
    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@a.com', role: 'WALKER', purpose: 'otro-purpose' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('acepta un access token real (sin purpose) y devuelve el usuario activo', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', email: 'a@a.com', role: 'WALKER', isActive: true,
    });

    const result = await strategy.validate({ sub: 'user-1', email: 'a@a.com', role: 'WALKER' });

    expect(result).toEqual({ id: 'user-1', email: 'a@a.com', role: 'WALKER', isActive: true });
  });

  it('rechaza si el usuario no existe o está inactivo', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@a.com', role: 'WALKER' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
