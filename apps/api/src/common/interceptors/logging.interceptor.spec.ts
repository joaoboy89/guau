import { ExecutionContext, CallHandler, NotFoundException } from '@nestjs/common';
import { of, throwError, firstValueFrom } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

function buildContext(method: string, url: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, url }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;
}

function buildCallHandler(): CallHandler {
  return { handle: () => of('respuesta') };
}

function buildFailingCallHandler(error: unknown): CallHandler {
  return { handle: () => throwError(() => error) };
}

describe('LoggingInterceptor', () => {
  it('/health: no llama al logger', (done) => {
    const interceptor = new LoggingInterceptor();
    const logSpy = jest.spyOn((interceptor as any).logger, 'log').mockImplementation(() => {});
    const context = buildContext('GET', '/health');

    interceptor.intercept(context, buildCallHandler()).subscribe(() => {
      expect(logSpy).not.toHaveBeenCalled();
      done();
    });
  });

  it('/health con query string (?foo=bar): tampoco llama al logger', (done) => {
    const interceptor = new LoggingInterceptor();
    const logSpy = jest.spyOn((interceptor as any).logger, 'log').mockImplementation(() => {});
    const context = buildContext('GET', '/health?foo=bar');

    interceptor.intercept(context, buildCallHandler()).subscribe(() => {
      expect(logSpy).not.toHaveBeenCalled();
      done();
    });
  });

  it('cualquier otra ruta: si llama al logger, con metodo/url/status', (done) => {
    const interceptor = new LoggingInterceptor();
    const logSpy = jest.spyOn((interceptor as any).logger, 'log').mockImplementation(() => {});
    const context = buildContext('GET', '/walk-types');

    interceptor.intercept(context, buildCallHandler()).subscribe(() => {
      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = logSpy.mock.calls[0][0] as string;
      expect(logged).toContain('GET /walk-types 200');
      done();
    });
  });

  // ─── Camino de error (el bug real: tap(fn) nunca corria acá) ───────────────

  describe('camino de error', () => {
    it('una excepcion HttpException (ej. 404): loguea con el status REAL de la excepcion', async () => {
      const interceptor = new LoggingInterceptor();
      const logSpy = jest.spyOn((interceptor as any).logger, 'log').mockImplementation(() => {});
      const context = buildContext('GET', '/walks/inexistente');
      const handler = buildFailingCallHandler(new NotFoundException('Paseo no encontrado'));

      await expect(firstValueFrom(interceptor.intercept(context, handler))).rejects.toThrow();

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = logSpy.mock.calls[0][0] as string;
      expect(logged).toContain('GET /walks/inexistente 404');
    });

    it('un error NO manejado (Error comun): loguea como 500, sin leer res.statusCode', async () => {
      const interceptor = new LoggingInterceptor();
      const logSpy = jest.spyOn((interceptor as any).logger, 'log').mockImplementation(() => {});
      // res.statusCode arranca en 200 (default de Express antes de escribir
      // la respuesta) — si el interceptor lo leyera acá, logueria un 200
      // incorrecto en vez de deducir 500 de la excepcion misma.
      const context = buildContext('GET', '/health/debug-sentry');
      const handler = buildFailingCallHandler(new Error('boom no manejado'));

      await expect(firstValueFrom(interceptor.intercept(context, handler))).rejects.toThrow();

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = logSpy.mock.calls[0][0] as string;
      expect(logged).toContain('GET /health/debug-sentry 500');
    });

    it('la excepcion sigue propagandose — el interceptor solo loguea, no la atrapa', async () => {
      const interceptor = new LoggingInterceptor();
      jest.spyOn((interceptor as any).logger, 'log').mockImplementation(() => {});
      const context = buildContext('GET', '/walk-types');
      const originalError = new Error('el error original tiene que llegar intacto');
      const handler = buildFailingCallHandler(originalError);

      await expect(firstValueFrom(interceptor.intercept(context, handler))).rejects.toBe(originalError);
    });

    it('/health: NO loguea en el camino de error tampoco (los dos caminos quedan silenciados)', async () => {
      const interceptor = new LoggingInterceptor();
      const logSpy = jest.spyOn((interceptor as any).logger, 'log').mockImplementation(() => {});
      const context = buildContext('GET', '/health');
      const handler = buildFailingCallHandler(new Error('la base esta caida'));

      await expect(firstValueFrom(interceptor.intercept(context, handler))).rejects.toThrow();

      expect(logSpy).not.toHaveBeenCalled();
    });
  });
});
