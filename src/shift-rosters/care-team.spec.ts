import { ShiftRostersService } from './shift-rosters.service';

describe('trainer care-team scope', () => {
  const actor = { userId: 'trainer', role: 'HEAD_TRAINER' } as any;
  it('returns an empty team without querying the club roster when trainer has no active horses', async () => {
    const db: any = {
      trainingPlan: { findMany: jest.fn().mockResolvedValue([]) },
      shiftRoster: { findMany: jest.fn() },
      medicalRecord: { findMany: jest.fn() },
    };
    const result = await (new ShiftRostersService(db, {} as any) as any).careTeam(
      { startDate: '2026-11-23', endDate: '2026-11-29', scope: 'mine' },
      actor,
    );
    expect(result).toEqual({ groomRosters: [], responsibleVeterinarians: [] });
    expect(db.shiftRoster.findMany).not.toHaveBeenCalled();
  });
  it('groups responsible vets by own horses without fabricating duty shifts', async () => {
    const db: any = {
      trainingPlan: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              horseId: 'h',
              horse: {
                id: 'h',
                name: 'Horse',
                stallAllocations: [{ stall: { zoneId: 'own-zone' } }],
              },
            },
          ]),
      },
      shiftRoster: { findMany: jest.fn().mockResolvedValue([{ id: 'groom-roster' }]) },
      medicalRecord: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { horse: { id: 'h', name: 'Horse' }, veterinarian: { id: 'vet', fullName: 'Vet' } },
          ]),
      },
    };
    const result = await (new ShiftRostersService(db, {} as any) as any).careTeam(
      { startDate: '2026-11-23', endDate: '2026-11-29', scope: 'mine' },
      actor,
    );
    expect(result.responsibleVeterinarians).toEqual([
      { id: 'vet', fullName: 'Vet', horses: [{ id: 'h', name: 'Horse' }] },
    ]);
    expect(result.veterinarianRosters).toBeUndefined();
    expect(db.shiftRoster.findMany.mock.calls[0][0].where.zoneId).toEqual({ in: ['own-zone'] });
    expect(db.trainingPlan.findMany.mock.calls[0][0].where.trainerUserId).toBe(actor.userId);
  });
});
