import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PaymentFailureDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  txRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
