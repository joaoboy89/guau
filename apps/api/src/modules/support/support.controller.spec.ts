import { ExecutionContext, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SupportController } from './support.controller';

// @Roles(UserRole.ADMIN) esta a nivel de clase (docs/diseños/modulo-soporte.md
// §1: hoy solo ADMIN, SUPPORT todavia no existe) — se prueba con el mismo
// Reflector real que usa Nest en runtime, no un mock de la metadata.

function buildContext(role: string | undefined): ExecutionContext {
  return {
    getHandler: () => SupportController.prototype.searchWalks,
    getClass:   () => SupportController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { role } }),
    }),
  } as unknown as ExecutionContext;
}

describe('SupportController — RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('ADMIN puede acceder', () => {
    expect(guard.canActivate(buildContext(UserRole.ADMIN))).toBe(true);
  });

  it('OWNER recibe 403', () => {
    expect(guard.canActivate(buildContext(UserRole.OWNER))).toBe(false);
  });

  it('WALKER recibe 403', () => {
    expect(guard.canActivate(buildContext(UserRole.WALKER))).toBe(false);
  });

  it('sin rol (no autenticado) recibe 403', () => {
    expect(guard.canActivate(buildContext(undefined))).toBe(false);
  });
});

// GET /support/walks/:id y /support/walks/:id/messages usan ParseUUIDPipe en
// :id (docs/diseños/modulo-soporte.md §4: "un id mal formado da 400 en la
// puerta y NI TOCA la base"). No hay harness de e2e en este repo — se prueba
// el pipe en si, que es exactamente lo que Nest ejecuta ANTES del handler:
// si el pipe tira, SupportService.getCase()/getMessages() nunca se llaman.
describe('SupportController — ParseUUIDPipe en :id', () => {
  const pipe = new ParseUUIDPipe();

  it('un id mal formado tira BadRequestException, antes de llegar al service', async () => {
    await expect(
      pipe.transform('hola-que-tal', { type: 'param', metatype: String, data: 'id' }),
    ).rejects.toThrow();
  });

  it('un UUID valido pasa', async () => {
    const valid = 'a3f1b2c4-5d6e-7f89-0123-456789abcdef';
    await expect(
      pipe.transform(valid, { type: 'param', metatype: String, data: 'id' }),
    ).resolves.toBe(valid);
  });
});
