import { strict as assert } from 'node:assert';
import { PrismaClient, SupplyCatalog } from '@prisma/client';
import { AuditService } from '../src/audit/audit.service';
import { CounterService } from '../src/audit/counter.service';
import { DailyTasksService } from '../src/daily-tasks/daily-tasks.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { FinancialService } from '../src/financial/financial.service';
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
const tasks = new DailyTasksService(
  db as any,
  audit,
  notify,
  new InventoryService(db as any, audit, notify),
);
const finance = new FinancialService(db as any, audit, notify, { emit: async () => [] } as any);
const RealDate = Date;
let clock = +new RealDate('2026-10-10T02:00Z');
const qaClock = new Proxy(RealDate, {
  construct(target, args) {
    return Reflect.construct(target, args.length ? args : [clock]);
  },
  get(target, key) {
    return key === 'now' ? () => clock : Reflect.get(target, key);
  },
});
async function main() {
  const run = RealDate.now().toString();
  const originalPolicy = await db.careBillingPolicy.findUnique({ where: { id: 'club' } });
  // A deterministic application clock tests month closure without changing the OS/DB clock.
  globalThis.Date = qaClock;
  try {
    const manager = await db.user.create({
      data: {
        email: `invoice-manager-${run}@example.test`,
        fullName: 'QA invoice manager',
        role: 'CLUB_MANAGER',
        status: 'ACTIVE',
      },
    });
    const owner = await db.user.create({
      data: {
        email: `invoice-owner-${run}@example.test`,
        fullName: 'QA invoice owner',
        role: 'HORSE_OWNER',
        status: 'ACTIVE',
      },
    });
    const vet = await db.user.create({
      data: {
        email: `invoice-vet-${run}@example.test`,
        fullName: 'QA Vet',
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
    const financialActor = { id: manager.id, name: manager.fullName, role: manager.role };
    // This isolated QA singleton is restored in finally; no operational configuration changes.
    await db.careBillingPolicy.deleteMany({ where: { id: 'club' } });
    await finance.configureCareBilling({ cutoverPeriod: '2026-10', examUnitPrice: 500000 }, actor);
    await assert.rejects(
      finance.configureCareBilling({ cutoverPeriod: '2026-11' }, actor),
      /cutover/,
    );
    await assert.rejects(
      finance.configureCareBilling({ examUnitPrice: 1 }, { ...actor, role: 'GROOM' }),
      /Manager permission/,
    );
    const zone = await db.stallZone.create({
      data: { code: `INV-${run}`, name: `Invoice QA ${run}`, rows: 1, cols: 1 },
    });
    const horse = await db.horse.create({
      data: {
        ownerId: owner.id,
        name: 'QA actual medical usage',
        breed: 'QA',
        color: 'Bay',
        gender: 'MALE',
        dob: new Date('2020-01-01'),
        microchipRfid: `${run}4`.padEnd(15, '7'),
      },
    });
    const record = await db.medicalRecord.create({
      data: {
        horseId: horse.id,
        veterinarianUserId: vet.id,
        status: 'OPEN',
        symptoms: 'QA',
        clinicalDiagnosis: 'QA',
        treatmentProtocol: 'QA',
        recordNumber: `BA-QA-${run}`,
      },
    });
    type Rx = {
      id: string;
      supplyId: string;
      dosage: string;
      unit: string;
      status: string;
      startDate: string;
      endDate: string;
      createdAt: string;
    };
    const supplies: Array<{ supply: SupplyCatalog; quantity: number; rx: Rx }> = [];
    const prescriptions: Rx[] = [];
    for (const [index, price, quantity] of [
      [0, 300000, 2],
      [1, 90000, 1],
      [2, 100000, 1],
    ]) {
      const supply = await db.supplyCatalog.create({
        data: {
          code: `INV-RX-${run}-${index}`,
          name: `QA invoice medicine ${run}-${index}`,
          category: 'MEDICINE',
          unit: 'PILL',
          unitPrice: price,
        },
      });
      await db.stockBalance.create({
        data: { zoneId: zone.id, supplyId: supply.id, quantity: 10 },
      });
      const rx = {
        id: `rx-${index}`,
        supplyId: supply.id,
        dosage: String(quantity),
        unit: 'tablets',
        status: 'ACTIVE',
        startDate: '2026-10-10',
        endDate: '2026-10-31',
        createdAt: new Date().toISOString(),
      };
      supplies.push({ supply, quantity, rx });
      prescriptions.push(rx);
    }
    await db.medicalRecord.update({
      where: { id: record.id },
      data: { prescriptions: JSON.stringify(prescriptions) },
    });
    for (const { supply, quantity, rx } of supplies) {
      const task = await db.dailyCareTask.create({
        data: {
          horseId: horse.id,
          date: new Date('2026-10-10T00:00Z'),
          stallZoneId: zone.id,
          taskType: 'MEDICATION',
          title: supply.name,
          itemsSnapshotJson: [
            {
              supplyId: supply.id,
              medicalRecordId: record.id,
              prescriptionId: rx.id,
              amount: quantity,
              unit: 'tablets',
            },
          ],
        },
      });
      await tasks.completeTask(task.id, {}, actor);
    }
    await Promise.all([finance.chargeExam(record.id, actor), finance.chargeExam(record.id, actor)]);
    assert.equal(
      await db.careCostEntry.count({ where: { horseId: horse.id, entryType: 'EXAM' } }),
      1,
    );
    const novemberEntry = await db.careCostEntry.create({
      data: {
        operationKey: `QA-${run}-nov`,
        horseId: horse.id,
        performedAt: new Date('2026-10-31T17:00:00Z'),
        quantity: 1,
        unit: 'EXAM',
        unitPriceSnapshot: 777,
        amount: 777,
        entryType: 'EXAM',
        actorId: manager.id,
        supplyName: 'Next month boundary',
      },
    });
    const beforeCutover = await db.careCostEntry.create({
      data: {
        operationKey: `QA-${run}-sep`,
        horseId: horse.id,
        performedAt: new Date('2026-09-30T16:59:59Z'),
        quantity: 1,
        unit: 'EXAM',
        unitPriceSnapshot: 888,
        amount: 888,
        entryType: 'EXAM',
        actorId: manager.id,
        supplyName: 'Before cutover',
      },
    });
    clock = +new RealDate('2026-11-01T02:00Z');
    const input = {
      horseId: horse.id,
      ownerId: owner.id,
      billingPeriod: '2026-10',
      status: 'SENT' as const,
    };
    const race = await Promise.allSettled([
      finance.create(input, financialActor),
      finance.create(input, financialActor),
    ]);
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      (race.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.getResponse()
        .code,
      'DUPLICATE_INVOICE_FOR_PERIOD',
    );
    const invoice = (race.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>)
      .value;
    assert.equal(invoice.billingMethod, 'ACTUAL_USAGE');
    assert.equal(invoice.medicalFee, 1290000);
    assert.equal(invoice.lineItems.length, 4);
    assert.equal(await db.careCostClaim.count({ where: { invoiceId: invoice.id } }), 4);
    assert.equal(
      await db.careCostClaim.count({
        where: { careCostEntryId: { in: [novemberEntry.id, beforeCutover.id] } },
      }),
      0,
    );
    await db.supplyCatalog.update({ where: { id: supplies[0].supply.id }, data: { unitPrice: 1 } });
    const detail = await finance.findOne(invoice.id, {
      id: owner.id,
      name: owner.fullName,
      role: 'HORSE_OWNER',
    });
    assert.equal(detail.medicalFee, 1290000);
    assert.equal(detail.lineItems.length, 4);
    await assert.rejects(
      finance.findOne(invoice.id, { id: vet.id, name: vet.fullName, role: 'HORSE_OWNER' }),
      /Bạn chỉ được xem/,
    );
    await assert.rejects(
      finance.update(invoice.id, { medicalFee: 1 }, financialActor),
      /immutable snapshots/,
    );
    await finance.changeStatus(invoice.id, 'CANCELLED', financialActor);
    assert.equal(await db.careCostClaim.count({ where: { invoiceId: invoice.id } }), 0);
    assert.equal(await db.invoiceLineItem.count({ where: { invoiceId: invoice.id } }), 4);
    const replacement = await finance.create(input, financialActor);
    assert.equal(replacement.medicalFee, 1290000);
    assert.equal(replacement.lineItems.length, 4);
    assert.equal(await db.careCostClaim.count({ where: { invoiceId: replacement.id } }), 4);
    const statement = await finance.getOwnerStatementBreakdown(owner.id, '2026-10');
    assert.equal(statement.summary.totalMedical, 1290000);
    console.log(
      'PASS: real checklist -> stock/usage -> configured exam charge -> concurrent invoice creation; 1,290,000 VND without package; month/cutover boundaries, frozen prices, Owner IDOR, read-only fees, cancellation/reissue claims and immutable appendix. App clock fixture only; no external mail.',
    );
  } finally {
    globalThis.Date = RealDate;
    await db.careBillingPolicy.deleteMany({ where: { id: 'club' } });
    if (originalPolicy) await db.careBillingPolicy.create({ data: originalPolicy });
  }
}
main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
