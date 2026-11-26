import { strict as assert } from 'node:assert';
import { PrismaClient, Prisma } from '@prisma/client';
import { DailyTasksService } from '../src/daily-tasks/daily-tasks.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { AuditService } from '../src/audit/audit.service';
import { CounterService } from '../src/audit/counter.service';
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
const inventory = new InventoryService(db as any, audit, notify);
const tasks = new DailyTasksService(db as any, audit, notify, inventory);
async function main() {
  const run = Date.now().toString();
  const manager = await db.user.create({
    data: {
      email: `ledger-manager-${run}@example.test`,
      fullName: 'QA ledger manager',
      role: 'CLUB_MANAGER',
      status: 'ACTIVE',
    },
  });
  const vet = await db.user.create({
    data: {
      email: `ledger-vet-${run}@example.test`,
      fullName: 'QA prescribing Vet',
      role: 'VETERINARIAN',
      status: 'ACTIVE',
    },
  });
  const actor = {
    userId: manager.id,
    role: manager.role,
    fullName: manager.fullName,
    email: manager.email,
  };
  const zone = await db.stallZone.create({
    data: { code: `LEDGER-${run}`, name: `Ledger QA ${run}`, rows: 1, cols: 1 },
  });
  const supply = await db.supplyCatalog.create({
    data: {
      code: `RX-${run}`,
      name: `QA Rx ${run}`,
      category: 'MEDICINE',
      unit: 'PILL',
      unitPrice: 90000,
    },
  });
  const balance = await db.stockBalance.create({
    data: { zoneId: zone.id, supplyId: supply.id, quantity: 1 },
  });
  const today = new Date(+new Date() + 7 * 3600000).toISOString().slice(0, 10);
  async function fixture(index: number, amount: string) {
    const horse = await db.horse.create({
      data: {
        name: `Ledger QA horse ${index}`,
        breed: 'QA',
        color: 'Bay',
        gender: 'MALE',
        dob: new Date('2020-01-01'),
        microchipRfid: `${run}${index}`.padEnd(15, '8'),
      },
    });
    const rx = {
      id: `rx-${index}`,
      supplyId: supply.id,
      medicationName: supply.name,
      dosage: amount,
      unit: 'tablets',
      status: 'ACTIVE',
      startDate: today,
      endDate: today,
      createdAt: new Date().toISOString(),
    };
    const record = await db.medicalRecord.create({
      data: {
        horseId: horse.id,
        veterinarianUserId: vet.id,
        status: 'OPEN',
        symptoms: 'QA',
        clinicalDiagnosis: 'QA',
        treatmentProtocol: 'QA',
        recordNumber: `QA-${run}-${index}`,
        prescriptions: JSON.stringify([rx]),
      },
    });
    const task = await db.dailyCareTask.create({
      data: {
        horseId: horse.id,
        date: new Date(`${today}T00:00Z`),
        stallZoneId: zone.id,
        taskType: 'MEDICATION',
        title: 'QA medication',
        itemsSnapshotJson: [
          {
            supplyId: supply.id,
            medicalRecordId: record.id,
            prescriptionId: rx.id,
            amount,
            unit: 'tablets',
          },
        ],
      },
    });
    return { horse, record, task };
  }
  const first = await fixture(0, '0.125');
  await Promise.all([
    tasks.completeTask(first.task.id, {}, actor),
    tasks.completeTask(first.task.id, {}, actor),
  ]);
  assert.equal(
    (await db.stockBalance.findUniqueOrThrow({ where: { id: balance.id } })).quantity.toString(),
    '0.875',
  );
  const consumption = await db.careCostEntry.findFirstOrThrow({
    where: { sourceTaskId: first.task.id },
  });
  assert.equal(consumption.amount.toString(), '11250');
  assert.equal(consumption.unitPriceSnapshot.toString(), '90000');
  assert.equal(await db.careCostEntry.count({ where: { sourceTaskId: first.task.id } }), 1);
  await db.supplyCatalog.update({ where: { id: supply.id }, data: { unitPrice: 180000 } });
  assert.equal(
    (await db.careCostEntry.findUniqueOrThrow({ where: { id: consumption.id } })).amount.toString(),
    '11250',
  );
  await assert.rejects(tasks.uncompleteTask(first.task.id, actor), /Only undo an accidental click/);
  await Promise.all([
    tasks.uncompleteTask(first.task.id, actor, undefined, { administrationNotPerformed: true }),
    tasks.uncompleteTask(first.task.id, actor, undefined, { administrationNotPerformed: true }),
  ]);
  assert.equal(await db.careCostEntry.count({ where: { reversesEntryId: consumption.id } }), 1);
  assert.equal(
    (await db.stockBalance.findUniqueOrThrow({ where: { id: balance.id } })).quantity.toString(),
    '1',
  );
  await tasks.completeTask(first.task.id, {}, actor);
  assert.equal(
    (await db.dailyCareTask.findUniqueOrThrow({ where: { id: first.task.id } })).completionVersion,
    2,
  );
  assert.equal(
    (
      await db.careCostEntry.findFirstOrThrow({
        where: { sourceTaskId: first.task.id, completionVersion: 2 },
      })
    ).amount.toString(),
    '22500',
  );
  const [a, b] = await Promise.all([fixture(1, '1'), fixture(2, '1')]);
  await db.stockBalance.update({ where: { id: balance.id }, data: { quantity: 1 } });
  const race = await Promise.allSettled([
    tasks.completeTask(a.task.id, {}, actor),
    tasks.completeTask(b.task.id, {}, actor),
  ]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (race.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.getResponse().code,
    'INSUFFICIENT_STOCK',
  );
  const loser = race[0].status === 'rejected' ? a : b;
  assert.equal(
    (await db.dailyCareTask.findUniqueOrThrow({ where: { id: loser.task.id } })).isCompleted,
    false,
  );
  assert.equal(await db.careCostEntry.count({ where: { sourceTaskId: loser.task.id } }), 0);
  assert.equal(
    (await db.stockBalance.findUniqueOrThrow({ where: { id: balance.id } })).quantity.toString(),
    '0',
  );
  const failure = await fixture(3, '1');
  await db.stockBalance.update({ where: { id: balance.id }, data: { quantity: 1 } });
  assert.match(failure.task.id, /^[0-9a-f-]+$/);
  await db.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION qa_ledger_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."sourceTaskId" = '${failure.task.id}' THEN RAISE EXCEPTION 'QA injected ledger failure'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER qa_ledger_failure BEFORE INSERT ON "CareCostEntry" FOR EACH ROW EXECUTE FUNCTION qa_ledger_failure()',
  );
  try {
    await assert.rejects(tasks.completeTask(failure.task.id, {}, actor));
    assert.equal(
      (await db.dailyCareTask.findUniqueOrThrow({ where: { id: failure.task.id } })).isCompleted,
      false,
    );
    assert.equal(
      (await db.stockBalance.findUniqueOrThrow({ where: { id: balance.id } })).quantity.toString(),
      '1',
    );
    assert.equal(await db.careCostEntry.count({ where: { sourceTaskId: failure.task.id } }), 0);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER qa_ledger_failure ON "CareCostEntry"');
    await db.$executeRawUnsafe('DROP FUNCTION qa_ledger_failure()');
  }
  await tasks.uncompleteTask(first.task.id, actor, undefined, { administrationNotPerformed: true });
  await db.medicalRecord.update({ where: { id: first.record.id }, data: { prescriptions: '[]' } });
  await tasks.generateDailyTasksForDate(new Date(`${today}T00:00Z`), undefined, first.horse.id);
  assert.ok(
    (await db.dailyCareTask.findUniqueOrThrow({ where: { id: first.task.id } })).cancelledAt,
  );
  await assert.rejects(tasks.completeTask(first.task.id, {}, actor), /withdrawn/);
  assert.equal(await db.careCostEntry.count({ where: { sourceTaskId: first.task.id } }), 4);
  await assert.rejects(
    db.careCostEntry.update({
      where: { id: consumption.id },
      data: { amount: new Prisma.Decimal(0) },
    }),
  );
  assert.equal(
    (await db.careCostEntry.findUniqueOrThrow({ where: { id: consumption.id } })).amount.toString(),
    '11250',
  );
  console.log(
    'PASS: real PostgreSQL task double-submit, fractional stock and cost snapshot, catalog price changes, acknowledged undo/double undo, recompletion versions, cross-horse stock race/rollback and append-only DB enforcement.',
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
