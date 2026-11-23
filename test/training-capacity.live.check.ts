import { strict as assert } from 'node:assert';
import { PrismaClient, User, Horse, TrainingPlan } from '@prisma/client';
import { WorkoutsService } from '../src/training/workouts.service';
import { TracksService } from '../src/training/tracks.service';
import { AuditService } from '../src/audit/audit.service';
import { CounterService } from '../src/audit/counter.service';
import { addDays, clubDate, startOfClubDay } from '../src/training/training-rules';

const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55439');
assert.equal(url.pathname, '/equiflow_qa');
const db = new PrismaClient({ datasourceUrl: url.href });
const notify = {
  notifyRoles: async () => true,
  notifyHorse: async () => true,
  notifyUsers: async () => true,
} as any;
const audit = new AuditService(db as any, new CounterService(db as any), notify);
const workouts = new WorkoutsService(db as any, audit, notify, {} as any);
const tracks = new TracksService(db as any, audit);
async function main() {
  const run = Date.now().toString();
  const manager = await db.user.create({
    data: {
      email: `capacity-manager-${run}@example.test`,
      fullName: 'QA manager',
      role: 'CLUB_MANAGER',
      status: 'ACTIVE',
    },
  });
  const actor = {
    userId: manager.id,
    fullName: manager.fullName,
    email: manager.email,
    role: manager.role,
  };
  const a = await tracks.save(
    null,
    { code: `QA-${run}-A`, name: 'QA track A', surface: 'TURF', capacity: 6 },
    actor,
  );
  const b = await tracks.save(
    null,
    { code: `QA-${run}-B`, name: 'QA track B', surface: 'TURF', capacity: 6 },
    actor,
  );
  const c = await tracks.save(
    null,
    { code: `QA-${run}-C`, name: 'QA track C', surface: 'TURF', capacity: 6 },
    actor,
  );
  const day = addDays(startOfClubDay(new Date()), 2);
  const scheduledDate = new Date(+day + 7 * 3600000).toISOString();
  const end = addDays(day, 14);
  const fixtures: { trainer: User; horse: Horse; plan: TrainingPlan }[] = [];
  for (let i = 0; i < 9; i++) {
    const trainer =
      i === 8
        ? fixtures[7].trainer
        : await db.user.create({
            data: {
              email: `capacity-trainer-${run}-${i}@example.test`,
              fullName: `QA trainer ${i}`,
              role: 'HEAD_TRAINER',
              status: 'ACTIVE',
            },
          });
    const horse = await db.horse.create({
      data: {
        name: `QA capacity ${i}`,
        breed: 'QA',
        color: 'Bay',
        gender: 'MALE',
        dob: new Date('2020-01-01'),
        microchipRfid: `${run}${i}`.padEnd(15, '9'),
      },
    });
    const plan = await db.trainingPlan.create({
      data: {
        horseId: horse.id,
        trainerUserId: trainer.id,
        phaseName: 'QA capacity',
        status: 'ACTIVE',
        startDate: day,
        endDate: end,
        phases: [
          {
            id: 'phase',
            name: 'Base',
            type: 'BASE',
            startDate: clubDate(day),
            endDate: clubDate(end),
            sessionsPerWeek: 5,
            maxWeeklyDistance: 10000,
            surface: 'TURF',
          },
        ],
      },
    });
    fixtures.push({ trainer, horse, plan });
  }
  const input = (trackId: string) => ({
    scheduledDate,
    phaseId: 'phase',
    workoutType: 'CANTER',
    intensity: 'MEDIUM',
    distanceMeters: 1200,
    repetitions: 1,
    trackSurface: 'TURF',
    trackId,
  });
  const schedule = (i: number, trackId: string) => {
    const f = fixtures[i];
    return workouts.createWorkout(f.plan.id, input(trackId), {
      userId: f.trainer.id,
      fullName: f.trainer.fullName,
      email: f.trainer.email,
      role: f.trainer.role,
    });
  };
  for (let i = 0; i < 5; i++) await schedule(i, a.id);
  const results = await Promise.allSettled([schedule(5, a.id), schedule(6, a.id)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason.getResponse().code, 'TRACK_CAPACITY_EXCEEDED');
  assert.equal(await db.workoutSession.count({ where: { trackId: a.id, status: 'SCHEDULED' } }), 6);
  const simultaneous = await Promise.allSettled([schedule(7, b.id), schedule(8, c.id)]);
  assert.equal(simultaneous.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (
      simultaneous.find((r) => r.status === 'rejected') as PromiseRejectedResult
    ).reason.getResponse().code,
    'TRAINER_BUSY_SLOT',
  );
  await assert.rejects(tracks.save(a.id, { capacity: 5 }, actor), /TRACK_HAS_FUTURE_WORKOUTS/);
  const loser = results[0].status === 'rejected' ? fixtures[5] : fixtures[6];
  const legacy = await db.workoutSession.create({
    data: {
      trainingPlanId: loser.plan.id,
      horseId: loser.horse.id,
      scheduledDate: new Date(scheduledDate),
      phaseId: 'phase',
      distanceMeters: 1200,
      workoutType: 'CANTER',
      intensity: 'MEDIUM',
      trackSurface: 'TURF',
      status: 'SCHEDULED',
    },
  });
  await assert.rejects(tracks.mapLegacy(a.id, [legacy.id], actor));
  assert.equal(
    (await db.workoutSession.findUniqueOrThrow({ where: { id: legacy.id } })).trackId,
    null,
  );
  await tracks.mapLegacy(c.id, [legacy.id], actor);
  assert.equal(
    (await db.workoutSession.findUniqueOrThrow({ where: { id: legacy.id } })).trackId,
    c.id,
  );
  console.log(
    'PASS: real concurrent service requests admit exactly one final track place, admit one workout per trainer across tracks, reject safety catalog edits and roll back overloaded legacy mappings.',
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
