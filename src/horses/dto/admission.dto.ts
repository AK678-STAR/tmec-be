import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** POST /horses/admissions/:id/schedule */
export class ScheduleAdmissionDto {
  @ApiProperty({ description: 'Thời điểm hẹn mang ngựa đến CLB (ISO 8601)', example: '2026-11-25T09:00:00Z' })
  @IsNotEmpty({ message: 'Thời gian hẹn là bắt buộc.' })
  @IsDateString({}, { message: 'Thời gian hẹn phải đúng định dạng ISO 8601.' })
  appointmentDate: string;

  @ApiPropertyOptional({ description: 'Hướng dẫn tiếp đón (Cổng A, liên hệ bảo vệ…)' })
  @IsOptional()
  @IsString()
  appointmentNotes?: string;
}

/** PATCH /horses/admissions/:id/inspect — CM cập nhật chip/pháp lý, VET cập nhật y tế. */
export class InspectAdmissionDto {
  @ApiPropertyOptional({ description: 'Số vi mạch thực tế quét bằng máy đọc (CM)' })
  @IsOptional()
  @IsString()
  @Length(0, 30)
  scannedMicrochip?: string;

  @ApiPropertyOptional({ description: 'Đã kiểm tra đầy đủ giấy tờ pháp lý gốc (CM)' })
  @IsOptional()
  @IsBoolean()
  legalVerified?: boolean;

  @ApiPropertyOptional({ description: 'Ghi chú giấy khai sinh, phả hệ, hợp đồng chuyển nhượng (CM)' })
  @IsOptional()
  @IsString()
  legalDocumentsNote?: string;

  @ApiPropertyOptional({ description: 'Ảnh giấy tờ chủ đã upload (tùy chọn, §6 câu 2)' })
  @IsOptional()
  @IsString()
  documentsUrl?: string;

  @ApiPropertyOptional({ description: 'Đạt chuẩn thể lực & sức khỏe (VET) — null khi chưa đánh giá' })
  @IsOptional()
  @IsBoolean()
  isHealthEligible?: boolean;

  @ApiPropertyOptional({ description: 'Ghi chú lâm sàng của bác sĩ thú y (VET)' })
  @IsOptional()
  @IsString()
  healthCheckNotes?: string;
}

/** POST /horses/admissions/:id/reject */
export class RejectAdmissionDto {
  @ApiProperty({ description: 'Lý do từ chối (bắt buộc, 10–500 ký tự)', example: 'Chưa đủ giấy tờ phả hệ gốc.' })
  @IsNotEmpty({ message: 'Lý do từ chối là bắt buộc.' })
  @IsString()
  @Length(10, 500, { message: 'Lý do từ chối phải từ 10 đến 500 ký tự.' })
  rejectionReason: string;

  @ApiPropertyOptional({ description: 'Ghi chú bổ sung tự do' })
  @IsOptional()
  @IsString()
  note?: string;
}

/** POST /horses/admissions/:id/cancel */
export class CancelAdmissionDto {
  @ApiPropertyOptional({ description: 'Lý do hủy đơn (tự do)' })
  @IsOptional()
  @IsString()
  @Type(() => String)
  reason?: string;
}
