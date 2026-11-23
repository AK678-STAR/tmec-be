import { strict as assert } from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { IncidentsService } from '../src/incidents/incidents.service';
import { AuditService } from '../src/audit/audit.service';
import { CounterService } from '../src/audit/counter.service';
import { MedicalRecordsService } from '../src/medical/medical-records.service';
import { StallsService } from '../src/stalls/stalls.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { rosterDay } from '../src/shift-rosters/groom-zones';

const target = new URL(process.env.DATABASE_URL ?? '');
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55439');
assert.equal(target.pathname, '/equiflow_qa');
const db = new PrismaClient({ datasourceUrl: target.href });
const notifications = { notifyHorse: async () => true, notifyUsers: async () => true } as any;
const audit = new AuditService(db as any, new CounterService(db as any), notifications);
const incidents = new IncidentsService(db as any, audit, notifications);
async function main() {
  const stamp = `${Date.now()}`;
  const user = await db.user.create({
    data: {
      email: `xuansinh-${stamp}@example.test`,
      fullName: 'QA Groom',
      role: 'GROOM',
      status: 'ACTIVE',
    },
  });
  const actor = { userId: user.id, fullName: user.fullName, email: user.email, role: user.role };
  const horse = await db.horse.create({
    data: {
      name: 'QA Xuansinh',
      breed: 'QA',
      color: 'Bay',
      gender: 'MALE',
      dob: new Date('2020-01-01'),
      microchipRfid: stamp.padEnd(15, '7'),
    },
  });
  const dto = {
    horseId: horse.id,
    severity: 'SEVERE' as const,
    description: 'QA severe observation: temporary safety protection',
  };
  const [a, b] = await Promise.all([incidents.create(dto, actor), incidents.create(dto, actor)]);
  assert.notEqual(a.incidentNumber, b.incidentNumber);
  assert.equal(await db.medicalLock.count({ where: { horseId: horse.id, isLocked: true } }), 2);
  const state = await db.horse.findUniqueOrThrow({ where: { id: horse.id } });
  assert.equal(state.isMedicalLocked, true);
  assert.equal(state.status, 'UNDER_OBSERVATION');
  const count = await db.incidentReport.count({ where: { horseId: horse.id } });
  const failingDb = new Proxy(db, {
    get(client, key) {
      if (key === '$transaction')
        return (callback: any) =>
          client.$transaction((tx) =>
            callback(
              new Proxy(tx, {
                get(transaction, field) {
                  if (field === 'medicalLock')
                    return {
                      ...transaction.medicalLock,
                      create: async () => {
                        throw new Error('Injected storage failure');
                      },
                    };
                  return Reflect.get(transaction, field);
                },
              }),
            ),
          );
      const value = Reflect.get(client, key);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
  await assert.rejects(
    new IncidentsService(failingDb as any, audit, notifications).create(dto, actor),
    /Injected storage failure/,
  );
  assert.equal(await db.incidentReport.count({ where: { horseId: horse.id } }), count);
  const packet = { horse: { horse_id: horse.id }, incident: { kind: 'FRACTURE' } };
  const key = `qa-source-${stamp}`;
  const [first, retry] = await Promise.all([
    incidents.createFromSimulator(key, packet, actor),
    incidents.createFromSimulator(key, packet, actor),
  ]);
  assert.equal(first.id, retry.id);
  assert.equal(await db.medicalLock.count({ where: { sourceIncidentId: first.id } }), 1);
  const vetUser = await db.user.create({
    data: {
      email: `xuansinh-vet-${stamp}@example.test`,
      fullName: 'QA Vet',
      role: 'VETERINARIAN',
      status: 'ACTIVE',
    },
  });
  const vet = {
    userId: vetUser.id,
    fullName: vetUser.fullName,
    email: vetUser.email,
    role: vetUser.role,
  };
  const record = await db.medicalRecord.create({
    data: {
      horseId: horse.id,
      veterinarianUserId: vetUser.id,
      status: 'DRAFT',
      severity: 'SEVERE',
      clinicalDiagnosis: 'QA recovery',
      symptoms: 'QA symptoms',
      treatmentProtocol: 'QA treatment',
      recommendedHorseStatus: 'INJURED',
    },
  });
  await db.incidentReport.update({
    where: { id: a.id },
    data: { medicalRecordId: record.id, status: 'UNDER_REVIEW' },
  });
  await db.medicalLock.update({
    where: { sourceIncidentId: a.id },
    data: { medicalRecordId: record.id },
  });
  const records = new MedicalRecordsService(
    db as any,
    audit,
    { assertVet: () => undefined } as any,
    {} as any,
    notifications,
  );
  await records.finalizeMedicalRecord(record.id, vet, { proposeMedicalLock: true });
  assert.equal(
    (await db.medicalRecord.findUniqueOrThrow({ where: { id: record.id } })).status,
    'OPEN',
  );
  const closed = await records.closeMedicalRecord(record.id, vet, {
    conclusion: 'QA verified clinical recovery',
    treatmentResult: 'RECOVERED',
    recoveryConfirmed: true,
    postTreatmentStatus: 'RESTING',
  });
  assert.equal(closed.isMedicalLocked, true);
  assert.equal(
    (await db.medicalLock.findUniqueOrThrow({ where: { sourceIncidentId: a.id } })).isLocked,
    false,
  );
  assert.equal(
    (await db.medicalLock.findUniqueOrThrow({ where: { sourceIncidentId: b.id } })).isLocked,
    true,
  );
  assert.equal(closed.horseStatus, 'INJURED');
  const merged = await incidents.resolve(
    a.id,
    { medicalRecordId: record.id, duplicateIncidentIds: [b.id, first.id], recoveryConfirmed: true },
    vet,
  );
  assert.equal(merged.mergedCount, 2);
  assert.equal(
    (await db.incidentReport.findUniqueOrThrow({ where: { id: b.id } })).parentIncidentId,
    a.id,
  );
  assert.equal(
    (await db.horse.findUniqueOrThrow({ where: { id: horse.id } })).isMedicalLocked,
    false,
  );
  const failingHorse = await db.horse.create({
    data: {
      name: 'QA atomic finalize',
      breed: 'QA',
      color: 'Bay',
      gender: 'MALE',
      dob: new Date('2020-01-01'),
      microchipRfid: `f${stamp}`.padEnd(15, '8'),
    },
  });
  const failingRecord = await db.medicalRecord.create({
    data: {
      horseId: failingHorse.id,
      veterinarianUserId: vetUser.id,
      status: 'DRAFT',
      severity: 'SEVERE',
      clinicalDiagnosis: 'QA rollback',
      symptoms: 'QA',
      treatmentProtocol: 'QA',
    },
  });
  const finalizeDb = new Proxy(db, {
    get(client, key) {
      if (key === '$transaction')
        return (callback: any) =>
          client.$transaction((tx) =>
            callback(
              new Proxy(tx, {
                get(t, k) {
                  if (k === 'medicalRecord')
                    return {
                      ...t.medicalRecord,
                      update: async () => {
                        throw new Error('Injected finalize failure');
                      },
                    };
                  return Reflect.get(t, k);
                },
              }),
            ),
          );
      const value = Reflect.get(client, key);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
  await assert.rejects(
    new MedicalRecordsService(
      finalizeDb as any,
      audit,
      { assertVet: () => undefined } as any,
      {} as any,
      notifications,
    ).finalizeMedicalRecord(failingRecord.id, vet, {}),
  );
  assert.equal(await db.medicalLock.count({ where: { horseId: failingHorse.id } }), 0);
  assert.equal(
    (await db.medicalRecord.findUniqueOrThrow({ where: { id: failingRecord.id } })).status,
    'DRAFT',
  );
  console.log(
    'PASS: atomic finalize binds source protection; recovered close preserves other locks; selected merge releases only assessed sources; injected finalize failure rolls back lock and record.',
  );
  const manager = await db.user.create({
    data: {
      email: `xuansinh-manager-${stamp}@example.test`,
      fullName: 'QA Manager',
      role: 'CLUB_MANAGER',
      status: 'ACTIVE',
    },
  });
  const replacement = await db.user.create({
    data: {
      email: `xuansinh-replacement-${stamp}@example.test`,
      fullName: 'QA replacement',
      role: 'GROOM',
      status: 'ACTIVE',
    },
  });
  const zone = await db.stallZone.create({
    data: { code: `XS-${stamp}`, name: `QA zone ${stamp}` },
  });
  const stall = await db.stall.create({
    data: {
      code: `XS-${stamp}`,
      zone: zone.name,
      zoneId: zone.id,
      row: 1,
      col: 1,
      status: 'OCCUPIED',
    },
  });
  const shift = await db.shiftCatalog.create({
    data: {
      code: `XS-${stamp}`,
      name: `QA full day ${stamp}`,
      startTime: '00:00',
      endTime: '00:00',
      isOvernight: true,
    },
  });
  await db.shiftRoster.create({
    data: { date: rosterDay(), shiftId: shift.id, zoneId: zone.id, groomUserId: replacement.id },
  });
  const allocation = await db.stallAllocation.create({
    data: { horseId: horse.id, stallId: stall.id, assignedGroomUserId: user.id },
  });
  const completed = await db.dailyCareTask.create({
    data: {
      horseId: horse.id,
      stallId: stall.id,
      stallZoneId: zone.id,
      shiftId: shift.id,
      date: rosterDay(),
      taskType: 'FEEDING',
      title: 'QA already fed',
      mealType: 'MORNING',
      scheduledTime: '06:00',
      isCompleted: true,
      completedById: user.id,
      assignedGroomUserId: user.id,
    },
  });
  const pending = await db.dailyCareTask.create({
    data: {
      horseId: horse.id,
      stallId: stall.id,
      stallZoneId: zone.id,
      shiftId: shift.id,
      date: rosterDay(),
      taskType: 'FEEDING',
      title: 'QA pending meal',
      mealType: 'NOON',
      scheduledTime: '11:30',
      assignedGroomUserId: user.id,
    },
  });
  const stables = new StallsService(db as any, audit, undefined, notifications);
  const managerActor = {
    userId: manager.id,
    fullName: manager.fullName,
    email: manager.email,
    role: manager.role,
  };
  const candidates = await stables.groomCandidates(allocation.id, managerActor);
  assert.ok(candidates.some((row) => row.id === replacement.id));
  await assert.rejects(stables.assignAllocationGroom(allocation.id, vet.userId, managerActor));
  await stables.assignAllocationGroom(allocation.id, replacement.id, managerActor);
  assert.equal(
    (await db.dailyCareTask.findUniqueOrThrow({ where: { id: pending.id } })).assignedGroomUserId,
    replacement.id,
  );
  assert.equal(
    (await db.dailyCareTask.findUniqueOrThrow({ where: { id: completed.id } })).completedById,
    user.id,
  );
  await db.stallAllocation.update({
    where: { id: allocation.id },
    data: { isActive: false, endDate: new Date() },
  });
  await assert.rejects(stables.assignAllocationGroom(allocation.id, replacement.id, managerActor));
  const realNotifications = new NotificationsService(db as any);
  const notificationPath = new StallsService(db as any, audit, undefined, realNotifications);
  const samples: number[] = [];
  for (let i = 0; i < 20; i++) {
    const row = await db.stallAllocation.create({ data: { horseId: horse.id, stallId: stall.id } });
    const started = performance.now();
    assert.equal(await (notificationPath as any).alertGroomAssignment(row.id), true);
    assert.ok(
      await db.notification.findFirst({
        where: { userId: manager.id, dedupeKey: `allocation-groom:${row.id}:${manager.id}` },
      }),
    );
    samples.push(performance.now() - started);
    await db.stallAllocation.update({
      where: { id: row.id },
      data: { isActive: false, endDate: new Date() },
    });
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
  assert.ok(p95 < 1000, `Local post-commit notification p95 ${p95}ms exceeded 1000ms`);
  console.log(
    `PASS: local real notification persistence path, 20 samples, post-commit p95=${p95.toFixed(1)}ms (no SMTP or browser polling/network latency).`,
  );
  console.log(
    'PASS: allocation selects actual on-duty Groom, rejects Vet/stale allocation, reassigns pending work and preserves completed care history.',
  );
  console.log(
    'PASS: real PostgreSQL concurrent reports use distinct codes; severe protection commits; injected failure rolls back incident; concurrent simulator retry creates one incident/lock.',
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
