import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminController } from './admin.controller';

// AdminController lleva @Roles(UserRole.ADMIN) a nivel de clase — esto prueba
// que POST /admin/walks/:id/refund (y cualquier otra ruta del controller)
// queda cerrada para OWNER/WALKER, usando el mismo Reflector real que usa
// Nest en runtime (no un mock de la metadata).

function buildContext(role: string | undefined): ExecutionContext {
  return {
    getHandler: () => AdminController.prototype.refundWalk,
    getClass:   () => AdminController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { role } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminController — RolesGuard en POST /admin/walks/:id/refund', () => {
  const guard = new RolesGuard(new Reflector());

  it('ADMIN puede acceder', () => {
    expect(guard.canActivate(buildContext(UserRole.ADMIN))).toBe(true);
  });

  it('OWNER recibe 403 (RolesGuard.canActivate → false)', () => {
    expect(guard.canActivate(buildContext(UserRole.OWNER))).toBe(false);
  });

  it('WALKER recibe 403 (RolesGuard.canActivate → false)', () => {
    expect(guard.canActivate(buildContext(UserRole.WALKER))).toBe(false);
  });

  it('sin rol (no autenticado) recibe 403', () => {
    expect(guard.canActivate(buildContext(undefined))).toBe(false);
  });
});
