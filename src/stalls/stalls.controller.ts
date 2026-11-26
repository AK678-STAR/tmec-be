import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StallsService } from './stalls.service';
import {
  SetStallStatusDto,
  SetZoneStatusDto,
  UpdateStallDto,
  UpdateZoneDto,
} from './dto/stall.dto';
import { AssignHorseDto } from './dto/assign-horse.dto';
import { TransferHorseDto } from './dto/transfer-horse.dto';
import { ReturnStallDto } from './dto/return-stall.dto';
import { AssignAllocationGroomDto } from './dto/assign-allocation-groom.dto';
import { BulkAssignGroomDto } from './dto/bulk-assign-groom.dto';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';

const STAFF = [UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN, UserRole.GROOM];

/** Q10: Chủ ngựa không xem ô chuồng. Danh mục khu / ô chỉ CM sửa; gán / chuyển / trả ô: CM, HT. */
@ApiTags('Stalls')
@ApiBearerAuth('JWT-auth')
@Controller('stalls')
export class StallsController {
  constructor(private readonly stallsService: StallsService) {}

  @Get('allocations/:id/groom-candidates')
  @Roles(UserRole.CLUB_MANAGER)
  groomCandidates(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.stallsService.groomCandidates(id, user);
  }

  @Patch('allocations/:id/groom')
  @Roles(UserRole.CLUB_MANAGER)
  assignAllocationGroom(
    @Param('id') id: string,
    @Body() dto: AssignAllocationGroomDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.stallsService.assignAllocationGroom(id, dto.groomUserId, user);
  }

  @Post('allocations/bulk-groom')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Phân công hàng loạt ô chuồng cho một nhân viên chăm sóc (Groom)' })
  bulkAssignGroom(@Body() dto: BulkAssignGroomDto, @CurrentUser() user: CurrentUserPayload) {
    return this.stallsService.bulkAssignGroom(dto, user);
  }

  @Get()
  @Roles(...STAFF)
  @ApiOperation({
    summary: 'SC-1.04 / SC-1.07 Danh sách ô chuồng (includeInactive=true để thấy ô Ngừng dùng)',
  })
  findAll(
    @Query()
    query: {
      zone?: string;
      zoneId?: string;
      status?: string;
      search?: string;
      includeInactive?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.stallsService.findAll(query, user);
  }

  @Get('zones')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Danh sách khu chuồng (includeInactive=true để thấy khu Ngừng dùng)' })
  listZones(@Query() query: { includeInactive?: string }) {
    return this.stallsService.listZones(query);
  }

  @Get('grooms')
  @Roles(UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER)
  @ApiOperation({
    summary: 'DL-1.02 Nhân viên chăm sóc đang hoạt động (kèm số ngựa đang phụ trách)',
  })
  listGrooms() {
    return this.stallsService.listGrooms();
  }

  @Put('zones/:id')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'DL-1.14 Sửa khu chuồng (CM)' })
  updateZone(
    @Param('id') id: string,
    @Body() dto: UpdateZoneDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.stallsService.updateZone(id, dto, user);
  }

  @Patch('zones/:id/status')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'BTN-1.32 Ngừng dùng / Dùng lại khu (CM)' })
  setZoneStatus(
    @Param('id') id: string,
    @Body() dto: SetZoneStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.stallsService.setZoneStatus(id, dto, user);
  }

  @Put(':id')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'DL-1.15 Sửa ô chuồng (CM)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStallDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.stallsService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({
    summary:
      'BTN-1.35 Đổi trạng thái ô: Hoạt động / Bảo trì / Ngừng dùng (CM). Không có xóa ô (Q-1.C)',
  })
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetStallStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.stallsService.setStatus(id, dto, user);
  }

  @Post(':id/allocations')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'DL-1.02 Gán ngựa vào ô chuồng (CM, HT)' })
  assignHorse(
    @Param('id') id: string,
    @Body() dto: AssignHorseDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.stallsService.assignHorse(id, dto, user);
  }

  @Put('allocations/:id/transfer')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'DL-1.02 Chuyển ngựa sang ô chuồng khác (CM, HT)' })
  transferHorse(
    @Param('id') id: string,
    @Body() dto: TransferHorseDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.stallsService.transferHorse(id, dto, user);
  }

  @Put('allocations/:id/return')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'DL-1.03 Trả ô chuồng (CM, HT)' })
  returnStall(
    @Param('id') id: string,
    @Body() dto: ReturnStallDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.stallsService.returnStall(id, dto, user);
  }
}
