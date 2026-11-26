import { evaluateWorkoutAvailability } from './workout-availability.service';

describe('shared workout availability', () => {
  const track = { id: 'track', surface: 'TURF', capacity: 6, isActive: true };
  const draft = {
    horseId: 'mine',
    trainerUserId: 'trainer',
    scheduledDate: new Date('2026-11-24T00:00:00Z'),
    workoutType: 'TROT',
    intensity: 'LIGHT',
    trackSurface: 'TURF',
    trackId: 'track',
  };
  const row = (i: number, change: Record<string, unknown> = {}) => ({
    id: `w${i}`,
    horseId: `h${i}`,
    trackId: 'track',
    trackSurface: 'TURF',
    scheduledDate: draft.scheduledDate,
    workoutType: 'TROT',
    intensity: 'LIGHT',
    status: 'SCHEDULED',
    trainingPlan: { trainerUserId: `t${i}` },
    ...change,
  });
  it('accepts the sixth horse and rejects the seventh', () => {
    expect(
      evaluateWorkoutAvailability(
        draft,
        track,
        Array.from({ length: 5 }, (_, i) => row(i)),
      ).availableCapacity,
    ).toBe(1);
    expect(() =>
      evaluateWorkoutAvailability(
        draft,
        track,
        Array.from({ length: 6 }, (_, i) => row(i)),
      ),
    ).toThrow('Sân tập đã đạt sức chứa');
  });
  it('counts the peak rather than summing disjoint groups across a long workout', () => {
    const start = new Date('2026-11-24T00:00:00Z');
    const rows = Array.from({ length: 10 }, (_, i) =>
      row(i, { workoutType: 'WALK', scheduledDate: new Date(+start + (i < 5 ? 0 : 45 * 60000)) }),
    );
    expect(() =>
      evaluateWorkoutAvailability(
        { ...draft, workoutType: 'TRIAL', scheduledDate: new Date(+start - 10 * 60000) },
        track,
        rows,
      ),
    ).not.toThrow();
  });
  it('keeps the existing 15 minute trainer transition buffer', () => {
    const other = row(1, { trainingPlan: { trainerUserId: 'trainer' } });
    expect(() =>
      evaluateWorkoutAvailability(
        { ...draft, horseId: 'second', scheduledDate: new Date(+draft.scheduledDate + 60 * 60000) },
        track,
        [other],
      ),
    ).toThrow('HLV đã có lịch');
    expect(() =>
      evaluateWorkoutAvailability(
        { ...draft, horseId: 'second', scheduledDate: new Date(+draft.scheduledDate + 75 * 60000) },
        track,
        [other],
      ),
    ).not.toThrow();
  });
  it('does not consume capacity for cancelled or blocked workouts', () => {
    expect(() =>
      evaluateWorkoutAvailability(
        draft,
        track,
        Array.from({ length: 10 }, (_, i) => row(i, { status: i % 2 ? 'CANCELLED' : 'BLOCKED' })),
      ),
    ).not.toThrow();
  });
  it('enforces biological rest in either scheduling direction', () => {
    for (const sign of [-1, 1])
      expect(() =>
        evaluateWorkoutAvailability(draft, track, [
          row(1, {
            horseId: 'mine',
            workoutType: 'BREEZE',
            scheduledDate: new Date(+draft.scheduledDate + sign * 47 * 3600000),
            status: 'COMPLETED',
          }),
        ]),
      ).toThrow('WORKOUT_REST_REQUIRED');
    expect(() =>
      evaluateWorkoutAvailability(draft, track, [
        row(1, {
          horseId: 'mine',
          workoutType: 'TROT',
          scheduledDate: new Date(+draft.scheduledDate - 24 * 3600000),
          status: 'COMPLETED',
        }),
      ]),
    ).not.toThrow();
  });
  it('does not ignore an overlapping legacy workout with unknown physical track', () => {
    expect(() => evaluateWorkoutAvailability(draft, track, [row(1, { trackId: null })])).toThrow(
      'TRACK_MAPPING_REQUIRED',
    );
  });
  it('rejects an inactive or mismatched track and excludes the edited workout itself', () => {
    expect(() => evaluateWorkoutAvailability(draft, { ...track, isActive: false }, [])).toThrow();
    expect(() => evaluateWorkoutAvailability(draft, { ...track, surface: 'DIRT' }, [])).toThrow();
    expect(() =>
      evaluateWorkoutAvailability(draft, track, [row(1, { horseId: 'mine' })], 'w1'),
    ).not.toThrow();
  });
});
