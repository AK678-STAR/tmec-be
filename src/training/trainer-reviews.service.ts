import { HttpStatus, Injectable } from '@nestjs/common';
import { PlanStatus, Prisma, Role, UserStatus } from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertTrainerReviewDto } from './dto/trainer-review.dto';

const REVIEWABLE: PlanStatus[] = [PlanStatus.ACTIVE, PlanStatus.COMPLETED];

const REVIEW_SELECT = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  trainer: { select: { id: true, fullName: true } },
  owner: { select: { id: true, fullName: true } },
  trainingPlan: {
    select: {
      id: true,
      planCode: true,
      phaseName: true,
      status: true,
      horse: { select: { id: true, name: true, horseCode: true } },
    },
  },
} satisfies Prisma.TrainerReviewSelect;

/** Chủ ngựa đánh giá HLV theo giáo án; CM xem tổng hợp mọi HLV, HLV xem đánh giá của mình. */
@Injectable()
export class TrainerReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Chủ ngựa tạo / sửa đánh giá cho giáo án Đang áp dụng hoặc Hoàn thành của ngựa mình sở hữu. */
  async upsert(planId: string, dto: UpsertTrainerReviewDto, user: CurrentUserPayload) {
    const plan = await this.prisma.trainingPlan.findUnique({
      where: { id: planId },
      select: { id: true, status: true, trainerUserId: true, horse: { select: { ownerId: true, deletedAt: true } } },
    });
    if (!plan || plan.horse.deletedAt || plan.horse.ownerId !== user.userId) {
      throw apiError(HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND', 'Training plan not found');
    }
    if (!REVIEWABLE.includes(plan.status)) {
      throw apiError(
        HttpStatus.CONFLICT,
        'PLAN_NOT_REVIEWABLE',
        'You can review a trainer only after the plan has started',
        { status: plan.status },
      );
    }
    const comment = dto.comment?.trim() || null;
    return this.prisma.trainerReview.upsert({
      where: { trainingPlanId: plan.id },
      create: {
        trainingPlanId: plan.id,
        trainerUserId: plan.trainerUserId,
        ownerUserId: user.userId,
        rating: dto.rating,
        comment,
      },
      update: { rating: dto.rating, comment, ownerUserId: user.userId },
      select: REVIEW_SELECT,
    });
  }

  /**
   * CM: mọi HLV (kể cả chưa có đánh giá) kèm số giáo án; HT: chỉ bản thân; OWNER: đánh giá mình đã viết.
   */
  async list(user: CurrentUserPayload, trainerId?: string) {
    const where: Prisma.TrainerReviewWhereInput =
      user.role === UserRole.HORSE_OWNER
        ? { ownerUserId: user.userId }
        : user.role === UserRole.HEAD_TRAINER
          ? { trainerUserId: user.userId }
          : trainerId
            ? { trainerUserId: trainerId }
            : {};
    const items = await this.prisma.trainerReview.findMany({
      where,
      select: REVIEW_SELECT,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    if (user.role === UserRole.HORSE_OWNER) return { trainers: [], items };

    const trainers = await this.prisma.user.findMany({
      // Bỏ tài khoản chưa từng làm việc (chờ duyệt, mời, bị từ chối); giữ HLV đã khóa / nghỉ vì còn lịch sử.
      where:
        user.role === UserRole.HEAD_TRAINER
          ? { id: user.userId }
          : { role: Role.HEAD_TRAINER, status: { in: [UserStatus.ACTIVE, UserStatus.LOCKED, UserStatus.INACTIVE] } },
      select: { id: true, fullName: true, email: true, avatarUrl: true },
      orderBy: { fullName: 'asc' },
    });
    const ids = trainers.map((t) => t.id);
    const [planCounts, ratingStats] = await Promise.all([
      this.prisma.trainingPlan.groupBy({
        by: ['trainerUserId', 'status'],
        where: { trainerUserId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.trainerReview.groupBy({
        by: ['trainerUserId'],
        where: { trainerUserId: { in: ids } },
        _count: { _all: true },
        _avg: { rating: true },
      }),
    ]);
    return {
      trainers: trainers.map((t) => {
        const plans = planCounts.filter((p) => p.trainerUserId === t.id);
        const count = (s: PlanStatus) => plans.find((p) => p.status === s)?._count._all ?? 0;
        const stats = ratingStats.find((r) => r.trainerUserId === t.id);
        return {
          ...t,
          activePlans: count(PlanStatus.ACTIVE),
          completedPlans: count(PlanStatus.COMPLETED),
          reviewCount: stats?._count._all ?? 0,
          avgRating: stats?._avg.rating == null ? null : Math.round(stats._avg.rating * 10) / 10,
        };
      }),
      items,
    };
  }
}
