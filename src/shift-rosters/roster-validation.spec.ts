import { assertRosterSlot } from './roster-validation';
describe('roster interval boundaries', () => {
  let tx: any;
  const date = new Date('2027-01-04T00:00:00Z');
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2027-01-01T00:00:00Z'));
    tx = {
      shiftCatalog: {
        findUnique: jest.fn().mockResolvedValue({
          isActive: true,
          startTime: '06:00',
          endTime: '14:00',
          isOvernight: false,
        }),
      },
      stallZone: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
      user: { count: jest.fn().mockResolvedValue(1) },
      shiftRoster: { findMany: jest.fn().mockResolvedValue([]) },
    };
  });
  afterEach(() => jest.useRealTimers());
  it('detects a previous-night shift with a different shift ID', async () => {
    tx.shiftRoster.findMany.mockResolvedValue([
      {
        date: new Date('2027-01-03T00:00:00Z'),
        shiftId: 'night',
        zoneId: 'other',
        shift: { startTime: '22:00', endTime: '07:00', isOvernight: true },
      },
    ]);
    await expect(assertRosterSlot(tx, date, 'day', 'zone', ['groom'])).rejects.toMatchObject({
      response: { code: 'GROOM_SHIFT_OVERLAP' },
    });
  });
  it('allows touching intervals but rejects ended shifts', async () => {
    tx.shiftRoster.findMany.mockResolvedValue([
      {
        date,
        shiftId: 'evening',
        zoneId: 'other',
        shift: { startTime: '14:00', endTime: '22:00', isOvernight: false },
      },
    ]);
    await expect(assertRosterSlot(tx, date, 'day', 'zone', ['groom'])).resolves.toBeUndefined();
    jest.setSystemTime(new Date('2027-01-05T00:00:00Z'));
    await expect(assertRosterSlot(tx, date, 'day', 'zone', ['groom'])).rejects.toMatchObject({
      response: { code: 'ROSTER_SHIFT_ENDED' },
    });
  });
});
