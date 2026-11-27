import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const hs = await prisma.horse.findMany({
    where: { horseCode: { in: ['HR-DEMO-A07', 'HR-DEMO-A08'] } },
    select: {
      id: true,
      horseCode: true,
      name: true,
      stallAllocations: true,
      trainingPlans: true,
      workoutSessions: true,
      medicalRecords: true,
      injuryLogs: true,
      medicalLocks: true,
      financialInvoices: true,
      handoverRequests: true,
    },
  });
  console.log(JSON.stringify(hs, null, 2));
}

main().finally(() => prisma.$disconnect());
