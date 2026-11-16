import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreatePrescriptionDto {
  @IsString()
  medicationName: string;

  @IsOptional()
  dosage?: any;

  @IsOptional()
  @IsString()
  administrationRoute?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsString()
  startDate: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  withdrawalDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3, { message: 'Medication frequency cannot exceed 3 times per day' })
  frequencyPerDay?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  daysCount?: number;

  @IsOptional()
  @IsString()
  supplyId?: string;
}

export class UpdatePrescriptionDto {
  @IsOptional()
  @IsString()
  supplyId?: string;

  @IsOptional()
  @IsString()
  medicationName?: string;

  @IsOptional()
  @IsString()
  dosage?: string;

  @IsOptional()
  @IsString()
  administrationRoute?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  withdrawalDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StopPrescriptionDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  stoppedReason?: string;

  @IsOptional()
  @IsString()
  stopNotes?: string;

  @IsOptional()
  @IsString()
  stoppedDate?: string;
}
