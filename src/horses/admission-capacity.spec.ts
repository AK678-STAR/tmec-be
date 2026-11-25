import { assertAdmissionCapacity, lockAdmissionStall } from './admission-capacity';
import { assertStaffAvailable, workInterval } from './staff-work.rules';

describe('Admission capacity and shared appointments', () => {
  it('blocks inspection with no usable stall', async () => {
    const tx = { stall: { count: jest.fn().mockResolvedValue(0) } };
    await expect(assertAdmissionCapacity(tx as never)).rejects.toMatchObject({
      response: { code: 'ADMISSION_NO_STALL' },
    });
    expect(tx.stall.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ allocations: { none: { isActive: true } } }),
      }),
    );
  });
  it('blocks the second approval when the last available stall is locked', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'last-stall' }])
        .mockResolvedValueOnce([]),
    };
    await expect(lockAdmissionStall(tx as never)).resolves.toEqual({ id: 'last-stall' });
    await expect(lockAdmissionStall(tx as never)).rejects.toMatchObject({
      response: { code: 'ADMISSION_NO_STALL' },
    });
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE OF s SKIP LOCKED');
  });
  it('rejects invalid or reversed intervals', () => {
    expect(() => workInterval('bad', 'bad')).toThrow();
    expect(() => workInterval('2026-12-01T09:00:00Z', '2026-12-01T08:00:00Z')).toThrow();
  });
  it('rejects a shared appointment that overlaps an existing participant appointment', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      staffWorkItem: { findFirst: jest.fn().mockResolvedValue(null) },
      horseAdmissionRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            appointmentDate: new Date('2026-12-01T08:00:00Z'),
            appointmentEndDate: new Date('2026-12-01T09:00:00Z'),
          },
        ]),
      },
    };
    await expect(
      assertStaffAvailable(
        tx as never,
        ['vet', 'manager'],
        new Date('2026-12-01T08:30:00Z'),
        new Date('2026-12-01T09:30:00Z'),
      ),
    ).rejects.toMatchObject({ response: { code: 'STAFF_SCHEDULE_CONFLICT' } });
    expect(tx.$queryRaw).toHaveBeenCalled();
  });
  it('allows back-to-back appointments and ignores the appointment being rescheduled', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      staffWorkItem: { findFirst: jest.fn().mockResolvedValue(null) },
      horseAdmissionRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            appointmentDate: new Date('2026-12-01T08:00:00Z'),
            appointmentEndDate: new Date('2026-12-01T09:00:00Z'),
          },
        ]),
      },
    };
    await expect(
      assertStaffAvailable(
        tx as never,
        ['vet'],
        new Date('2026-12-01T09:00:00Z'),
        new Date('2026-12-01T10:00:00Z'),
        { admissionId: 'current' },
      ),
    ).resolves.toBeUndefined();
    expect(tx.horseAdmissionRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 'current' } }) }),
    );
  });
});
