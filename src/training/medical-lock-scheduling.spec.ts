import { WorkoutsService } from './workouts.service';

it('blocks even a light new workout while a medical safety lock is active', async () => {
  const db: any = {
    horse: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'h', status: 'UNDER_OBSERVATION', isMedicalLocked: true }),
    },
  };
  const service = new WorkoutsService(db, {} as any, {} as any, {} as any);
  await expect(
    (service as any).validateAdmission(
      db,
      { status: 'ACTIVE', horseId: 'h' },
      { workoutType: 'WALK', intensity: 'LIGHT' },
    ),
  ).rejects.toMatchObject({ response: { code: 'MEDICAL_LOCK_ACTIVE' } });
});
