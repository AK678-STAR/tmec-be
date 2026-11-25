import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { CreateStaffWorkDto, StaffWorkStatusDto, WorkRangeDto } from './dto/staff-work.dto';
import { StaffWorkService } from './staff-work.service';

@ApiTags('Lịch công việc nhân viên')
@ApiBearerAuth('JWT-auth')
@Controller('staff-work')
@Roles(UserRole.CLUB_MANAGER, UserRole.VETERINARIAN, UserRole.GROOM)
export class StaffWorkController {
  constructor(private readonly work: StaffWorkService) {}

  @Get('members')
  @Roles(UserRole.CLUB_MANAGER)
  members() {
    return this.work.members();
  }

  @Get()
  overview(@Query() range: WorkRangeDto, @CurrentUser() actor: CurrentUserPayload) {
    return this.work.overview(range, actor);
  }

  @Post()
  @Roles(UserRole.CLUB_MANAGER)
  create(@Body() dto: CreateStaffWorkDto, @CurrentUser() actor: CurrentUserPayload) {
    return this.work.create(dto, actor);
  }

  @Patch(':id/status')
  status(
    @Param('id') id: string,
    @Body() dto: StaffWorkStatusDto,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return this.work.changeStatus(id, dto.status, actor);
  }
}
