import { MedicalLocksService } from '../src/medical/medical-locks.service';
import { MedicalAccessService } from '../src/medical/medical-access.service';
import { SimulatorRealtimeService } from '../src/simulator/simulator-realtime.service';
import { TournamentsService } from '../src/tournaments/tournaments.service';
import { strict as assert } from 'node:assert';
import { PrismaClient, Role, InvoiceStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
import { BusinessMailService } from '../src/business-mail/business-mail.service';
import { BusinessMailScheduler } from '../src/business-mail/business-mail.scheduler';
import { NotificationsService } from '../src/notifications/notifications.service';
import { AuditService } from '../src/audit/audit.service';
import { CounterService } from '../src/audit/counter.service';
import { ComplaintsService } from '../src/complaints/complaints.service';
import { FinancialService } from '../src/financial/financial.service';
import { StallsService } from '../src/stalls/stalls.service';
import { DailyTasksService } from '../src/daily-tasks/daily-tasks.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { CurrentUserPayload } from '../src/common/decorators/current-user.decorator';

// This integration check is intentionally restricted to the disposable QA services.
const url = process.env.DATABASE_URL ?? '';
assert.equal(new URL(url).port, '55439');
assert.equal(new URL(url).pathname, '/equiflow_qa');
const db = new PrismaClient({ datasourceUrl: url });
const prisma = db as unknown as PrismaService;
const config = new ConfigService({
  EMAIL_PROVIDER: 'smtp',
  MAIL_HOST: '127.0.0.1',
  MAIL_PORT: '11025',
  EMAIL_FROM: 'EquiFlow QA <noreply@example.test>',
});
const mail = new BusinessMailService(prisma, new MailService(config));
const notifications = new NotificationsService(prisma, mail);
const audit = new AuditService(prisma, new CounterService(prisma), notifications);
const financial = new FinancialService(prisma, audit, notifications, mail);
const scheduler = new BusinessMailScheduler(prisma, mail);
const complaints = new ComplaintsService(prisma, audit, mail);
const run = Date.now().toString();
const report: string[] = [];
async function check(name: string, work: () => Promise<void>) {
  await work();
  report.push(name);
}

async function main() {
  const users = await Promise.all(
    [
      ['manager', Role.CLUB_MANAGER],
      ['owner', Role.HORSE_OWNER],
      ['other-owner', Role.HORSE_OWNER],
      ['source-groom', Role.GROOM],
      ['target-groom', Role.GROOM],
      ['vet', Role.VETERINARIAN],
      ['trainer', Role.HEAD_TRAINER],
    ].map(([name, role]) =>
      db.user.create({
        data: {
          email: `${run}-${name}@example.test`,
          fullName: String(name),
          role: role as Role,
          status: 'ACTIVE',
        },
      }),
    ),
  );
  const [manager, owner, otherOwner, sourceGroom, targetGroom, vet, trainer] = users;
  const actor = (user: typeof manager): CurrentUserPayload => ({
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  });
  const financialActor = { id: manager.id, name: manager.fullName, role: manager.role };
  const horse = await db.horse.create({
    data: {
      name: 'QA Silver',
      microchipRfid: run.padEnd(15, '1').slice(0, 15),
      breed: 'QA',
      color: 'Bay',
      dob: new Date('2020-01-01'),
      gender: 'MALE',
      ownerId: owner.id,
    },
  });
  const baseInvoice = {
    horseId: horse.id,
    ownerId: owner.id,
    boardingFee: 1000000,
    netAmount: 1000000,
  };
  const invoice = await db.financialInvoice.create({
    data: {
      ...baseInvoice,
      billingPeriod: '2026-01',
      dueAt: new Date(Date.now() + 2 * 86400000),
      status: 'DRAFT',
    },
  });

  await check('Invoice issued -> owner only; owner transfer report does not settle', async () => {
    await financial.changeStatus(invoice.id, InvoiceStatus.SENT, financialActor);
    await financial.payInvoice(
      invoice.id,
      { transactionRef: 'QA-TRANSFER' },
      { id: owner.id, name: owner.fullName, role: owner.role },
    );
    assert.equal(
      (await db.financialInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status,
      'SENT',
    );
    const sent = await db.businessMailing.findMany({
      where: { refId: invoice.id, eventCode: 'INVOICE_ISSUED' },
    });
    assert.deepEqual(
      sent.map((row) => row.userId),
      [owner.id],
    );
    assert(sent.every((row) => row.accepted));
  });

  await check(
    'Scheduler two sweeps -> no duplicate due reminder; paid invoice stops reminders',
    async () => {
      await scheduler.remind();
      const count = await db.businessMailing.count();
      await scheduler.remind();
      assert.equal(await db.businessMailing.count(), count);
      assert.equal(
        await db.businessMailing.count({
          where: { refId: invoice.id, eventCode: 'DUE_SOON', accepted: true },
        }),
        1,
      );
      await financial.payInvoice(invoice.id, {}, financialActor);
      assert.equal(
        (await db.financialInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status,
        'PAID',
      );
      const after = await db.businessMailing.count();
      await scheduler.remind();
      assert.equal(await db.businessMailing.count(), after);
    },
  );

  await check('Concurrent emit -> one accepted mail reservation', async () => {
    const event = {
      eventCode: 'QA_CONCURRENT',
      recipients: [
        {
          userId: owner.id,
          body: { subject: 'QA concurrency', text: 'Only one message', refId: horse.id },
        },
      ],
    };
    await Promise.all([mail.emit(event), mail.emit(event)]);
    assert.equal(
      await db.businessMailing.count({
        where: { eventCode: event.eventCode, refId: horse.id, accepted: true },
      }),
      1,
    );
  });

  await check('Failure and adjustment notices remain distinct from payment receipt', async () => {
    const pending = await db.financialInvoice.create({
      data: { ...baseInvoice, billingPeriod: '2026-02', status: 'SENT' },
    });
    await financial.recordPaymentFailure(pending.id, { txRef: 'QA-FAILED' }, financialActor);
    const failed = await db.businessMailing.findFirstOrThrow({
      where: { refId: pending.id, eventCode: 'PAYMENT_FAILED' },
    });
    assert(!failed.bodyText.toLowerCase().includes('đã thanh toán'));
    assert(failed.accepted);
    const draft = await db.financialInvoice.create({
      data: { ...baseInvoice, billingPeriod: '2026-03', status: 'DRAFT' },
    });
    await financial.update(
      draft.id,
      { prizeCredit: 100000, notes: 'QA adjustment evidence' },
      financialActor,
    );
    const adjusted = await db.businessMailing.findFirstOrThrow({
      where: { refId: draft.id, eventCode: 'REFUND_NOTIFIED' },
    });
    assert(adjusted.bodyText.includes('QA adjustment evidence'));
    assert(adjusted.accepted);
  });

  await check(
    'Complaint -> independent review -> confirmed violation with separate receipts',
    async () => {
      const complaint = await complaints.create(
        {
          subjectUserId: targetGroom.id,
          reason: 'QA missed stable cleaning task',
          evidenceUrls: ['https://example.test/evidence'],
        },
        actor(sourceGroom),
      );
      assert.equal(
        await db.businessMailing.count({
          where: { refId: complaint.id, eventCode: 'VIOLATION_CONFIRMED' },
        }),
        0,
      );
      await assert.rejects(
        complaints.review(
          complaint.id,
          { reviewNote: 'Unapproved self review attempt' },
          actor(sourceGroom),
        ),
      );
      await complaints.review(
        complaint.id,
        { reviewNote: 'QA approved summary without reporter identity' },
        actor(vet),
      );
      await complaints.confirm(
        complaint.id,
        {
          conclusion: 'QA finding confirmed by independent handler',
          regulation: 'QA care standard',
          measures: 'QA coaching and follow-up',
        },
        actor(vet),
      );
      const messages = await db.businessMailing.findMany({ where: { refId: complaint.id } });
      assert(messages.every((row) => row.accepted));
      assert(
        !messages
          .filter((row) => row.userId === targetGroom.id)
          .some((row) => row.bodyText.includes(sourceGroom.email)),
      );
      assert(
        messages.some(
          (row) => row.eventCode === 'VIOLATION_CONFIRMED' && row.userId === targetGroom.id,
        ),
      );
      assert(
        !messages.some(
          (row) => row.eventCode === 'COMPLAINT_FILED' && row.userId === targetGroom.id,
        ),
      );
    },
  );

  const zones = await Promise.all(
    ['A', 'B'].map((code) =>
      db.stallZone.create({ data: { code: run + code, name: run + 'Zone ' + code } }),
    ),
  );
  const stalls = await Promise.all(
    zones.map((zone, index) =>
      db.stall.create({
        data: {
          code: run + 'Stall' + index,
          zone: zone.name,
          zoneId: zone.id,
          row: 1,
          col: 1,
          status: index ? 'AVAILABLE' : 'OCCUPIED',
        },
      }),
    ),
  );
  const shift = await db.shiftCatalog.create({
    data: {
      code: run,
      name: run + ' shift',
      startTime: '00:00',
      endTime: '00:00',
      isOvernight: true,
    },
  });
  const date = new Date(
    new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10) + 'T00:00:00Z',
  );
  await db.shiftRoster.createMany({
    data: [
      { date, zoneId: zones[0].id, shiftId: shift.id, groomUserId: sourceGroom.id },
      { date, zoneId: zones[1].id, shiftId: shift.id, groomUserId: targetGroom.id },
    ],
  });
  const allocation = await db.stallAllocation.create({
    data: {
      horseId: horse.id,
      stallId: stalls[0].id,
      assignedGroomUserId: sourceGroom.id,
      startDate: new Date(),
    },
  });
  const inventory = new InventoryService(prisma, audit, notifications);
  const tasks = new DailyTasksService(prisma, audit, notifications, inventory);
  const stables = new StallsService(prisma, audit, tasks, notifications);
  await check(
    'Stall transfer -> source/target Groom and owner; completed handover receipt',
    async () => {
      const moved = await stables.transferHorse(
        allocation.id,
        { newStallId: stalls[1].id, notes: 'QA handover' },
        actor(manager),
      );
      const moveMails = await db.businessMailing.findMany({
        where: { refId: moved.id, eventCode: 'STALL_MOVED' },
      });
      for (const user of [owner, sourceGroom, targetGroom])
        assert(moveMails.some((row) => row.userId === user.id && row.accepted));
      assert(!moveMails.some((row) => row.userId === otherOwner.id));
      await tasks.completeTask(
        moved.handoverTaskId,
        { notes: 'QA checked horse and destination' },
        actor(sourceGroom),
      );
      assert(
        (
          await db.businessMailing.findMany({
            where: { refId: moved.handoverTaskId, eventCode: 'STALL_HANDOVER_DONE' },
          })
        ).some((row) => row.accepted),
      );
    },
  );

  await check('Medical lock events use scoped recipients and report release state', async () => {
    const locks = new MedicalLocksService(
      prisma,
      audit,
      notifications,
      new MedicalAccessService(prisma),
      { emit: () => undefined } as unknown as SimulatorRealtimeService,
      tasks,
    );
    const locked = await locks.createMedicalLock(actor(vet), {
      horseId: horse.id,
      lockReason: 'QA tendon recovery safety restriction',
      expectedRestDays: 3,
      appliedMedicalStatus: 'INJURED',
    });
    assert(
      (
        await db.businessMailing.findMany({ where: { refId: locked.id, milestone: 'placed' } })
      ).some((row) => row.accepted),
    );
    await locks.releaseMedicalLock(locked.id, actor(vet), {
      unlockReason: 'QA clinical recovery verified by vet',
      fitnessConfirmed: true,
      newHorseStatus: 'RESTING',
    });
    assert.equal(
      (await db.horse.findUniqueOrThrow({ where: { id: horse.id } })).isMedicalLocked,
      false,
    );
    const released = await db.businessMailing.findMany({
      where: { refId: locked.id, milestone: 'released' },
    });
    assert(released.some((row) => row.accepted));
    assert(!released.some((row) => row.userId === otherOwner.id));
  });

  await check('Prize email is emitted only after official result settlement', async () => {
    const race = await db.tournament.create({
      data: {
        name: run + ' QA Cup',
        raceDate: new Date(Date.now() - 86400000),
        registrationDeadline: new Date(Date.now() - 2 * 86400000),
        location: 'QA',
        distanceMeters: 1000,
        status: 'CLOSED_REGISTRATION',
      },
    });
    const registration = await db.tournamentRegistration.create({
      data: {
        tournamentId: race.id,
        horseId: horse.id,
        registeredByTrainerId: trainer.id,
        status: 'CONFIRMED',
      },
    });
    const racing = new TournamentsService(prisma, audit, notifications);
    await racing.recordResults(
      race.id,
      {
        results: [
          {
            registrationId: registration.id,
            finalRank: 1,
            finishTimeSeconds: 60,
            prizeMoneyWon: 1000000,
          },
        ],
        lockResults: false,
      },
      financialActor,
    );
    assert.equal(
      await db.businessMailing.count({ where: { eventCode: 'PRIZE_WON', userId: owner.id } }),
      0,
    );
    await racing.lockResults(race.id, financialActor);
    const result = await db.tournamentResult.findUniqueOrThrow({
      where: { registrationId: registration.id },
    });
    assert(result.settledAt);
    assert(
      (
        await db.businessMailing.findMany({ where: { eventCode: 'PRIZE_WON', refId: result.id } })
      ).some((row) => row.userId === owner.id && row.accepted),
    );
  });

  const logs = await db.businessMailing.findMany({
    where: { userId: { in: users.map((user) => user.id) } },
  });
  assert(!logs.some((row) => row.userId === otherOwner.id));
  const inbox = (await (await fetch('http://127.0.0.1:18025/api/v1/messages')).json()) as {
    total: number;
  };
  assert(inbox.total >= logs.filter((row) => row.accepted).length);
  console.log(
    JSON.stringify(
      {
        checks: report,
        accepted: logs.filter((row) => row.accepted).length,
        mailpitTotal: inbox.total,
      },
      null,
      2,
    ),
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
