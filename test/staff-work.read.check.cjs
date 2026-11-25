require('dotenv').config({ quiet: true });
require('ts-node').register({ transpileOnly: true });
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { StaffWorkService } = require('../src/horses/staff-work.service');
const { HorsesService } = require('../src/horses/horses.service');
const target = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Only a local database may run this check.');
const db = new PrismaClient({ datasources: { db: { url: target.toString() } } });
(async () => {
  try {
    const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const service = new StaffWorkService(db, { record: () => assert.fail('Read-only check must not write audit records') });
    const result = await service.overview({ from: day, to: day }, { userId: 'read-only-check', role: 'CLUB_MANAGER' });
    assert.equal(result.summary.total, result.events.length);
    assert.equal(new Set(result.events.map(e => e.id)).size, result.events.length);
    assert.ok(result.members.every(m => ['CLUB_MANAGER', 'VETERINARIAN', 'GROOM'].includes(m.role)));
    assert.ok(result.events.every(e => Number.isFinite(Date.parse(e.startsAt)) && Number.isFinite(Date.parse(e.endsAt))));
    console.log(`PASS: real local staff overview queries; ${result.events.length} unique events, valid dates, no trainer records.`);
    const assigned = await db.horseAdmissionRecord.findFirst({ where: { veterinarianUserId: { not: null } }, select: { id: true, veterinarianUserId: true } });
    if (assigned) {
      const admissions = new HorsesService(db, {}, {}, {}, {}, {});
      const actor = { userId: assigned.veterinarianUserId, role: 'VETERINARIAN' };
      const own = await admissions.listAdmissions({ page: 1, pageSize: 100 }, actor);
      assert.ok(own.data.every(record => record.veterinarianUserId === actor.userId));
      assert.equal(own.total, await db.horseAdmissionRecord.count({ where: { veterinarianUserId: actor.userId } }));
      assert.equal((await admissions.getAdmissionHistory(assigned.id, actor)).admission.id, assigned.id);
      const foreign = await db.horseAdmissionRecord.findFirst({ where: { OR: [{ veterinarianUserId: null }, { veterinarianUserId: { not: actor.userId } }] }, select: { id: true } });
      if (foreign) await assert.rejects(admissions.getAdmissionHistory(foreign.id, actor), error => error.getResponse().code === 'ADMISSION_NOT_FOUND');
      console.log(`PASS: assigned veterinarian list/detail on real local data; ${own.total} assigned records; foreign detail denied: ${Boolean(foreign)}.`);
    } else {
      console.log('SKIP: no assigned admission exists locally; assigned-access cases are covered by unit/browser fixtures.');
    }
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
