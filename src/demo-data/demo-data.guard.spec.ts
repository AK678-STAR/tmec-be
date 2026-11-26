import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DemoDataGuard } from './demo-data.guard';
import { PrismaService } from '../prisma/prisma.service';

describe('DemoDataGuard', () => {
  const settings: Record<string, string> = {
    NODE_ENV: 'development',
    DEMO_DATA_ENABLED: 'true',
    DATABASE_URL: 'postgresql://demo:demo@localhost:5432/demo',
  };
  let user: { id: string; role: string; status: string };
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'manager' } }) }),
  } as ExecutionContext;
  const check = (overrides = {}) =>
    new DemoDataGuard(
      { get: (name: string) => ({ ...settings, ...overrides })[name] } as ConfigService,
      { user: { findUnique: jest.fn(async () => user) } } as unknown as PrismaService,
    ).canActivate(context);
  beforeEach(() => {
    user = { id: 'manager', role: 'CLUB_MANAGER', status: 'ACTIVE' };
  });
  it('allows any active account on local development only', async () => {
    await expect(check()).resolves.toBe(true);
    user = { id: 'trainer', role: 'HEAD_TRAINER', status: 'ACTIVE' };
    await expect(check()).resolves.toBe(true);
  });
  it.each([
    { DEMO_DATA_ENABLED: 'false' },
    { NODE_ENV: 'production' },
    { DATABASE_URL: 'postgresql://x:x@remote.example/db' },
    { DIRECT_URL: 'postgresql://x:x@remote.example/db' },
    { DATABASE_URL: 'invalid' },
  ])('blocks unsafe configuration %o', async (overrides) => {
    await expect(check(overrides)).rejects.toThrow();
  });
  it.each([
    { role: 'CLUB_MANAGER', status: 'LOCKED' },
    { role: 'GROOM', status: 'INACTIVE' },
  ])('rechecks the account %o', async (fields) => {
    user = { ...user, ...fields };
    await expect(check()).rejects.toThrow();
  });
});
