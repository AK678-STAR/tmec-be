import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ComplaintStatus } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateComplaintDto {
  @IsUUID()
  subjectUserId: string;

  @Transform(trim)
  @IsString()
  @Length(10, 4000)
  reason: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  @MaxLength(2048, { each: true })
  evidenceUrls?: string[];
}

export class ReviewComplaintDto {
  @Transform(trim)
  @IsString()
  @Length(10, 4000)
  reviewNote: string;

  @IsOptional()
  @IsDateString()
  responseDueAt?: string;
}

export class DismissComplaintDto {
  @Transform(trim)
  @IsString()
  @Length(10, 4000)
  conclusion: string;
}

export class ConfirmViolationDto extends DismissComplaintDto {
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  regulation: string;

  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  measures: string;
}

export class QueryComplaintsDto {
  @IsOptional()
  @IsEnum(ComplaintStatus)
  status?: ComplaintStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
