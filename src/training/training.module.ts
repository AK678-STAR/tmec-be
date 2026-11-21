import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { TrainingController } from './training.controller';
import { TrainingCommonService } from './training-common.service';
import { TrainingPlansService } from './training-plans.service';
import { WorkoutsService } from './workouts.service';
import { TrainingInsightsService } from './training-insights.service';
import { TrainingScheduler } from './training.scheduler';
import { TrainerReviewsService } from './trainer-reviews.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [TrainingController],
  providers: [
    TrainingCommonService,
    TrainingPlansService,
    WorkoutsService,
    TrainingInsightsService,
    TrainerReviewsService,
    TrainingScheduler,
  ],
  exports: [TrainingCommonService, TrainingPlansService, WorkoutsService, TrainingInsightsService],
})
export class TrainingModule {}
