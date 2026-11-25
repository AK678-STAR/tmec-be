import { DemoAgentService } from './demo-agent.service';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateDemoScenarioDto, DemoChatDto } from './demo-data.dto';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { DemoDataGuard } from './demo-data.guard';
import { DemoDataService } from './demo-data.service';

@Controller('demo-data')
@UseGuards(DemoDataGuard)
export class DemoDataController {
  constructor(
    private readonly data: DemoDataService,
    private readonly agent: DemoAgentService,
  ) {}

  @Post('chat')
  chat(@CurrentUser() actor: CurrentUserPayload, @Body() dto: DemoChatDto) {
    return this.agent.chat(actor, dto);
  }

  @Post('scenarios')
  create(@CurrentUser() actor: CurrentUserPayload, @Body() dto: CreateDemoScenarioDto) {
    return this.data.createScenario(actor, dto);
  }

  @Get('generations/:id')
  receipt(
    @CurrentUser() actor: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.data.getReceipt(actor, id);
  }

  @Get('context')
  context() {
    return this.data.getContext();
  }
}
