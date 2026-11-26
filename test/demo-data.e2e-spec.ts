import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { DemoDataModule } from '../src/demo-data/demo-data.module';
import { DemoDataService } from '../src/demo-data/demo-data.service';
import { DemoDataGuard } from '../src/demo-data/demo-data.guard';
import { DemoArgs, DemoReceipt } from '../src/demo-data/demo-data.catalog';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { CurrentUserPayload } from '../src/common/decorators/current-user.decorator';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';

const run = process.env.DEMO_E2E_ALLOW_WRITE === 'true' ? describe : describe.skip;

run('Demo data API with real loopback PostgreSQL (no scheduler/mail/provider)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let data: DemoDataService;
  let config: ConfigService;
  let actor: CurrentUserPayload;
  let token: string;
  let ownerToken: string;
  let existing: DemoReceipt;
  let args: DemoArgs;
  let baseline: Awaited<ReturnType<typeof snapshot>>;
  const priorEnv = {
    NODE_ENV: process.env.NODE_ENV,
    DEMO_DATA_ENABLED: process.env.DEMO_DATA_ENABLED,
  };
  const out = resolve('../tmp/demo-data-chat/t8/api');

  async function snapshot() {
    const tables = [
      'Horse',
      'TrainingPlan',
      'MedicalRecord',
      'FinancialInvoice',
      'TournamentRegistration',
      'TournamentResult',
    ];
    const rows = await Promise.all([
      prisma.horse.findMany(),
      prisma.trainingPlan.findMany(),
      prisma.medicalRecord.findMany(),
      prisma.financialInvoice.findMany(),
      prisma.tournamentRegistration.findMany(),
      prisma.tournamentResult.findMany(),
    ]);
    return rows.map((items, index) => ({
      table: tables[index],
      hashes: Object.fromEntries(
        items.map((row) => [
          row.id,
          createHash('sha256').update(JSON.stringify(row)).digest('hex'),
        ]),
      ),
    }));
  }

  function envelope(scenarioArgs = args, generationId = existing.generationId) {
    const sessionNonce = randomUUID();
    return {
      ...scenarioArgs,
      generationId,
      sessionNonce,
      permit: data.issuePermit(actor, generationId, sessionNonce, scenarioArgs),
    };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEMO_DATA_ENABLED = 'true';
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.local'] }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        NotificationsModule,
        DemoDataModule,
      ],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
        { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();
    module.get(DemoDataGuard).assertLocal();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    data = app.get(DemoDataService);
    config = app.get(ConfigService);
    const stored = await prisma.auditLog.findFirst({
      where: {
        entityName: 'DemoDataBatch',
        action: 'DEMO_DATA_CREATED',
        entityId: 'd63f2ee7-ed73-4f14-8069-711c4d6d522a',
      },
    });
    if (!stored?.userId)
      throw new Error(
        'Run the one-horse CP1 UI scenario first; this suite reuses its receipt instead of creating another pending horse.',
      );
    existing = JSON.parse(stored.newValuesJson!).values.receipt;
    const manager = await prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
    const horse = await prisma.horse.findUniqueOrThrow({ where: { id: existing.horseId } });
    if (
      manager.role !== 'CLUB_MANAGER' ||
      manager.status !== 'ACTIVE' ||
      !horse.ownerId ||
      !horse.name.startsWith('DEMO ')
    )
      throw new Error('CP1 resources no longer valid');
    actor = {
      userId: manager.id,
      fullName: manager.fullName,
      email: manager.email,
      role: manager.role,
    };
    args = { scenario: existing.scenario, horseName: horse.name.slice(5), ownerId: horse.ownerId };
    const jwt = new JwtService({ secret: config.get<string>('JWT_SECRET') });
    token = jwt.sign({ sub: manager.id, role: manager.role }, { expiresIn: '5m' });
    ownerToken = jwt.sign({ sub: horse.ownerId, role: 'HORSE_OWNER' }, { expiresIn: '5m' });
    baseline = await snapshot();
    await mkdir(out, { recursive: true });
  });

  afterAll(async () => {
    try {
      if (baseline && prisma) {
        const after = await snapshot();
        const changed: string[] = [];
        baseline.forEach((table, index) =>
          Object.entries(table.hashes).forEach(([id, hash]) => {
            if (after[index].hashes[id] !== hash) changed.push(`${table.table}:${id}`);
          }),
        );
        await writeFile(
          resolve(out, 'preservation.json'),
          JSON.stringify(
            {
              realPostgres: true,
              providerCalls: 0,
              existingGenerationId: existing?.generationId,
              oldRowsChecked: baseline.map((table) => ({
                table: table.table,
                count: Object.keys(table.hashes).length,
              })),
              changedOldRows: changed,
            },
            null,
            2,
          ),
        );
        expect(changed).toEqual([]);
      }
    } finally {
      if (app) await app.close();
      for (const [key, value] of Object.entries(priorEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('requires real JWT authentication and manager role', async () => {
    await request(app.getHttpServer()).get('/api/demo-data/context').expect(401);
    await request(app.getHttpServer())
      .get('/api/demo-data/context')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/demo-data/context')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it.each([
    ['DEMO_DATA_ENABLED', 'false', 'DEMO_DISABLED'],
    ['NODE_ENV', 'production', 'DEMO_DISABLED'],
    ['DATABASE_URL', 'postgresql://test:test@remote.invalid/test', 'DEMO_LOCAL_ONLY'],
  ])(
    'blocks unsafe runtime configuration %s without changing the DB connection',
    async (key, value, code) => {
      const original = config.get.bind(config);
      const spy = jest
        .spyOn(config, 'get')
        .mockImplementation((name: string) => (name === key ? value : original(name)));
      try {
        const res = await request(app.getHttpServer())
          .get('/api/demo-data/context')
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        expect(res.body.code).toBe(code);
      } finally {
        spy.mockRestore();
      }
    },
  );

  it('recovers the authoritative receipt and serializes concurrent retries without another horse', async () => {
    const body = envelope();
    const before = await prisma.horse.count();
    const replies = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/api/demo-data/scenarios')
          .set('Authorization', `Bearer ${token}`)
          .send(body),
      ),
    );
    expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
    replies.forEach((reply) => expect(reply.body.data).toEqual(existing));
    expect(await prisma.horse.count()).toBe(before);
    const recovered = await request(app.getHttpServer())
      .get(`/api/demo-data/generations/${existing.generationId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(recovered.body.data).toEqual(existing);
    expect(
      await prisma.auditLog.count({
        where: {
          entityName: 'DemoDataBatch',
          entityId: existing.generationId,
          action: 'DEMO_DATA_CREATED',
        },
      }),
    ).toBe(1);
  });

  it('rejects changed arguments, a tampered permit and injected virtual-clock fields', async () => {
    const changed = envelope({ ...args, horseName: 'Khac' });
    await request(app.getHttpServer())
      .post('/api/demo-data/scenarios')
      .set('Authorization', `Bearer ${token}`)
      .send(changed)
      .expect(409);
    const valid = envelope();
    await request(app.getHttpServer())
      .post('/api/demo-data/scenarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...valid, permit: valid.permit + 'invalid' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/demo-data/scenarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...valid, demoDate: '2030-01-01' })
      .expect(400);
  });

  it('rejects an owner that disappeared after preflight without an orphan', async () => {
    const id = randomUUID();
    const body = envelope({ ...args, ownerId: randomUUID() }, id);
    const result = await request(app.getHttpServer())
      .post('/api/demo-data/scenarios')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(409);
    expect(result.body.code).toBe('RESOURCE_UNAVAILABLE');
    expect(await prisma.horse.count({ where: { id } })).toBe(0);
  });

  it.each(['ADMISSION_PENDING', 'RACE_READY'] as const)(
    'rolls back the entire %s graph when transactional audit fails',
    async (scenario) => {
      const id = randomUUID();
      const before = await Promise.all([
        prisma.horse.count(),
        prisma.horseAdmissionRecord.count(),
        prisma.admissionHistoryLog.count(),
        prisma.admissionHealthReview.count(),
        prisma.stallAllocation.count(),
        prisma.medicalRecord.count(),
        prisma.injuryLog.count(),
        prisma.medicalLock.count(),
        prisma.trainingPlan.count(),
        prisma.workoutSession.count(),
        prisma.tournament.count(),
      ]);
      const beforeStalls = await prisma.stall.findMany({
        select: { id: true, status: true },
        orderBy: { id: 'asc' },
      });
      const audit = jest
        .spyOn(app.get(AuditService), 'record')
        .mockRejectedValueOnce(new Error('DEMO_TEST_ROLLBACK'));
      try {
        const response = await request(app.getHttpServer())
          .post('/api/demo-data/scenarios')
          .set('Authorization', `Bearer ${token}`)
          .send(envelope({ ...args, scenario, horseName: 'Kiem Tra Rollback' }, id));
        if (response.status === 409 && response.body.code === 'RESOURCE_UNAVAILABLE') {
          await writeFile(
            resolve(out, 'race-ready-blocked.json'),
            JSON.stringify(
              {
                code: response.body.code,
                message: response.body.message,
                generationId: id,
                committed: false,
              },
              null,
              2,
            ),
          );
          throw new Error(`RACE_READY_BLOCKED: ${response.body.message}`);
        }
        expect(response.status).toBe(500);
        expect(audit).toHaveBeenCalledTimes(1);
      } finally {
        audit.mockRestore();
      }
      const after = await Promise.all([
        prisma.horse.count(),
        prisma.horseAdmissionRecord.count(),
        prisma.admissionHistoryLog.count(),
        prisma.admissionHealthReview.count(),
        prisma.stallAllocation.count(),
        prisma.medicalRecord.count(),
        prisma.injuryLog.count(),
        prisma.medicalLock.count(),
        prisma.trainingPlan.count(),
        prisma.workoutSession.count(),
        prisma.tournament.count(),
      ]);
      expect(after).toEqual(before);
      expect(
        await prisma.stall.findMany({ select: { id: true, status: true }, orderBy: { id: 'asc' } }),
      ).toEqual(beforeStalls);
      expect(await prisma.horse.count({ where: { id } })).toBe(0);
      expect(
        await prisma.auditLog.count({ where: { entityId: id, entityName: 'DemoDataBatch' } }),
      ).toBe(0);
    },
  );
});
