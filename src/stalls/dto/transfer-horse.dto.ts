import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TransferHorseDto {
  @ApiProperty({ description: 'ID ô chuồng mới' })
  @IsUUID()
  @IsNotEmpty()
  newStallId: string;

  @ApiPropertyOptional({ description: 'ID nhân viên chăm sóc' })
  @IsUUID()
  @IsOptional()
  assignedGroomUserId?: string;

  @ApiPropertyOptional({ description: 'ID người nhận bàn giao' })
  @IsUUID()
  @IsOptional()
  receivingGroomUserId?: string;

  @ApiPropertyOptional({ description: 'Ghi chú chuyển ô' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
