import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('PermissionsGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const guard = new PermissionsGuard(reflector);

  const contextWith = (user: unknown) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const requires = (permission: string | undefined, isPublic = false) =>
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return isPublic;
      if (key === PERMISSION_KEY) return permission;
      return false;
    });

  it('should allow public routes', () => {
    requires('manageAccounts', true);
    expect(guard.canActivate(contextWith({ permissions: {} }))).toBe(true);
  });

  it('should allow routes that need no permission', () => {
    requires(undefined);
    expect(guard.canActivate(contextWith({ permissions: {} }))).toBe(true);
  });

  it('should allow a user whose permission switch is on', () => {
    requires('manageAccounts');
    expect(guard.canActivate(contextWith({ permissions: { manageAccounts: true } }))).toBe(true);
  });

  it('should refuse a user whose permission switch is off', () => {
    requires('manageAccounts');
    expect(() =>
      guard.canActivate(contextWith({ permissions: { manageAccounts: false } })),
    ).toThrow(ForbiddenException);
  });

  it('should allow CLUB_MANAGER by default if permission is not revoked', () => {
    requires('viewAudit');
    expect(guard.canActivate(contextWith({ role: 'CLUB_MANAGER' }))).toBe(true);
  });

  it('should refuse CLUB_MANAGER if permission is explicitly revoked', () => {
    requires('viewAudit');
    expect(() =>
      guard.canActivate(contextWith({ role: 'CLUB_MANAGER', permissions: { viewAudit: false } })),
    ).toThrow(ForbiddenException);
  });

  it('should refuse a user without permissions', () => {
    requires('viewAudit');
    expect(() => guard.canActivate(contextWith({}))).toThrow(ForbiddenException);
  });
});
