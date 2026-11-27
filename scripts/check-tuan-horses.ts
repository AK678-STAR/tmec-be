import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tuan = await prisma.user.findUnique({
    where: { email: 'trainer@gmail.com' },
  });
  if (!tuan) {
    console.log('Khong tim thay HLV Tuan');
    return;
  }

  const horses = await prisma.horse.findMany({
    where: { assignedTrainerId: tuan.id },
    include: {
      trainingPlans: {
        where: { status: { in: ['ACTIVE', 'DRAFT'] } },
      },
      stallAllocations: {
        where: { isActive: true },
        include: { stall: true },
      },
    },
  });

  console.log(`TOTAL HORSES ASSIGNED TO TUAN (${tuan.email}): ${horses.length}`);
  for (const h of horses) {
    console.log({
      id: h.id,
      horseCode: h.horseCode,
      name: h.name,
      stall: h.stallAllocations[0]?.stall?.code,
      plansCount: h.trainingPlans.length,
      plans: h.trainingPlans.map(p => `${p.planCode} (${p.status})`),
      status: h.status,
      isMedicalLocked: h.isMedicalLocked,
    });
  }
}

main().finally(() => prisma.$disconnect());
