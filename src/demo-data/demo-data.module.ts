import { DemoAgentService } from './demo-agent.service';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { DemoDataGuard } from './demo-data.guard';
import { DemoDataController } from './demo-data.controller';
import { DemoDataService } from './demo-data.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [DemoDataController],
  providers: [DemoDataGuard, DemoDataService, DemoAgentService],
})
export class DemoDataModule {}
