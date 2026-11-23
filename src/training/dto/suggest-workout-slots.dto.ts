import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { INTENSITIES, WORKOUT_SURFACES, WORKOUT_TYPES } from '../training-rules';

export class SuggestWorkoutSlotsDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) from: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) to: string;
  @IsIn([...WORKOUT_TYPES]) workoutType: string;
  @IsIn([...INTENSITIES]) intensity: string;
  @IsIn([...WORKOUT_SURFACES]) trackSurface: string;
  @IsString() phaseId: string;
  @Type(() => Number) @IsInt() @Min(100) @Max(5000) distanceMeters: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) repetitions?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(10) @Max(70) targetSpeedKmh?: number;
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  vetConsulted?: boolean;
  @IsOptional() @IsUUID('4') trackId?: string;
  @IsOptional() @IsUUID('4') excludeWorkoutId?: string;
}
