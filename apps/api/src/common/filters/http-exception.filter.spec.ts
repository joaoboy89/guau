import { ArgumentsHost, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { HttpExceptionFilter } from './http-exception.filter';

function buildHost(url: string) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const response = { status };
  const request = { url };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  let captureExceptionSpy: jest.SpyInstance;

  beforeEach(() => {
    captureExceptionSpy = jest.spyOn(Sentry, 'captureException').mockImplementation();
  });

  afterEach(() => {
    captureExceptionSpy.mockRestore();
  });

  it('un 404 NO se reporta a Sentry, y la respuesta mantiene statusCode/message/timestamp/path', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = buildHost('/walks/abc');

    filter.catch(new NotFoundException('Paseo no encontrado'), host);

    expect(captureExceptionSpy).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(404);
    const body = json.mock.calls[0][0];
    expect(body).toMatchObject({ statusCode: 404, path: '/walks/abc', message: 'Paseo no encontrado' });
    expect(body).toHaveProperty('timestamp');
  });

  it('un 400 tampoco se reporta a Sentry (mismo criterio que 404: son 4xx)', () => {
    const filter = new HttpExceptionFilter();
    const { host } = buildHost('/dogs');

    filter.catch(new BadRequestException('Dato invalido'), host);

    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it('un 500 lanzado a mano (InternalServerErrorException, sigue siendo HttpException) SI se reporta a Sentry', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = buildHost('/walks/xyz/start');
    const exception = new InternalServerErrorException('Algo se rompio adentro');

    filter.catch(exception, host);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(exception);
    // El shape de la respuesta NO cambia por reportar a Sentry.
    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body).toMatchObject({ statusCode: 500, path: '/walks/xyz/start', message: 'Algo se rompio adentro' });
    expect(body).toHaveProperty('timestamp');
  });

  it('sin DSN configurado (captureException no-op): no rompe nada, la respuesta sale igual', () => {
    // captureException real (sin mock) de un SDK sin Sentry.init() llamado
    // es un no-op documentado — nunca tira. No reinicializamos Sentry acá:
    // el objetivo es probar que un 500 se maneja igual con o sin SDK activo.
    captureExceptionSpy.mockRestore();
    const filter = new HttpExceptionFilter();
    const { host, status, json } = buildHost('/walks/xyz/start');

    expect(() => filter.catch(new InternalServerErrorException('boom'), host)).not.toThrow();
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledTimes(1);
  });
});
