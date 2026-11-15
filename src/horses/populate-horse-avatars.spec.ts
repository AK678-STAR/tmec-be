import type { PrismaClient } from '@prisma/client';
import { populateHorseAvatars } from '../../scripts/populate-horse-avatars';

describe('populateHorseAvatars', () => {
  it('updates only missing avatars for the 19 known codes in one transaction', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = jest.fn((operations: Promise<{ count: number }>[]) =>
      Promise.all(operations),
    );
    const prisma = { horse: { updateMany }, $transaction: transaction };
    const results = await populateHorseAvatars(prisma as unknown as PrismaClient);
    expect(results).toHaveLength(19);
    expect(transaction).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 19; index++) {
      expect(updateMany).toHaveBeenNthCalledWith(index + 1, {
        where: {
          horseCode: `HR-${String(index + 1).padStart(6, '0')}`,
          OR: [{ avatarUrl: null }, { avatarUrl: '' }],
        },
        data: { avatarUrl: `/images/horses/horse-${String(index + 1).padStart(2, '0')}.jpg` },
      });
    }
  });
});
