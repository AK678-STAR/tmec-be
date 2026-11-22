import { ShiftRostersService } from './shift-rosters.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RequestShiftSwapDto } from './dto/shift-roster.dto';

describe('Shift swap requests', () => {
  const actor: CurrentUserPayload = {
    userId: 'source',
    role: 'GROOM',
    fullName: 'Source',
    email: 's@test.local',
  };
  const target = {
    id: '633c7f90-f14a-4d55-9b39-c551c5185077',
    fullName: 'Target',
    role: 'GROOM',
    status: 'ACTIVE',
  };
  const shift = {
    id: 'shift',
    name: 'Morning',
    isActive: true,
    startTime: '07:00',
    endTime: '13:00',
    isOvernight: false,
  };
  const source = {
    id: 'roster',
    groomUserId: actor.userId,
    date: new Date('2026-11-24T00:00:00Z'),
    shiftId: 'shift',
    zoneId: 'zone',
    shift,
    zone: { name: 'A', isActive: true },
  };
  let prisma: any;
  let audit: any;
  let notifications: any;
  let service: ShiftRostersService;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-23T00:00:00Z'));
    prisma = {
      shiftRoster: {
        findUnique: jest.fn().mockResolvedValue(source),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: { findMany: jest.fn().mockResolvedValue([target]) },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = { notifyRoles: jest.fn().mockResolvedValue(undefined) };
    service = new ShiftRostersService(prisma, audit, undefined, notifications);
  });
  afterEach(() => jest.useRealTimers());

  it('offers active available colleagues and records a request without exchanging assignments', async () => {
    expect(await service.getSwapCandidates('roster', actor)).toEqual([
      { id: target.id, fullName: 'Target' },
    ]);
    expect(
      await service.requestSwap(
        'roster',
        { targetGroomUserId: target.id, reason: '  Family matter  ' },
        actor,
      ),
    ).toEqual({ requested: true });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'source' }),
      'SHIFT_SWAP_REQUESTED',
      expect.any(String),
      'roster',
      expect.objectContaining({
        newValues: expect.objectContaining({
          sourceGroomUserId: 'source',
          targetGroomUserId: target.id,
          reason: 'Family matter',
          date: '2026-11-24',
          shiftId: 'shift',
          zoneId: 'zone',
        }),
      }),
      prisma,
    );
    expect(notifications.notifyRoles).toHaveBeenCalledWith(
      ['CLUB_MANAGER'],
      expect.objectContaining({
        link: '/stable/shifts',
        dedupeKey: `shift-swap:roster:source:${target.id}:2026-11-24`,
      }),
    );
  });

  it('rejects another worker roster and non-groom callers in service', async () => {
    await expect(
      service.getSwapCandidates('roster', { ...actor, userId: 'other' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.getSwapCandidates('roster', { ...actor, role: 'CLUB_MANAGER' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects missing, inactive, and completed shifts', async () => {
    prisma.shiftRoster.findUnique.mockResolvedValueOnce(null);
    await expect(service.getSwapCandidates('missing', actor)).rejects.toMatchObject({
      status: 404,
    });
    prisma.shiftRoster.findUnique.mockResolvedValueOnce({
      ...source,
      shift: { ...shift, isActive: false },
    });
    await expect(service.getSwapCandidates('roster', actor)).rejects.toMatchObject({ status: 400 });
    prisma.shiftRoster.findUnique.mockResolvedValueOnce({
      ...source,
      date: new Date('2026-11-22T00:00:00Z'),
    });
    await expect(service.getSwapCandidates('roster', actor)).rejects.toMatchObject({ status: 400 });
  });

  it('filters overlapping different shifts, including overnight assignments from yesterday', async () => {
    prisma.shiftRoster.findMany.mockResolvedValue([
      {
        groomUserId: target.id,
        date: new Date('2026-11-23T00:00:00Z'),
        shift: { ...shift, startTime: '22:00', endTime: '08:00', isOvernight: true },
      },
    ]);
    expect(await service.getSwapCandidates('roster', actor)).toEqual([]);
    await expect(
      service.requestSwap('roster', { targetGroomUserId: target.id, reason: 'Need help' }, actor),
    ).rejects.toMatchObject({ status: 409 });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('allows adjacent non-overlapping shifts and rechecks availability on submit', async () => {
    prisma.shiftRoster.findMany.mockResolvedValue([
      {
        groomUserId: target.id,
        date: source.date,
        shift: { ...shift, startTime: '13:00', endTime: '19:00' },
      },
    ]);
    expect(await service.getSwapCandidates('roster', actor)).toHaveLength(1);
    prisma.user.findMany.mockResolvedValue([]); // target became inactive
    await expect(
      service.requestSwap('roster', { targetGroomUserId: target.id, reason: 'Need help' }, actor),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('does not report success or notify managers if durable request storage fails', async () => {
    audit.record.mockRejectedValueOnce(new Error('storage failed'));
    await expect(
      service.requestSwap('roster', { targetGroomUserId: target.id, reason: 'Need help' }, actor),
    ).rejects.toThrow('storage failed');
    expect(notifications.notifyRoles).not.toHaveBeenCalled();
  });

  it.each(['', '   ', 'x'.repeat(1001)])(
    'rejects invalid reasons in DTO and service',
    async (reason) => {
      expect(
        await validate(
          plainToInstance(RequestShiftSwapDto, { targetGroomUserId: target.id, reason }),
        ),
      ).not.toHaveLength(0);
      await expect(
        service.requestSwap('roster', { targetGroomUserId: target.id, reason }, actor),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
});
