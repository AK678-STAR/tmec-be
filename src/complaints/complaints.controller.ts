import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { ComplaintsService } from './complaints.service';
import {
  ConfirmViolationDto,
  CreateComplaintDto,
  DismissComplaintDto,
  QueryComplaintsDto,
  ReviewComplaintDto,
} from './dto/complaint.dto';

const REPORTERS = [UserRole.GROOM, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN];
const HANDLERS = [UserRole.CLUB_MANAGER, UserRole.VETERINARIAN];

@ApiTags('Complaints')
@ApiBearerAuth('JWT-auth')
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly service: ComplaintsService) {}

  @Get('subjects')
  @Roles(...REPORTERS)
  subjects(@CurrentUser() user: CurrentUserPayload) {
    return this.service.subjects(user);
  }

  @Get()
  @Roles(...REPORTERS, UserRole.CLUB_MANAGER)
  list(@Query() query: QueryComplaintsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Post()
  @Roles(...REPORTERS)
  create(@Body() dto: CreateComplaintDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Post(':id/review')
  @Roles(...HANDLERS)
  @HttpCode(200)
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewComplaintDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.review(id, dto, user);
  }

  @Post(':id/confirm-violation')
  @Roles(...HANDLERS)
  @HttpCode(200)
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmViolationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.confirm(id, dto, user);
  }

  @Post(':id/dismiss')
  @Roles(...HANDLERS)
  @HttpCode(200)
  dismiss(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DismissComplaintDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.dismiss(id, dto, user);
  }
}
