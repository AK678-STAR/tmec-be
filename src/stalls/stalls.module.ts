import { Module } from '@nestjs/common';
import { StallsController } from './stalls.controller';
import { StallsService } from './stalls.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DailyTasksModule } from '../daily-tasks/daily-tasks.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule, DailyTasksModule],
  controllers: [StallsController],
  providers: [StallsService],
})
export class StallsModule {}
