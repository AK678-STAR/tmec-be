import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AssignHorseTrainerDto {
  @ApiProperty({ description: 'ID của Huấn luyện viên được gán' })
  @IsString({ message: 'trainerUserId phải là chuỗi' })
  @IsNotEmpty({ message: 'Vui lòng chọn Huấn luyện viên' })
  trainerUserId: string;

  @ApiPropertyOptional({ description: 'Ghi chú phân công chiến mã' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự.' })
  notes?: string;
}

export enum HandoverAction {
  ACCEPT = 'ACCEPT',
  REJECT = 'REJECT',
}

export class RespondHandoverDto {
  @ApiProperty({ description: 'Token xác thực bàn giao' })
  @IsString({ message: 'token phải là chuỗi' })
  @IsNotEmpty({ message: 'Vui lòng cung cấp token' })
  token: string;

  @ApiProperty({ enum: HandoverAction, description: 'Hành động phản hồi: ACCEPT hoặc REJECT' })
  @IsEnum(HandoverAction, { message: 'Hành động phải là ACCEPT hoặc REJECT' })
  action: HandoverAction;

  @ApiPropertyOptional({ description: 'Lý do từ chối (khi REJECT)' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự.' })
  declineReason?: string;
}
