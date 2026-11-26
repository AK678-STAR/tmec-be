import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class DemoArgsDto {
  @IsIn(['ADMISSION_PENDING', 'RACE_READY'])
  scenario: 'ADMISSION_PENDING' | 'RACE_READY';

  @IsString()
  @Length(2, 90)
  horseName: string;

  @IsUUID('4')
  ownerId: string;
}

export class CreateDemoScenarioDto extends DemoArgsDto {
  @IsUUID('4')
  generationId: string;

  @IsUUID('4')
  sessionNonce: string;

  @IsString()
  @Length(40, 2048)
  permit: string;
}

export class DemoChatDto {
  @IsString()
  @Length(1, 2000)
  message: string;

  @IsUUID('4')
  generationId: string;

  @IsUUID('4')
  sessionNonce: string;

  @IsOptional()
  @IsUUID('4')
  ownerId?: string;

  @IsOptional()
  @IsBoolean()
  contextRead?: boolean;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
