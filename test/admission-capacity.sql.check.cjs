// Temporary tables shadow public tables; this check never changes application records.
require('dotenv').config({ quiet: true });
require('ts-node').register({ transpileOnly: true });
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { lockAdmissionStall } = require('../src/horses/admission-capacity');
const target = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Only a local database may run this check.');
const db = new PrismaClient({ datasources: { db: { url: target.toString() } } });
(async () => {
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "StallZone" ("id" text, "isActive" boolean) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "Stall" ("id" text, "code" text, "zoneId" text, "status" text) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "StallAllocation" ("stallId" text, "isActive" boolean) ON COMMIT DROP');
      await tx.$executeRawUnsafe(`INSERT INTO "StallZone" VALUES ('zone', true), ('inactive', false)`);
      await tx.$executeRawUnsafe(`INSERT INTO "Stall" VALUES ('ready', 'A01', 'zone', 'AVAILABLE'), ('maintenance', 'A00', 'zone', 'MAINTENANCE'), ('disabled', 'A00', 'inactive', 'AVAILABLE')`);
      const chosen = await lockAdmissionStall(tx);
      assert.equal(chosen.id, 'ready');
      await tx.$executeRawUnsafe(`INSERT INTO "StallAllocation" VALUES ('ready', true)`);
      await assert.rejects(lockAdmissionStall(tx), error => error.getResponse().code === 'ADMISSION_NO_STALL');
    });
    console.log('PASS: PostgreSQL allocation query excludes occupied, maintenance and inactive-zone stalls.');
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
