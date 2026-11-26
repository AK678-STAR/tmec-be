import { groomZoneIds, horsesInZones, rosterDay, zoneGroomIds } from './groom-zones';
import { ShiftRostersService } from './shift-rosters.service';

describe('lecturer notes #1-#3: groom works only in the zone on duty', () => {
  it('rosterDay uses the club date (UTC+7)', () => {
    // 2026-11-20 18:00 UTC = 2026-11-21 01:00 giờ CLB
    expect(rosterDay(new Date('2026-11-20T18:00:00Z')).toISOString()).toBe(
      '2026-11-21T00:00:00.000Z',
    );
  });

  it('groomZoneIds returns each zone of today once, and none without a shift', async () => {
    const prisma = {
      shiftRoster: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ zoneId: 'z-a' }, { zoneId: 'z-a' }, { zoneId: 'z-b' }])
          .mockResolvedValueOnce([]),
      },
    };
    expect(await groomZoneIds(prisma, 'groom-1')).toEqual(['z-a', 'z-b']);
    expect(prisma.shiftRoster.findMany).toHaveBeenCalledWith({
      where: { groomUserId: 'groom-1', date: rosterDay() },
      select: { zoneId: true },
    });
    expect(await groomZoneIds(prisma, 'groom-1')).toEqual([]);
    expect(horsesInZones([])).toEqual({
      stallAllocations: { some: { isActive: true, stall: { zoneId: { in: [] } } } },
    });
  });

  it('zoneGroomIds lists the grooms on duty in the horse zone, none without a zone', async () => {
    const prisma = {
      shiftRoster: {
        findMany: jest.fn().mockResolvedValue([
          { zoneId: 'z-a', groomUserId: 'g-1' },
          { zoneId: 'z-a', groomUserId: 'g-2' },
          { zoneId: 'z-a', groomUserId: 'g-1' },
        ]),
      },
    };
    expect(await zoneGroomIds(prisma, 'z-a')).toEqual(['g-1', 'g-2']);
    expect(await zoneGroomIds(prisma, null)).toEqual([]);
  });

  it('#2 overview: who is on duty per zone and shift, horses, task progress, open incidents', async () => {
    const prisma: any = {
      stallZone: {
        findMany: jest.fn().mockResolvedValue([{ id: 'z-a', code: 'A', name: 'Khu A' }]),
      },
      shiftCatalog: {
        findMany: jest.fn().mockResolvedValue([
          { id: 's-1', name: 'Ca sáng', startTime: '05:00', endTime: '13:00' },
          { id: 's-2', name: 'Ca chiều', startTime: '13:00', endTime: '21:00' },
        ]),
      },
      shiftRoster: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { zoneId: 'z-a', shiftId: 's-1', groom: { id: 'g-1', fullName: 'An' } },
          ]),
      },
      stall: { groupBy: jest.fn().mockResolvedValue([{ zoneId: 'z-a', _count: { _all: 4 } }]) },
      dailyCareTask: {
        groupBy: jest.fn().mockResolvedValue([
          { stallZoneId: 'z-a', shiftId: 's-1', isCompleted: true, _count: { _all: 3 } },
          { stallZoneId: 'z-a', shiftId: 's-1', isCompleted: false, _count: { _all: 2 } },
        ]),
      },
      incidentReport: {
        groupBy: jest.fn().mockResolvedValue([{ stallZoneId: 'z-a', _count: { _all: 1 } }]),
      },
    };
    const service = new ShiftRostersService(prisma, {} as any);
    const res = await service.overview('2026-11-21');
    expect(res.date).toBe('2026-11-21');
    expect(res.zones[0]).toMatchObject({ name: 'Khu A', horses: 4, openIncidents: 1 });
    expect(res.zones[0].shifts[0]).toMatchObject({
      grooms: [{ id: 'g-1', fullName: 'An' }],
      tasksDone: 3,
      tasksTotal: 5,
    });
    // Ca chiều chưa có ai trực -> FE tô đỏ.
    expect(res.zones[0].shifts[1]).toMatchObject({ grooms: [], tasksDone: 0, tasksTotal: 0 });
  });
});
