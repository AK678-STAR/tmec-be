import {
  rankWorkoutSlots,
  WorkoutSlotSuggestionsService,
} from './workout-slot-suggestions.service';

describe('workout slot recommendations', () => {
  const track = { id: 'track', surface: 'TURF', capacity: 6, isActive: true };
  const input = {
    horseId: 'horse',
    trainerUserId: 'trainer',
    workoutType: 'CANTER',
    intensity: 'MEDIUM',
    trackSurface: 'TURF',
  };
  const from = '2026-11-24',
    to = '2026-11-25';
  it('ranks morning first and keeps the entire session in the preferred window', () => {
    const slots = rankWorkoutSlots(input, [track], [], from, to, new Date('2026-11-23T00:00Z'));
    expect(slots).toHaveLength(3);
    expect(slots[0].startAt).toBe('2026-11-23T23:00:00.000Z');
    for (const slot of slots) expect(new Date(slot.endAt).getUTCHours()).toBeLessThan(2);
  });
  it('applies symmetric rest against a future booking and never relaxes it to fill three cards', () => {
    const rows = [
      {
        id: 'future',
        horseId: 'horse',
        trackId: 'track',
        trackSurface: 'TURF',
        workoutType: 'TRIAL',
        intensity: 'HEAVY',
        status: 'SCHEDULED',
        scheduledDate: new Date('2026-11-25T00:00Z'),
        trainingPlan: { trainerUserId: 'trainer' },
      },
    ];
    expect(
      rankWorkoutSlots(input, [track], rows, from, to, new Date('2026-11-23T00:00Z')),
    ).toHaveLength(0);
  });
  it('respects capacity and edited-workout exclusion', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `w${i}`,
      horseId: `h${i}`,
      trackId: 'track',
      trackSurface: 'TURF',
      workoutType: 'WALK',
      intensity: 'LIGHT',
      status: 'SCHEDULED',
      scheduledDate: new Date('2026-11-23T23:00Z'),
      trainingPlan: { trainerUserId: `t${i}` },
    }));
    expect(
      rankWorkoutSlots(input, [track], rows, from, from, new Date('2026-11-23T00:00Z'))[0].startAt,
    ).not.toBe('2026-11-23T23:00:00.000Z');
    expect(
      rankWorkoutSlots(input, [track], rows, from, from, new Date('2026-11-23T00:00Z'), 'w0')[0]
        .startAt,
    ).toBe('2026-11-23T23:00:00.000Z');
  });
  it('loads one snapshot for all candidates and rejects foreign plans before loading occupancy', async () => {
    const tx = {
      trainingPlan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p',
          trainerUserId: 'trainer',
          horseId: 'horse',
          status: 'ACTIVE',
          startDate: new Date('2026-11-24'),
          endDate: new Date('2026-11-30'),
          phases: [],
          horse: { status: 'ACTIVE', medicalLocks: [], stallAllocations: [] },
          trainer: { role: 'HEAD_TRAINER', status: 'ACTIVE' },
        }),
      },
      trainingTrack: { findMany: jest.fn().mockResolvedValue([track]) },
      workoutSession: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const db = { $transaction: jest.fn((fn) => fn(tx)) };
    const service = new WorkoutSlotSuggestionsService(db as any);
    const user = { userId: 'trainer', role: 'HEAD_TRAINER' } as any;
    const dto = {
      from,
      to,
      workoutType: 'CANTER',
      intensity: 'MEDIUM',
      trackSurface: 'TURF',
      phaseId: 'phase',
      distanceMeters: 1200,
    };
    jest.useFakeTimers().setSystemTime(new Date('2026-11-23T00:00Z'));
    try {
      expect((await service.suggest('p', dto, user)).slots).toHaveLength(3);
      expect(tx.workoutSession.findMany).toHaveBeenCalledTimes(1);
      expect(tx.trainingTrack.findMany).toHaveBeenCalledTimes(1);
      await expect(service.suggest('p', dto, { ...user, userId: 'another' })).rejects.toMatchObject(
        { status: 403 },
      );
      expect(tx.workoutSession.findMany).toHaveBeenCalledTimes(1);
      tx.trainingPlan.findUnique.mockResolvedValueOnce({
        ...(await tx.trainingPlan.findUnique()),
        horse: { status: 'ACTIVE', isMedicalLocked: true, medicalLocks: [], stallAllocations: [] },
      });
      expect((await service.suggest('p', dto, user)).slots).toHaveLength(0);
      expect(tx.workoutSession.findMany).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
