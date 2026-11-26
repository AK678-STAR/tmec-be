import { createRaceReady } from './fixtures/race-ready.fixture';
import { Prisma } from '@prisma/client';
import { normalizeDemoArgs } from './demo-data.catalog';
import { ConfigService } from '@nestjs/config';
import { DemoDataService } from './demo-data.service';
import { DemoDataGuard } from './demo-data.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('DemoDataService', () => {
  const owner = { id: 'owner', fullName: 'Owner' };
  let prisma: Record<string, unknown>;
  let service: DemoDataService;
  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn(async () => [owner]) },
      horseCatalogItem: {
        findMany: jest.fn(async () => [
          { type: 'BREED', name: 'Thoroughbred' },
          { type: 'COLOR', name: 'Bay' },
        ]),
      },
      stall: { count: jest.fn(async () => 2) },
    };
    service = new DemoDataService(
      prisma as unknown as PrismaService,
      {} as AuditService,
      { get: () => undefined } as unknown as ConfigService,
      { assertLocal: jest.fn() } as unknown as DemoDataGuard,
    );
  });
  it('returns only the necessary owner/catalog projection and real server time', async () => {
    const before = Date.now();
    const context = await service.getContext();
    expect(context.owners).toEqual([owner]);
    expect(context.recipes.map((r) => r.id)).toEqual(['ADMISSION_PENDING', 'RACE_READY']);
    expect(new Date(context.serverTime).getTime()).toBeGreaterThanOrEqual(before);
    expect(context.aiConfigured).toBe(false);
    expect(prisma).not.toHaveProperty('$transaction');
  });
  it('reports missing capacity without allocating a stall', async () => {
    (prisma.stall as { count: jest.Mock }).count.mockResolvedValue(0);
    const context = await service.getContext();
    expect(context.availableStalls).toBe(0);
    expect(context.recipes.find((r) => r.id === 'RACE_READY')?.reason).toBeTruthy();
  });
});

describe('demo input and permits', () => {
  const args = {
    scenario: 'ADMISSION_PENDING' as const,
    horseName: 'Sao Mai',
    ownerId: '610f5bf0-60a9-4e6c-9589-2385b1af33b1',
  };
  const actor = {
    userId: 'manager',
    fullName: 'Manager',
    role: 'CLUB_MANAGER',
    email: 'manager@example.com',
  };
  const generationId = 'e5181ae8-803e-417a-ad24-a4327d68e945';
  const sessionNonce = '0f4a304f-e688-4fe3-a4cd-76fa8f3d8759';
  const service = () =>
    new DemoDataService(
      {} as PrismaService,
      {} as AuditService,
      {} as ConfigService,
      {} as DemoDataGuard,
    );
  it('normalizes names and rejects freeform write instructions', () => {
    expect(normalizeDemoArgs({ ...args, horseName: '  Sao   Mai ' })).toEqual(args);
    expect(() => normalizeDemoArgs({ ...args, sql: 'delete' })).toThrow();
    expect(() => normalizeDemoArgs({ ...args, scenario: 'PAID' })).toThrow();
    expect(() => normalizeDemoArgs({ ...args, horseName: '<script>' })).toThrow();
    expect(() => normalizeDemoArgs({ ...args, ownerId: 'fake-id' })).toThrow();
  });
  it('binds a signed permit to actor, generation, tab and normalized args', () => {
    const data = service();
    const permit = data.issuePermit(actor, generationId, sessionNonce, args);
    expect(() =>
      data.verifyPermit(actor, { ...args, generationId, sessionNonce, permit }),
    ).not.toThrow();
    expect(() =>
      data.verifyPermit(
        { ...actor, userId: 'other' },
        { ...args, generationId, sessionNonce, permit },
      ),
    ).toThrow();
    expect(() =>
      data.verifyPermit(actor, { ...args, horseName: 'Other', generationId, sessionNonce, permit }),
    ).toThrow();
    expect(() =>
      data.verifyPermit(actor, { ...args, generationId, sessionNonce: generationId, permit }),
    ).toThrow();
    expect(() =>
      data.verifyPermit(actor, {
        ...args,
        generationId,
        sessionNonce,
        permit: permit + 'tampered',
      }),
    ).toThrow();
  });
  it('rejects expired permits', () => {
    const data = service();
    const permit = data.issuePermit(actor, generationId, sessionNonce, args);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    try {
      expect(() =>
        data.verifyPermit(actor, { ...args, generationId, sessionNonce, permit }),
      ).toThrow();
    } finally {
      clock.mockRestore();
    }
  });
});

