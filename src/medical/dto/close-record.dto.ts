import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CloseMedicalRecordDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  conclusion: string;

  // Kết quả điều trị (vd: RECOVERED, PARTIAL, UNCHANGED)
  @IsOptional()
  @IsString()
  treatmentResult?: string;
}

export class ReopenMedicalRecordDto {
  @IsNotEmpty({ message: 'Reason for reopening is required' })
  @IsString()
  @MinLength(10, { message: 'Reason for reopening must be at least 10 characters' })
  @MaxLength(500, { message: 'Reason for reopening cannot exceed 500 characters' })
  reason: string;
}
