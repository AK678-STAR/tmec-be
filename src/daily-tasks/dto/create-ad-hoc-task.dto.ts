import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DailyTaskType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateAdHocTaskDto {
  @ApiProperty({ description: 'ID chiến mã cần giao việc chăm sóc phát sinh' })
  @IsNotEmpty()
  @IsUUID()
  horseId!: string;

  @ApiProperty({ description: 'Loại công việc chăm sóc', enum: DailyTaskType })
  @IsNotEmpty()
  @IsEnum(DailyTaskType)
  taskType!: DailyTaskType;

  @ApiProperty({ description: 'Tiêu đề công việc phát sinh' })
  @IsNotEmpty()
  @IsString()
  title!: string;

  @ApiPropertyOptional({ description: 'Giờ thực hiện theo định dạng HH:mm, ví dụ 14:30' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'scheduledTime must be in HH:mm format' })
  scheduledTime?: string;

  @ApiPropertyOptional({ description: 'ID nhân viên chăm sóc được giao việc' })
  @IsOptional()
  @IsUUID()
  assignedGroomUserId?: string;

  @ApiPropertyOptional({ description: 'Ghi chú / Dặn dò chi tiết cho Groom' })
  @IsOptional()
  @IsString()
  description?: string;
}
