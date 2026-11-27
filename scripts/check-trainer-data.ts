import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const trainer = await prisma.user.findUnique({ where: { email: 'trainer@gmail.com' } });
  if (!trainer) return;
  const plans = await prisma.trainingPlan.findMany({
    where: { trainerUserId: trainer.id, status: { in: ['ACTIVE', 'DRAFT'] } },
    include: { horse: true }
  });
  console.log(`Plans of trainer@gmail.com (${trainer.fullName}):`);
  plans.forEach(p => console.log(`- Plan: ${p.planCode || p.id.slice(0, 8)} | Status: ${p.status} | Horse: ${p.horse.name} (${p.horse.horseCode})`));
  await prisma.$disconnect();
}

run().catch(console.error);
