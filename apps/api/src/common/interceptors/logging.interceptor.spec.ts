import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
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
});