describe('atomic admission generation', () => {
  const args = {
    scenario: 'ADMISSION_PENDING' as const,
    horseName: 'Sao Mai',
    ownerId: '610f5bf0-60a9-4e6c-9589-2385b1af33b1',
  };
  const actor = {
    userId: 'manager',
    fullName: 'Manager',
    role: 'CLUB_MANAGER',
    email: 'manager@example.com',
  };
  const generationId = 'e5181ae8-803e-417a-ad24-a4327d68e945';
  const sessionNonce = '0f4a304f-e688-4fe3-a4cd-76fa8f3d8759';
  const build = () => {
    const tx = {
      $queryRaw: jest.fn(async () => []),
      auditLog: { findFirst: jest.fn() },
      user: {
        findUnique: jest.fn(async ({ where }) =>
          where.id === actor.userId
            ? { role: 'CLUB_MANAGER', status: 'ACTIVE' }
            : { role: 'HORSE_OWNER', status: 'ACTIVE', isBadDebtFlagged: false },
        ),
      },
      horseCatalogItem: { findFirst: jest.fn(async () => ({ name: 'Catalog' })) },
      counter: { upsert: jest.fn(async () => ({ value: 1 })) },
      horse: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(async ({ data }) => data),
      },
      horseAdmissionRecord: {
        findUnique: jest.fn(),
        create: jest.fn(async ({ data }) => ({
          ...data,
          id: 'admission',
          history: [{ id: 'history' }],
        })),
      },
    };
    const prisma = { $transaction: jest.fn(async (fn) => fn(tx)) };
    const audit = { record: jest.fn(async (..._args: unknown[]) => {}) };
    const data = new DemoDataService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      {} as ConfigService,
      { assertLocal: jest.fn() } as unknown as DemoDataGuard,
    );
    const dto = {
      ...args,
      generationId,
      sessionNonce,
      permit: data.issuePermit(actor, generationId, sessionNonce, args),
    };
    return { tx, audit, data, dto, prisma };
  };
  it('creates a pending graph with coherent chip fields and transaction audit', async () => {
    const { data, tx, dto, audit } = build();
    const receipt = await data.createScenario(actor, dto);
    expect(receipt.horseId).toBe(generationId);
    const horse = tx.horse.create.mock.calls[0][0].data;
    expect(horse.status).toBe('PENDING_ADMISSION');
    expect(horse.name).toBe('DEMO Sao Mai');
    expect(horse.microchip).toMatch(/^\d{15}$/);
    expect(horse.microchipRfid).toBe(horse.microchip);
    const admission = tx.horseAdmissionRecord.create.mock.calls[0][0].data;
    expect(admission.status).toBe('PENDING_VERIFICATION');
    expect(admission).not.toHaveProperty('appointmentDate');
    expect(audit.record.mock.calls[0][5]).toBe(tx);
  });
  it('returns the committed receipt without a second horse on retry', async () => {
    const { data, tx, dto, audit } = build();
    const first = await data.createScenario(actor, dto);
    const snapshot = audit.record.mock.calls[0][4] as { newValues: unknown };
    tx.auditLog.findFirst.mockResolvedValue({
      userId: actor.userId,
      newValuesJson: JSON.stringify({ values: snapshot.newValues }),
    });
    await expect(data.createScenario(actor, dto)).resolves.toEqual(first);
    expect(tx.horse.create).toHaveBeenCalledTimes(1);
    const changed = { ...args, horseName: 'Khac' };
    await expect(
      data.createScenario(actor, {
        ...dto,
        ...changed,
        permit: data.issuePermit(actor, generationId, sessionNonce, changed),
      }),
    ).rejects.toThrow();
    expect(tx.horse.create).toHaveBeenCalledTimes(1);
  });
  it('propagates audit failure from inside the transaction', async () => {
    const { data, dto, audit } = build();
    audit.record.mockRejectedValue(new Error('audit unavailable'));
    await expect(data.createScenario(actor, dto)).rejects.toThrow('audit unavailable');
  });
  it('does not overwrite a pre-existing horse with the requested root ID', async () => {
    const { data, dto, tx } = build();
    tx.horse.findUnique.mockResolvedValue({ id: generationId });
    await expect(data.createScenario(actor, dto)).rejects.toThrow();
    expect(tx.horse.create).not.toHaveBeenCalled();
  });
});

describe('RACE_READY resource guards', () => {
  const args = {
    scenario: 'RACE_READY' as const,
    horseName: 'Bach Phong',
    ownerId: '610f5bf0-60a9-4e6c-9589-2385b1af33b1',
  };
  const actor = {
    userId: 'manager',
    fullName: 'Manager',
    role: 'CLUB_MANAGER',
    email: 'manager@example.com',
  };
  const now = new Date('2026-11-25T05:00:00Z');
  const build = () => ({
    $queryRaw: jest.fn(async () => []),
    stall: { findMany: jest.fn(async () => [{ id: 'stall', zoneId: 'zone', code: 'A01' }]) },
    user: {
      findFirst: jest.fn(async () => ({ id: 'vet', fullName: 'Vet' })),
      findMany: jest.fn(async () => [{ id: 'trainer', fullName: 'Trainer' }]),
      findUnique: jest.fn(async () => ({ role: 'GROOM', status: 'ACTIVE' })),
    },
    trainingTrack: {
      findMany: jest.fn(async () => [
        { id: 'track', surface: 'TURF', capacity: 6, isActive: true },
      ]),
    },
    workoutSession: { findMany: jest.fn(async () => []) },
    shiftRoster: { findMany: jest.fn(async () => []) },
    stallAllocation: { findFirst: jest.fn(), count: jest.fn(async () => 0) },
    dailyCareTask: { findMany: jest.fn(async () => []) },
    trainingPlan: { findMany: jest.fn(async () => []) },
    horse: { create: jest.fn() },
  });
  it.each(['stall', 'vet', 'trainer', 'track', 'duty'])(
    'refuses missing %s before creating any horse',
    async (missing) => {
      const tx = build();
      if (missing === 'stall') tx.stall.findMany.mockResolvedValue([]);
      if (missing === 'vet') tx.user.findFirst.mockResolvedValue(null as never);
      if (missing === 'trainer') tx.user.findMany.mockResolvedValue([]);
      if (missing === 'track') tx.trainingTrack.findMany.mockResolvedValue([]);
      await expect(
        createRaceReady(
          tx as unknown as Prisma.TransactionClient,
          args,
          'e5181ae8-803e-417a-ad24-a4327d68e945',
          actor,
          now,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'RESOURCE_UNAVAILABLE' }),
      });
      expect(tx.horse.create).not.toHaveBeenCalled();
    },
  );
});
