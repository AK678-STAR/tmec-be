import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpsertTrainerReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 4 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 1000, example: 'Ngựa tiến bộ rõ, báo cáo đều đặn.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
