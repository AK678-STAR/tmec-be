import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdmissionStatus } from '@prisma/client';

/** POST /horses/admissions/:id/schedule */
export class ScheduleAdmissionDto {
  @ApiProperty({
    description: 'Thời điểm hẹn mang ngựa đến CLB (ISO 8601)',
    example: '2026-11-25T09:00:00Z',
  })
  @IsNotEmpty({ message: 'Thời gian hẹn là bắt buộc.' })
  @IsDateString({}, { message: 'Thời gian hẹn phải đúng định dạng ISO 8601.' })
  appointmentDate: string;

  @ApiPropertyOptional({ description: 'Hướng dẫn tiếp đón (Cổng A, liên hệ bảo vệ…)' })
  @ValidateIf((_obj, val) => val !== undefined)
  @IsString({ message: 'appointmentNotes must be a string.' })
  appointmentNotes?: string;
}

/** PATCH /horses/admissions/:id/inspect — CM cập nhật chip/pháp lý, VET cập nhật y tế. */
export class InspectAdmissionDto {
  @ApiPropertyOptional({ description: 'Số vi mạch thực tế quét bằng máy đọc (CM)' })
  @ValidateIf((_obj, val) => val !== undefined)
  @IsString({ message: 'scannedMicrochip must be a string.' })
  @Length(0, 30)
  scannedMicrochip?: string;

  @ApiPropertyOptional({ description: 'Đã kiểm tra đầy đủ giấy tờ pháp lý gốc (CM)' })
  @ValidateIf((_obj, val) => val !== undefined)
  @IsBoolean({ message: 'legalVerified must be a boolean.' })
  legalVerified?: boolean;

  @ApiPropertyOptional({
    description: 'Ghi chú giấy khai sinh, phả hệ, hợp đồng chuyển nhượng (CM)',
  })
  @ValidateIf((_obj, val) => val !== undefined)
  @IsString({ message: 'legalDocumentsNote must be a string.' })
  legalDocumentsNote?: string;

  @ApiPropertyOptional({ description: 'Ảnh giấy tờ chủ đã upload (tùy chọn, §6 câu 2)' })
  @ValidateIf((_obj, val) => val !== undefined)
  @IsString({ message: 'documentsUrl must be a string.' })
  documentsUrl?: string;

  @ApiPropertyOptional({
    description: 'Đạt chuẩn thể lực & sức khỏe (VET) — null khi chưa đánh giá',
  })
  @ValidateIf((_obj, val) => val !== undefined)
  @IsBoolean({ message: 'isHealthEligible must be a boolean.' })
  isHealthEligible?: boolean;

  @ApiPropertyOptional({ description: 'Ghi chú lâm sàng của bác sĩ thú y (VET)' })
  @ValidateIf((_obj, val) => val !== undefined)
  @IsString({ message: 'healthCheckNotes must be a string.' })
  healthCheckNotes?: string;
}

/** POST /horses/admissions/:id/reject */
export class RejectAdmissionDto {
  @ApiProperty({
    description: 'Lý do từ chối (bắt buộc, 10–500 ký tự)',
    example: 'Chưa đủ giấy tờ phả hệ gốc.',
  })
  @IsNotEmpty({ message: 'Lý do từ chối là bắt buộc.' })
  @IsString({ message: 'rejectionReason must be a string.' })
  @Length(10, 500, { message: 'Lý do từ chối phải từ 10 đến 500 ký tự.' })
  rejectionReason: string;

  @ApiPropertyOptional({ description: 'Ghi chú bổ sung tự do' })
  @ValidateIf((_obj, val) => val !== undefined)
  @IsString({ message: 'note must be a string.' })
  note?: string;
}

/** POST /horses/admissions/:id/cancel */
export class CancelAdmissionDto {
  @ApiPropertyOptional({ description: 'Lý do hủy đơn (tự do)' })
  @ValidateIf((_obj, val) => val !== undefined)
  @IsString({ message: 'reason must be a string.' })
  @Type(() => String)
  reason?: string;
}

/** GET /horses/admissions — Danh sách hồ sơ tiếp nhận (Staff-only) */
export class QueryAdmissionDto {
  @ApiPropertyOptional({ enum: AdmissionStatus, description: 'Lọc theo trạng thái hồ sơ' })
  @ValidateIf((_obj, val) => val !== undefined)
  @IsEnum(AdmissionStatus)
  status?: AdmissionStatus;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo tên chủ, tên ngựa, microchip, mã ADM' })
  @ValidateIf((_obj, val) => val !== undefined)
  @IsString({ message: 'search must be a string.' })
  search?: string;

  @ApiPropertyOptional({
    description:
      'Lọc các ngựa được tiếp nhận trong 7 ngày qua (status=APPROVED, admittedAt >= now - 7 days)',
  })
  @ValidateIf((_obj, val) => val !== undefined)
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean({ message: 'recent7Days must be a boolean value.' })
  recent7Days?: boolean;

  @ApiPropertyOptional({ description: 'Trang hiện tại (mặc định: 1)' })
  @ValidateIf((_obj, val) => val !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Số bản ghi trên mỗi trang (mặc định: 10)' })
  @ValidateIf((_obj, val) => val !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;
}
