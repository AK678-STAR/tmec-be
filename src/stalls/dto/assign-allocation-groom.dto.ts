import { IsUUID } from 'class-validator';

export class AssignAllocationGroomDto {
  @IsUUID('4')
  groomUserId: string;
}
