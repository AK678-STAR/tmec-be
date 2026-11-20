import { PlanStatus } from '@prisma/client';
import { TrainerReviewsService } from './trainer-reviews.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

const owner: CurrentUserPayload = { userId: 'own-1', email: 'o@x', role: UserRole.HORSE_OWNER, fullName: 'O' };
const trainer: CurrentUserPayload = { userId: 'ht-1', email: 't@x', role: UserRole.HEAD_TRAINER, fullName: 'T' };
const manager: CurrentUserPayload = { userId: 'cm-1', email: 'm@x', role: UserRole.CLUB_MANAGER, fullName: 'M' };

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e: any) {
    return e.getResponse?.().code ?? e.message;
  }
}

describe('TrainerReviewsService', () => {
  const prisma = {
    trainingPlan: { findUnique: jest.fn(), groupBy: jest.fn() },
    trainerReview: { upsert: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const service = new TrainerReviewsService(prisma as any);
  const plan = (over: Record<string, unknown> = {}) => ({
    id: 'p-1',
    status: PlanStatus.ACTIVE,
    trainerUserId: 'ht-1',
    horse: { ownerId: 'own-1', deletedAt: null },
    ...over,
  });

  beforeEach(() => jest.resetAllMocks());

  it('owner reviews an active plan of their own horse (comment trimmed)', async () => {
    prisma.trainingPlan.findUnique.mockResolvedValue(plan());
    prisma.trainerReview.upsert.mockResolvedValue({ id: 'r-1' });
    await service.upsert('p-1', { rating: 4, comment: '  Tốt  ' }, owner);
    expect(prisma.trainerReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { trainingPlanId: 'p-1' },
        create: expect.objectContaining({ trainerUserId: 'ht-1', ownerUserId: 'own-1', rating: 4, comment: 'Tốt' }),
      }),
    );
  });

  it('hides plans of horses the owner does not own', async () => {
    prisma.trainingPlan.findUnique.mockResolvedValue(plan({ horse: { ownerId: 'other', deletedAt: null } }));
    expect(await codeOf(service.upsert('p-1', { rating: 5 }, owner))).toBe('PLAN_NOT_FOUND');
  });

  it('rejects draft and cancelled plans', async () => {
    prisma.trainingPlan.findUnique.mockResolvedValue(plan({ status: PlanStatus.DRAFT }));
    expect(await codeOf(service.upsert('p-1', { rating: 5 }, owner))).toBe('PLAN_NOT_REVIEWABLE');
    prisma.trainingPlan.findUnique.mockResolvedValue(plan({ status: PlanStatus.CANCELLED }));
    expect(await codeOf(service.upsert('p-1', { rating: 5 }, owner))).toBe('PLAN_NOT_REVIEWABLE');
  });

  it('owner list returns only their own reviews, no trainer summary', async () => {
    prisma.trainerReview.findMany.mockResolvedValue([]);
    const res = await service.list(owner);
    expect(prisma.trainerReview.findMany.mock.calls[0][0].where).toEqual({ ownerUserId: 'own-1' });
    expect(res.trainers).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('trainer sees only their own reviews', async () => {
    prisma.trainerReview.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.trainingPlan.groupBy.mockResolvedValue([]);
    prisma.trainerReview.groupBy.mockResolvedValue([]);
    await service.list(trainer, 'someone-else');
    expect(prisma.trainerReview.findMany.mock.calls[0][0].where).toEqual({ trainerUserId: 'ht-1' });
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ id: 'ht-1' });
  });

  it('manager summary: plan counts and rounded average per trainer', async () => {
    prisma.trainerReview.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([{ id: 'ht-1', fullName: 'A' }, { id: 'ht-2', fullName: 'B' }]);
    prisma.trainingPlan.groupBy.mockResolvedValue([
      { trainerUserId: 'ht-1', status: PlanStatus.ACTIVE, _count: { _all: 2 } },
      { trainerUserId: 'ht-1', status: PlanStatus.COMPLETED, _count: { _all: 3 } },
    ]);
    prisma.trainerReview.groupBy.mockResolvedValue([{ trainerUserId: 'ht-1', _count: { _all: 3 }, _avg: { rating: 4.333 } }]);
    const res = await service.list(manager);
    expect(res.trainers[0]).toMatchObject({ activePlans: 2, completedPlans: 3, reviewCount: 3, avgRating: 4.3 });
    expect(res.trainers[1]).toMatchObject({ activePlans: 0, completedPlans: 0, reviewCount: 0, avgRating: null });
  });
});
