import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { SeverityLevel } from '@prisma/client';

export class UpdateInjuryDto {
  @ApiPropertyOptional({ description: 'ID bệnh án liên quan' })
  @IsOptional()
  @IsUUID()
  medicalRecordId?: string;

  @ApiPropertyOptional({ description: 'Tọa độ X chuẩn hóa (0.0 - 1.0)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  coordinateX?: number;

  @ApiPropertyOptional({ description: 'Tọa độ Y chuẩn hóa (0.0 - 1.0)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  coordinateY?: number;

  @ApiPropertyOptional({ description: 'Góc nhìn: LEFT | RIGHT' })
  @IsOptional()
  @IsString()
  @IsIn(['LEFT', 'RIGHT'], { message: 'viewSide must be LEFT or RIGHT' })
  viewSide?: string;

  @ApiPropertyOptional({ description: 'Lớp hiển thị: MUSCLE | SKELETON' })
  @IsOptional()
  @IsString()
  @IsIn(['MUSCLE', 'SKELETON'], { message: 'layer must be MUSCLE or SKELETON' })
  layer?: string;

  @ApiPropertyOptional({ description: 'Vùng giải phẫu' })
  @IsOptional()
  @IsString()
  anatomicalZone?: string;

  @ApiPropertyOptional({ description: 'Loại tổn thương' })
  @IsOptional()
  @IsString()
  injuryType?: string;

  @ApiPropertyOptional({ enum: SeverityLevel })
  @IsOptional()
  @IsEnum(SeverityLevel)
  severity?: SeverityLevel;

  @ApiPropertyOptional({
    description: 'Giai đoạn hồi phục: ACUTE | SUBACUTE | RECOVERING | HEALED',
  })
  @IsOptional()
  @IsString()
  stage?: string;

  @ApiPropertyOptional({ description: 'Ngày phát hiện (ISO date string)' })
  @IsOptional()
  @IsDateString()
  discoveryDate?: string;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết' })
  @IsOptional()
  @IsString()
  description?: string;
}
