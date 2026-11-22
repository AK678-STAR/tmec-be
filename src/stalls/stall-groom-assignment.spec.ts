import { StallsService } from './stalls.service';
import { onDutyGrooms, shiftInterval } from '../shift-rosters/groom-zones';

describe('allocation Groom assignment', () => {
  it('includes the previous overnight shift but excludes the exact end instant', async () => {
    const date = new Date('2026-11-22T00:00:00Z');
    const shift = { startTime: '22:00', endTime: '06:00', isOvernight: true };
    const row = {
      date,
      shift,
      zoneId: 'z',
      groomUserId: 'g',
      groom: { id: 'g', fullName: 'Groom' },
    };
    const db: any = { shiftRoster: { findMany: jest.fn().mockResolvedValue([row]) } };
    expect((await onDutyGrooms(db, 'z', new Date('2026-11-22T22:59:00Z'))).length).toBe(1);
    expect((await onDutyGrooms(db, 'z', new Date('2026-11-22T23:00:00Z'))).length).toBe(0);
    expect(shiftInterval(date, shift).end).toBe(new Date('2026-11-22T23:00:00Z').getTime());
  });
  it('rejects non-managers before reading allocation data', async () => {
    const db: any = { stallAllocation: { findUnique: jest.fn() } };
    const service = new StallsService(db, {} as any);
    await expect(
      (service as any).assignAllocationGroom('allocation', 'groom', { role: 'GROOM' }),
    ).rejects.toThrow();
    expect(db.stallAllocation.findUnique).not.toHaveBeenCalled();
  });
  it('rejects a returned allocation without changing task ownership', async () => {
    const db: any = {
      $queryRaw: jest.fn(),
      stallAllocation: {
        findUnique: jest.fn().mockResolvedValue({ id: 'a', isActive: false }),
        update: jest.fn(),
      },
    };
    db.$transaction = jest.fn((fn) => fn(db));
    await expect(
      (new StallsService(db, {} as any) as any).assignAllocationGroom('a', 'g', {
        role: 'CLUB_MANAGER',
      }),
    ).rejects.toThrow();
    expect(db.stallAllocation.update).not.toHaveBeenCalled();
  });
});
