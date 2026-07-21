import { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
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
