import { StaffWorkService } from './staff-work.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

const actor = {
  userId: 'manager',
  role: 'CLUB_MANAGER',
  fullName: 'Quản lý',
} as CurrentUserPayload;
function setup() {
  const prisma = {
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'manager', fullName: 'Quản lý', role: 'CLUB_MANAGER' }]),
      findFirst: jest.fn().mockResolvedValue({ id: 'manager' }),
    },
    horseAdmissionRecord: { findMany: jest.fn().mockResolvedValue([]) },
    staffWorkItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
    },
    shiftRoster: { findMany: jest.fn().mockResolvedValue([]) },
    dailyCareTask: { findMany: jest.fn().mockResolvedValue([]) },
    preventiveSchedule: { findMany: jest.fn().mockResolvedValue([]) },
    medicalRecord: { findMany: jest.fn().mockResolvedValue([]) },
    incidentReport: { count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn) => fn(prisma));
  return { prisma, service: new StaffWorkService(prisma as never, { record: jest.fn() } as never) };
}

describe('Staff work overview', () => {
  it('counts one shared admission once while preserving both participants', async () => {
    const { prisma, service } = setup();
    prisma.horseAdmissionRecord.findMany.mockResolvedValue([
      {
        id: 'a',
        admissionCode: 'ADM-1',
        horse: { name: 'Ngựa A' },
        managerUserId: 'manager',
        veterinarianUserId: 'vet',
        appointmentDate: new Date('2026-12-01T02:00:00Z'),
        appointmentEndDate: new Date('2026-12-01T03:00:00Z'),
        status: 'APPOINTED',
      },
    ]);
    const result = await service.overview({ from: '2026-12-01', to: '2026-12-01' }, actor);
    expect(result.summary.total).toBe(1);
    expect(result.events[0].userIds).toEqual(['manager', 'vet']);
    expect(result.summary.unassigned).toBe(0);
    expect(result.events[0].link).toBe('/horses/admissions?inspection=a');
  });
  it('scopes a veterinarian to their own work and does not read incident totals', async () => {
    const { prisma, service } = setup();
    await service.overview(
      { from: '2026-12-01', to: '2026-12-01' },
      { ...actor, userId: 'vet', role: 'VETERINARIAN' },
    );
    expect(prisma.staffWorkItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'vet' }) }),
    );
    expect(prisma.medicalRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ veterinarianUserId: 'vet' }) }),
    );
    expect(prisma.incidentReport.count).not.toHaveBeenCalled();
  });
  it('opens the assigned veterinarian admission directly from their calendar', async () => {
    const { prisma, service } = setup();
    prisma.horseAdmissionRecord.findMany.mockResolvedValue([
      {
        id: 'assigned',
        admissionCode: 'ADM-1',
        horse: { name: 'Atlas' },
        managerUserId: 'manager',
        veterinarianUserId: 'vet',
        appointmentDate: new Date('2026-12-01T02:00:00Z'),
        status: 'APPOINTED',
      },
    ]);
    const result = await service.overview(
      { from: '2026-12-01', to: '2026-12-01' },
      { ...actor, userId: 'vet', role: 'VETERINARIAN' },
    );
    expect(result.events[0].link).toBe('/medical/admissions?inspection=assigned');
  });
  it('does not invent events when source tables are empty', async () => {
    const { service } = setup();
    const result = await service.overview({ from: '2026-12-01', to: '2026-12-01' }, actor);
    expect(result.events).toEqual([]);
    expect(result.summary.total).toBe(0);
  });
  it('rejects unbounded calendar reads', async () => {
    const { service } = setup();
    await expect(
      service.overview({ from: '2026-01-01', to: '2026-12-31' }, actor),
    ).rejects.toMatchObject({ response: { code: 'INVALID_WORK_RANGE' } });
  });
  it('prevents staff from updating another employee work item', async () => {
    const { prisma, service } = setup();
    prisma.staffWorkItem.findUnique.mockResolvedValue({
      id: 'w',
      userId: 'other',
      status: 'PENDING',
    });
    await expect(
      service.changeStatus('w', 'COMPLETED', { ...actor, userId: 'vet', role: 'VETERINARIAN' }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(prisma.staffWorkItem.update).not.toHaveBeenCalled();
  });
  it('blocks work creation over an existing appointment', async () => {
    const { prisma, service } = setup();
    const start = new Date(Date.now() + 86400000),
      end = new Date(start.getTime() + 3600000);
    prisma.staffWorkItem.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      service.create(
        {
          title: 'Kiểm tra chuồng',
          userId: 'manager',
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
        },
        actor,
      ),
    ).rejects.toMatchObject({ response: { code: 'STAFF_SCHEDULE_CONFLICT' } });
    expect(prisma.staffWorkItem.create).not.toHaveBeenCalled();
  });
});
