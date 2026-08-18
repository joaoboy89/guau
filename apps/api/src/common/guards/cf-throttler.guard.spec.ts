import { ExecutionContext } from '@nestjs/common';
import { ThrottlerException, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { CfThrottlerGuard } from './cf-throttler.guard';

function buildGuard() {
  // getTracker no usa options/storage/reflector — valores dummy alcanzan
  return new CfThrottlerGuard(
    {} as ThrottlerModuleOptions,
    {} as ThrottlerStorage,
    {} as Reflector,
  );
}

describe('CfThrottlerGuard — getTracker', () => {
  it('usa el header cf-connecting-ip cuando está presente (detrás de Cloudflare Tunnel)', async () => {
    const guard = buildGuard();
    const tracker = await (guard as any).getTracker({
      headers: { 'cf-connecting-ip': '203.0.113.7' },
      ip: '10.0.0.5', // IP interna del contenedor cloudflared
    });

    expect(tracker).toBe('203.0.113.7');
  });

  it('cae a req.ip si no hay header cf-connecting-ip (dev/tests locales)', async () => {
    const guard = buildGuard();
    const tracker = await (guard as any).getTracker({ headers: {}, ip: '127.0.0.1' });

    expect(tracker).toBe('127.0.0.1');
  });

  it('toma el primer valor si el header llega duplicado como array', async () => {
    const guard = buildGuard();
    const tracker = await (guard as any).getTracker({
      headers: { 'cf-connecting-ip': ['203.0.113.7', '203.0.113.8'] },
      ip: '10.0.0.5',
    });

    expect(tracker).toBe('203.0.113.7');
  });
});

describe('CfThrottlerGuard — throwThrottlingException', () => {
  function buildContext(method: string, url: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method, url }),
      }),
    } as unknown as ExecutionContext;
  }

  it('loguea la ruta y el tracker (hash), no la IP, antes de rechazar con 429', async () => {
    const guard = buildGuard();
    const warnSpy = jest.spyOn((guard as any).logger, 'warn').mockImplementation(() => {});
    const context = buildContext('POST', '/auth/login');
    const throttlerLimitDetail = {
      ttl: 60000,
      limit: 5,
      key: 'abc123hash',
      tracker: '203.0.113.7',
      totalHits: 6,
      timeToExpire: 30,
      isBlocked: true,
      timeToBlockExpire: 30,
    };

    await expect(
      (guard as any).throwThrottlingException(context, throttlerLimitDetail),
    ).rejects.toBeInstanceOf(ThrottlerException);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = warnSpy.mock.calls[0][0] as string;
    expect(logged).toContain('POST /auth/login');
    expect(logged).toContain('abc123hash');
    expect(logged).not.toContain('203.0.113.7');
  });

  it('no loguea la query string de la ruta (puede llevar datos de quien la manda)', async () => {
    const guard = buildGuard();
    const warnSpy = jest.spyOn((guard as any).logger, 'warn').mockImplementation(() => {});
    const context = buildContext('GET', '/walkers?lat=-34.5547&lng=-58.4501');
    const throttlerLimitDetail = {
      ttl: 60000,
      limit: 5,
      key: 'abc123hash',
      tracker: '203.0.113.7',
      totalHits: 6,
      timeToExpire: 30,
      isBlocked: true,
      timeToBlockExpire: 30,
    };

    await expect(
      (guard as any).throwThrottlingException(context, throttlerLimitDetail),
    ).rejects.toBeInstanceOf(ThrottlerException);

    const logged = warnSpy.mock.calls[0][0] as string;
    expect(logged).toContain('GET /walkers');
    expect(logged).not.toContain('lat=');
    expect(logged).not.toContain('-34.5547');
  });
});
