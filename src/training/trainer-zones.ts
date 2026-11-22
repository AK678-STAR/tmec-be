import { HttpStatus } from '@nestjs/common';
import { PlanStatus, Prisma } from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';

export const LIVE_TRAINER_PLAN_STATUSES = [PlanStatus.DRAFT, PlanStatus.ACTIVE];

export async function assertTrainerZone(
  tx: Prisma.TransactionClient,
  horseId: string,
  zoneId: string | null | undefined,
  trainerIds: string[],
) {
  if (!zoneId || trainerIds.length === 0) return;
  const conflict = await tx.stallAllocation.findFirst({
    where: {
      isActive: true,
      horseId: { not: horseId },
      stall: { zoneId: { not: zoneId } },
      horse: {
        deletedAt: null,
        trainingPlans: {
          some: { trainerUserId: { in: trainerIds }, status: { in: LIVE_TRAINER_PLAN_STATUSES } },
        },
      },
    },
    select: { id: true },
  });
  if (conflict) {
    throw apiError(
      HttpStatus.CONFLICT,
      'TRAINER_ZONE_MISMATCH',
      'Một HLV chỉ được phụ trách ngựa trong cùng một khu chuồng.',
    );
  }
}
