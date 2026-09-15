import * as Sentry from '@sentry/nestjs';
import { MailService } from './mail.service';

// mockSend se reasigna en cada test que lo necesita — el wrapper de abajo
// siempre delega al valor actual, así Resend (mockeado a nivel de módulo)
// no necesita reconstruirse por test.
let mockSend: jest.Mock;

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (...args: unknown[]) => mockSend(...args) },
  })),
}));

function buildService(env: Record<string, string>) {
  const config = { get: jest.fn((key: string) => env[key]) };
  return new MailService(config as any);
}

const BASE_DETAILS = {
  walkId: 'walk-1',
  reason: 'el paseador nunca marcó que iba en camino',
  scheduledAt: new Date('2026-08-14T15:00:00.000Z'),
  totalAmount: 3000,
  ownerName: 'Ana Gómez',
  ownerEmail: 'ana@test.com',
  walkerName: 'Juan Pérez',
};

describe('MailService — sendNotPerformedAlert', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sin ADMIN_ALERT_EMAIL configurada: no rompe y deja un warning explícito', () => {
    // RESEND_API_KEY placeholder para que el constructor no la trate como
    // real — igual da lo mismo para este test, el chequeo de
    // ADMIN_ALERT_EMAIL corre primero.
    const service = buildService({ RESEND_API_KEY: '', ADMIN_ALERT_EMAIL: '' });
    const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});

    expect(() => service.sendNotPerformedAlert(BASE_DETAILS)).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ADMIN_ALERT_EMAIL'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('walk-1'));
  });

  it('con ADMIN_ALERT_EMAIL pero sin RESEND_API_KEY (emails deshabilitados): tampoco rompe', () => {
    const service = buildService({ RESEND_API_KEY: '', ADMIN_ALERT_EMAIL: 'joa@guau.com' });

    expect(() => service.sendNotPerformedAlert(BASE_DETAILS)).not.toThrow();
  });

  it('sin ninguna de las dos variables: tampoco rompe (el job que la llama tiene que seguir funcionando)', () => {
    const service = buildService({});

    expect(() => service.sendNotPerformedAlert(BASE_DETAILS)).not.toThrow();
  });

  // Este es el mail que avisa que hay plata en un paseo que no se hizo — si
  // el envío falla y eso solo se loguea, es silencio de segundo orden: no
  // te enterás de que no te enteraste.
  it('si Resend falla al enviar: se reporta a Sentry con el walkId, y no rompe (mismo comportamiento de siempre)', async () => {
    const captureSpy = jest.spyOn(Sentry, 'captureException').mockImplementation();
    const sendError = new Error('Resend: 503 service unavailable');
    mockSend = jest.fn().mockRejectedValue(sendError);
    const service = buildService({ RESEND_API_KEY: 'una-clave-real', ADMIN_ALERT_EMAIL: 'joa@guau.com' });
    const errorSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

    expect(() => service.sendNotPerformedAlert(BASE_DETAILS)).not.toThrow();
    // El .send() es fire-and-forget — dejar correr el microtask del .catch().
    await new Promise((resolve) => setImmediate(resolve));

    expect(captureSpy).toHaveBeenCalledWith(sendError, expect.objectContaining({ tags: { walkId: 'walk-1' } }));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('walk-1'));

    captureSpy.mockRestore();
  });
});
