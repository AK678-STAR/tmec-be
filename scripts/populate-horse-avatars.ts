import { PrismaClient } from '@prisma/client';

/** Fill missing portraits only; retain user-uploaded avatars and all other horse data. */
export async function populateHorseAvatars(prisma: PrismaClient) {
  return prisma.$transaction(
    Array.from({ length: 19 }, (_, index) => {
      const number = index + 1;
      return prisma.horse.updateMany({
        where: {
          horseCode: `HR-${String(number).padStart(6, '0')}`,
          OR: [{ avatarUrl: null }, { avatarUrl: '' }],
        },
        data: { avatarUrl: `/images/horses/horse-${String(number).padStart(2, '0')}.jpg` },
      });
    }),
  );
}

if (require.main === module) {
  const prisma = new PrismaClient();
  populateHorseAvatars(prisma)
    .then((results) => {
      console.log(
        `Updated ${results.reduce((total, result) => total + result.count, 0)} horse avatars.`,
      );
    })
    .catch((error: unknown) => {
      console.error('Horse avatar synchronization failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
