import { IsInt, ValidateIf, Matches, Max, Min } from 'class-validator';
export class CareBillingPolicyDto {
  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  cutoverPeriod?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000000000)
  examUnitPrice?: number;
}
