import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class WorkRangeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString()
  from: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString()
  to: string;
}

export class CreateStaffWorkDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 150)
  title: string;

  @IsUUID()
  userId: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class StaffWorkStatusDto {
  @IsIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status: string;
}
