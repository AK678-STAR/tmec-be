import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { HorseCatalogsModule } from '../horse-catalogs/horse-catalogs.module';
import { HorsesController } from './horses.controller';
import { HorsesService } from './horses.service';
import { HorseHistoryService } from './horse-history.service';
import { HorseLifecycleService } from './horse-lifecycle.service';
import { StaffWorkController } from './staff-work.controller';
import { StaffWorkService } from './staff-work.service';

@Module({
  imports: [PrismaModule, AuditModule, HorseCatalogsModule],
  controllers: [HorsesController, StaffWorkController],
  providers: [HorsesService, HorseHistoryService, HorseLifecycleService, StaffWorkService],
  exports: [HorsesService, HorseHistoryService, HorseLifecycleService],
})
export class HorsesModule {}
