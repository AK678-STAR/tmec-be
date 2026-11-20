import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HorseTransferStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class TransferHorseOwnerDto {
  @ApiProperty({
    description: 'ID của chủ sở hữu mới (Người dùng phải có vai trò HORSE_OWNER)',
    example: 'd3b07384-d113-4e89-a2a2-3f62df94dfb1',
  })
  @IsNotEmpty({ message: 'New owner ID is required.' })
  @IsString({ message: 'New owner ID must be a string.' })
  newOwnerId: string;

  @ApiProperty({
    description: 'Lý do chuyển nhượng quyền sở hữu ngựa',
    example: 'Sold via registered syndicate agreement.',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Transfer reason must be a string.' })
  reason?: string;
}

export class RespondTransferDto {
  @ApiProperty({ description: 'true = đồng ý, false = từ chối' })
  @IsBoolean()
  accept: boolean;

  @ApiPropertyOptional({ description: 'Lý do từ chối (không bắt buộc)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class QueryTransferRequestDto {
  @ApiPropertyOptional({ enum: HorseTransferStatus })
  @IsOptional()
  @IsEnum(HorseTransferStatus)
  status?: HorseTransferStatus;
}
