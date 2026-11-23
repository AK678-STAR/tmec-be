import { Transform } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTrainingTrackDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,29}$/)
  code: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;

  @IsIn(['TURF', 'DIRT', 'SYNTHETIC'])
  surface: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class UpdateTrainingTrackDto extends PartialType(CreateTrainingTrackDto) {}
export class MapLegacyTrackDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  workoutIds: string[];
}
