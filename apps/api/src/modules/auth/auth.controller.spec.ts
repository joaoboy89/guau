import { INestApplication, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'http';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// Un endpoint que dice QUIEN SOS no se cachea nunca — Cache-Control: no-store
// en las rutas de sesion (docs/diseños, ver el commit). Esto prueba el
// header de verdad en una respuesta HTTP real, no solo que el decorador
// @Header() este presente: lo que importa es que el navegador/Cloud
// Run/Cloudflare reciban el header en el wire.
describe('AuthController — Cache-Control', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            getMe: jest.fn().mockResolvedValue({
              id: 'user-1',
              email: 'joa@test.com',
              firstName: 'Joa',
              lastName: 'Test',
              role: 'OWNER',
            }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { id: 'user-1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
  });

  afterAll(async () => {
    await app.close();
  });

  function get(path: string): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}${path}`, (res) => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode as number, headers: res.headers }));
        })
        .on('error', reject);
    });
  }

  it('GET /auth/me responde con Cache-Control: no-store', async () => {
    const res = await get('/auth/me');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
