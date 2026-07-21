import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TrackingGateway } from './tracking.gateway';
import { TrackingService } from './tracking.service';

function buildConfigMock() {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      throw new Error(`Missing config: ${key}`);
    }),
  };
}

function buildJwtMock() {
  return { verify: jest.fn() };
}

function buildClientMock(cookie: string) {
  return {
    id: 'socket-1',
    handshake: { headers: { cookie } },
    disconnect: jest.fn(),
    data: undefined as unknown,
  };
}

describe('TrackingGateway — handleConnection', () => {
  let gateway: TrackingGateway;
  let jwt: ReturnType<typeof buildJwtMock>;

  beforeEach(() => {
    jwt = buildJwtMock();
    gateway = new TrackingGateway(
      {} as unknown as TrackingService,
      jwt as unknown as JwtService,
      buildConfigMock() as unknown as ConfigService,
    );
  });

  it('desconecta un socket cuyo token trae purpose (ej. state de MP Connect)', async () => {
    jwt.verify.mockReturnValue({ sub: 'user-1', role: 'WALKER', purpose: 'mp-connect' });
    const client = buildClientMock('access_token=algun-jwt');

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.data).toBeUndefined();
  });

  it('desconecta un socket con cualquier purpose, no solo "mp-connect"', async () => {
    jwt.verify.mockReturnValue({ sub: 'user-1', role: 'WALKER', purpose: 'otro' });
    const client = buildClientMock('access_token=algun-jwt');

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
  });

  it('acepta un access token real (sin purpose) y setea client.data', async () => {
    jwt.verify.mockReturnValue({ sub: 'user-1', role: 'WALKER' });
    const client = buildClientMock('access_token=algun-jwt');

    await gateway.handleConnection(client as any);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data).toEqual({ userId: 'user-1', role: 'WALKER' });
  });

  it('desconecta si no hay cookie de access_token', async () => {
    const client = buildClientMock('');

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(jwt.verify).not.toHaveBeenCalled();
  });
});
