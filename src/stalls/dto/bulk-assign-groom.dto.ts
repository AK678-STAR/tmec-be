import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class BulkAssignGroomDto {
  @ApiProperty({ description: 'ID nhân viên chăm sóc được chọn' })
  @IsNotEmpty()
  @IsUUID()
  groomUserId!: string;

  @ApiProperty({ description: 'Danh sách ID StallAllocation cần gán', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  allocationIds!: string[];
}
