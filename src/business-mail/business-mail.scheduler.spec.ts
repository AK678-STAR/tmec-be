import { STALL_HANDOVER_PREFIX } from '../daily-tasks/daily-schedule';
import { BusinessMailScheduler } from './business-mail.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessMailService } from './business-mail.service';

describe('BusinessMailScheduler', () => {
  let scheduler: BusinessMailScheduler;
  const prisma = {
    financialInvoice: { findMany: jest.fn(), findUnique: jest.fn() },
    dailyCareTask: { findMany: jest.fn(), findUnique: jest.fn() },
    shiftRoster: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
    businessMailing: { findMany: jest.fn() },
  };
  const mail = { emit: jest.fn(), retryFailed: jest.fn() };
  const horse = {
    id: 'horse',
    name: 'Horse',
    status: 'ACTIVE',
    deletedAt: null,
    stallAllocations: [{ stall: { id: 'stall', zoneId: 'zone' } }],
  };
  const invoice = (id: string, dueAt: string, netAmount = 100) => ({
    id,
    dueAt: new Date(dueAt),
    netAmount,
    status: 'SENT',
    boardingFee: 100,
    medicalFee: 0,
    trainingFee: 0,
    prizeCredit: 0,
    billingPeriod: '2026-11',
    ownerId: 'owner',
    owner: { id: 'owner', fullName: 'Owner' },
    horse,
  });
  const task = (id = 'task', overrides = {}) => ({
    id,
    taskCode: id,
    date: new Date('2026-11-22T00:00:00Z'),
    scheduledTime: '08:00',
    taskType: 'FEEDING',
    title: 'Feed',
    isCompleted: false,
    horse,
    stallId: 'stall',
    stallZoneId: 'zone',
    shiftId: 'shift',
    assignedGroomUserId: 'groom',
    assignedGroom: { id: 'groom', fullName: 'Groom', role: 'GROOM', status: 'ACTIVE' },
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-23T00:00:00Z'));
    prisma.financialInvoice.findMany.mockResolvedValue([]);
    prisma.dailyCareTask.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockImplementation(({ where }) =>
      Promise.resolve(
        where.role === 'VETERINARIAN'
          ? [{ id: 'vet', fullName: 'Vet' }]
          : [{ id: 'manager', fullName: 'Manager' }],
      ),
    );
    prisma.shiftRoster.findFirst.mockResolvedValue({ id: 'roster' });
    prisma.businessMailing.findMany.mockResolvedValue([]);
    mail.emit.mockResolvedValue([]);
    mail.retryFailed.mockResolvedValue(0);
    scheduler = new BusinessMailScheduler(
      prisma as unknown as PrismaService,
      mail as unknown as BusinessMailService,
    );
  });
  afterEach(() => jest.useRealTimers());

  it('uses club calendar milestone windows to recover downtime and excludes zero/paid balances', async () => {
    const rows = [
      invoice('soon', '2026-11-25T17:00:00Z'), // Nov 26 local, exactly 3 days
      invoice('two', '2026-11-25T00:00:00Z'),
      invoice('today', '2026-11-23T12:00:00Z'),
      invoice('three', '2026-11-20T00:00:00Z'),
      invoice('four', '2026-11-19T00:00:00Z'),
      invoice('seven', '2026-11-16T00:00:00Z'),
      invoice('zero', '2026-11-23T00:00:00Z', 0),
      { ...invoice('paid', '2026-11-23T00:00:00Z'), status: 'PAID' },
    ];
    prisma.financialInvoice.findMany.mockResolvedValue(rows);
    prisma.financialInvoice.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(rows.find((i) => i.id === where.id)),
    );
    await scheduler.remind();
    expect(
      mail.emit.mock.calls.map(([e]) => [
        e.eventCode,
        e.recipients[0].body.refId,
        e.recipients[0].body.milestone,
      ]),
    ).toEqual([
      ['DUE_SOON', 'soon', 'due-3d'],
      ['DUE_SOON', 'two', 'due-3d'],
      ['DUE_SOON', 'today', 'due-day'],
      ['OVERDUE_3D', 'three', 'overdue-3d'],
      ['OVERDUE_3D', 'four', 'overdue-3d'],
      ['OVERDUE_7D', 'seven', 'overdue-7d'],
    ]);
    expect(mail.emit.mock.calls[5][0].recipients.map((r) => r.userId)).toEqual([
      'owner',
      'manager',
    ]);
    expect(mail.retryFailed).toHaveBeenCalledTimes(1);
  });

  it('rechecks invoice payment after scanning', async () => {
    prisma.financialInvoice.findMany.mockResolvedValue([invoice('i', '2026-11-23T00:00:00Z')]);
    prisma.financialInvoice.findUnique.mockResolvedValue({
      ...invoice('i', '2026-11-23T00:00:00Z'),
      status: 'PAID',
    });
    await scheduler.remind();
    expect(mail.emit).not.toHaveBeenCalled();
  });

  it('combines date-only UTC and local HH:mm, including the three-hour boundary', async () => {
    const rows = ['06:59', '07:00', '10:00', '10:01'].map((time) =>
      task(time, {
        date: new Date('2026-11-23T00:00:00Z'),
        scheduledTime: time,
      }),
    );
    prisma.dailyCareTask.findMany.mockResolvedValue(rows);
    prisma.dailyCareTask.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(rows.find((t) => t.id === where.id)),
    );
    await scheduler.remind();
    expect(mail.emit.mock.calls.map(([e]) => [e.eventCode, e.recipients[0].body.refId])).toEqual([
      ['TASK_DUE_SOON', '07:00'],
      ['TASK_DUE_SOON', '10:00'],
    ]);
    expect(mail.emit.mock.calls[0][0].recipients[0].body.text).not.toContain('Invalid Date');
  });

  it('routes medical unassigned work to managers and vets without blaming a groom', async () => {
    const row = task('medical', {
      assignedGroomUserId: null,
      assignedGroom: null,
      taskType: 'MEDICATION',
    });
    prisma.dailyCareTask.findMany.mockResolvedValue([row]);
    prisma.dailyCareTask.findUnique.mockResolvedValue(row);
    await scheduler.remind();
    expect(mail.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: 'TASK_UNASSIGNED_OVERDUE',
        recipients: [
          expect.objectContaining({ userId: 'manager' }),
          expect.objectContaining({ userId: 'vet' }),
        ],
      }),
    );
  });

  it('treats removed roster or moved horse assignments as needing assignment', async () => {
    const row = task();
    prisma.dailyCareTask.findMany.mockResolvedValue([row]);
    prisma.dailyCareTask.findUnique.mockResolvedValue(row);
    prisma.shiftRoster.findFirst.mockResolvedValue(null);
    await scheduler.remind();
    expect(mail.emit.mock.calls[0][0].eventCode).toBe('TASK_UNASSIGNED_OVERDUE');
    expect(mail.emit.mock.calls[0][0].recipients.map((r) => r.userId)).toEqual(['manager']);
  });

  it('does not count multiple recipient records or SMTP retries as repeat lateness', async () => {
    const row = task();
    prisma.dailyCareTask.findMany.mockResolvedValue([row]);
    prisma.dailyCareTask.findUnique.mockResolvedValue(row);
    prisma.businessMailing.findMany.mockResolvedValue([
      { refId: 'task', attempts: 3 },
      { refId: 'task', attempts: 2 },
    ]);
    await scheduler.remind();
    expect(mail.emit.mock.calls.map(([e]) => e.eventCode)).toEqual(['TASK_OVERDUE']);
  });

  it('escalates two distinct overdue tasks to the current groom and managers', async () => {
    const row = task();
    prisma.dailyCareTask.findMany.mockResolvedValue([row]);
    prisma.dailyCareTask.findUnique.mockResolvedValue(row);
    prisma.businessMailing.findMany.mockResolvedValue([{ refId: 'earlier' }, { refId: 'earlier' }]);
    await scheduler.remind();
    const event = mail.emit.mock.calls.find(([e]) => e.eventCode === 'REPEAT_OVERDUE')![0];
    expect(event.recipients.map((r) => r.userId)).toEqual(['groom', 'manager']);
    expect(event.recipients[0].body.refId).toBe('task');
    expect(event.recipients[0].body.text).toContain('2');
  });

  it('uses the club date across UTC midnight and skips moved horse worker assignments', async () => {
    jest.setSystemTime(new Date('2026-11-22T17:00:00Z')); // Nov 23 00:00 in the club
    const row = task('moved', {
      horse: { ...horse, stallAllocations: [{ stall: { id: 'other', zoneId: 'other-zone' } }] },
    });
    prisma.dailyCareTask.findMany.mockResolvedValue([row]);
    prisma.dailyCareTask.findUnique.mockResolvedValue(row);
    await scheduler.remind();
    expect(prisma.dailyCareTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ date: { lte: new Date('2026-11-23T00:00:00Z') } }),
      }),
    );
    expect(mail.emit.mock.calls[0][0].eventCode).toBe('TASK_UNASSIGNED_OVERDUE');
    expect(mail.emit.mock.calls[0][0].recipients.map((r) => r.userId)).toEqual(['manager']);
  });

  it('skips completed/deleted/retired work and continues after one object fails', async () => {
    const rows = [
      task('broken'),
      task('done', { isCompleted: true }),
      task('retired', {
        horse: { ...horse, status: 'RETIRED' },
      }),
      task('valid'),
    ];
    prisma.dailyCareTask.findMany.mockResolvedValue(rows);
    prisma.dailyCareTask.findUnique.mockImplementation(({ where }) => {
      if (where.id === 'broken') throw new Error('read failed');
      return Promise.resolve(rows.find((t) => t.id === where.id));
    });
    await scheduler.remind();
    expect(mail.emit).toHaveBeenCalledTimes(1);
    expect(mail.emit.mock.calls[0][0].recipients[0].body.refId).toBe('valid');
    expect(mail.retryFailed).toHaveBeenCalled();
  });
  it('keeps the source-zone worker responsible for handover after the horse moves', async () => {
    const row = task('handover', {
      taskCode: STALL_HANDOVER_PREFIX + 'allocation',
      taskType: 'OTHER',
      horse: {
        ...horse,
        stallAllocations: [{ stall: { id: 'destination', zoneId: 'destination-zone' } }],
      },
    });
    prisma.dailyCareTask.findMany.mockResolvedValue([row]);
    prisma.dailyCareTask.findUnique.mockResolvedValue(row);
    await scheduler.remind();
    expect(mail.emit.mock.calls[0][0].eventCode).toBe('TASK_OVERDUE');
    expect(mail.emit.mock.calls[0][0].recipients.map((r) => r.userId)).toEqual(['groom']);
    expect(prisma.shiftRoster.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ zoneId: 'zone', groomUserId: 'groom' }),
      }),
    );
  });
});
