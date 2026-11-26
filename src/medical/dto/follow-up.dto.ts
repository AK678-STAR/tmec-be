import { IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateFollowUpDto {
  @IsOptional()
  @IsString()
  followUpDate?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  progressNotes: string;

  @IsOptional()
  @IsNumber()
  @Min(35)
  @Max(43)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(120)
  restingHeartRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(4)
  @Max(60)
  respiratoryRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adjustments?: string;
}
