import { assertPrimaryGroom, assertReceivingGroom, transferPendingCare } from './groom-care.rules';
import { rosterDay } from '../shift-rosters/groom-zones';

describe('care assignment boundaries', () => {
  const at = new Date('2026-11-24T03:00:00Z');
  const roster = {
    date: rosterDay(at),
    shiftId: 'day',
    groomUserId: 'receiver',
    dutyTypes: ['HORSE_CARE'],
    shift: { startTime: '08:00', endTime: '16:00', isOvernight: false },
  };
  let tx: any;
  beforeEach(() => {
    tx = {
      user: { findUnique: jest.fn().mockResolvedValue({ role: 'GROOM', status: 'ACTIVE' }) },
      stallAllocation: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      shiftRoster: { findMany: jest.fn().mockResolvedValue([roster]) },
      dailyCareTask: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    };
  });
  it('allows an off-duty primary while requiring an on-duty receiver', async () => {
    await expect(assertPrimaryGroom(tx, 'zone', 'primary')).resolves.toBeDefined();
    await expect(assertReceivingGroom(tx, 'zone', 'receiver', 'horse', at)).resolves.toEqual(
      roster,
    );
    await expect(assertReceivingGroom(tx, 'zone', 'primary', 'horse', at)).rejects.toMatchObject({
      response: { code: 'GROOM_NOT_ON_DUTY' },
    });
  });
  it('blocks a seventh active stall and cross-zone primary assignment', async () => {
    tx.stallAllocation.count.mockResolvedValue(6);
    await expect(assertPrimaryGroom(tx, 'zone', 'g')).rejects.toMatchObject({
      response: { code: 'GROOM_MAX_STALLS_EXCEEDED' },
    });
    tx.stallAllocation.findFirst.mockResolvedValue({ id: 'other' });
    await expect(assertPrimaryGroom(tx, 'zone', 'g')).rejects.toMatchObject({
      response: { code: 'GROOM_MULTI_ZONE_FORBIDDEN' },
    });
  });
  it('rejects cleaning-only, off-hours and overloaded receiving staff', async () => {
    tx.shiftRoster.findMany.mockResolvedValue([{ ...roster, dutyTypes: ['CLEANING'] }]);
    await expect(assertReceivingGroom(tx, 'zone', 'receiver', 'horse', at)).rejects.toBeDefined();
    tx.shiftRoster.findMany.mockResolvedValue([roster]);
    await expect(
      assertReceivingGroom(tx, 'zone', 'receiver', 'horse', new Date('2026-11-24T12:00:00Z')),
    ).rejects.toBeDefined();
    tx.dailyCareTask.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ horseId: String(i) })),
    );
    await expect(assertReceivingGroom(tx, 'zone', 'receiver', 'horse', at)).rejects.toMatchObject({
      response: { code: 'GROOM_SHIFT_CAPACITY_EXCEEDED' },
    });
  });
  it('hands over only unfinished tasks in the selected shift', async () => {
    await transferPendingCare(tx, 'horse', 'zone', 'stall', 'receiver', 'day');
    expect(tx.dailyCareTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          horseId: 'horse',
          shiftId: 'day',
          isCompleted: false,
          cancelledAt: null,
        }),
      }),
    );
  });
});
