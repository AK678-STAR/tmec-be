import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { ShiftRostersService } from './shift-rosters.service';
import {
  AssignShiftRosterDto,
  CopyWeekRosterDto,
  QueryShiftRosterDto,
  RequestShiftSwapDto,
  SwapCandidatesQueryDto,
} from './dto/shift-roster.dto';

const STAFF = [UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN, UserRole.GROOM];

@ApiTags('Shift rosters')
@ApiBearerAuth('JWT-auth')
@Controller('shift-rosters')
export class ShiftRostersController {
  constructor(private readonly service: ShiftRostersService) {}

  @Get()
  @Roles(...STAFF)
  @ApiOperation({ summary: 'SC-4.01 Lấy ma trận phân ca theo khoảng ngày/khu' })
  findAll(@Query() query: QueryShiftRosterDto) {
    return this.service.findAll(query);
  }

  @Get('overview')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({
    summary: '#2 Tổng quan ca trực trong ngày: ai trực khu nào, việc xong bao nhiêu',
  })
  overview(@Query('date') date?: string) {
    return this.service.overview(date);
  }

  @Get('my')
  @Roles(UserRole.GROOM)
  @ApiOperation({ summary: 'SC-4.01 / SC-4.05 Ca trực của tôi và ngựa phụ trách' })
  getMyShifts(@CurrentUser() user: CurrentUserPayload, @Query() query: QueryShiftRosterDto) {
    return this.service.getMyShifts(user, query);
  }

  @Get('swap-candidates')
  @Roles(UserRole.GROOM)
  @ApiOperation({ summary: 'Đồng nghiệp còn trống ca để xin đổi' })
  getSwapCandidates(
    @Query() query: SwapCandidatesQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.getSwapCandidates(query.rosterId, user);
  }

  @Post(':id/swap-request')
  @Roles(UserRole.GROOM)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi yêu cầu đổi ca tới quản lý, chưa thay đổi phân công' })
  requestSwap(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RequestShiftSwapDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.requestSwap(id, dto, user);
  }

  @Post()
  @Roles(UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'BTN-4.04 / DL-4.01 Phân ca một ô (Chỉ Club Manager)' })
  assignSlot(@Body() dto: AssignShiftRosterDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.assignSlot(dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Xóa một phân công ca trực (Chỉ Club Manager)' })
  delete(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.delete(id, user);
  }

  @Post('copy-week')
  @Roles(UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'BTN-4.05 / DL-4.02 Sao chép phân ca tuần (Chỉ Club Manager)' })
  copyWeek(@Body() dto: CopyWeekRosterDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.copyWeek(dto, user);
  }
}
