import { HttpStatus } from '@nestjs/common';
import { AdmissionStatus } from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';

/**
 * ADM-01 (SPEC-EQUIFLOW-HORSE-ADMISSION-V2 §5): luật phòng vệ cho module tiếp nhận ngựa.
 * Các hàm thuần, không phụ thuộc Prisma/Nest DI để viết unit test (giống horse-rules.ts).
 */

/** Rule 3: các trạng thái hồ sơ "đang hoạt động" — mỗi ngựa tối đa MỘT (ACTIVE_ADMISSION_EXISTS). */
export const ACTIVE_ADMISSION_STATUSES: AdmissionStatus[] = [
  AdmissionStatus.PENDING_VERIFICATION,
  AdmissionStatus.APPOINTED,
  AdmissionStatus.INSPECTION_IN_PROGRESS,
];

export interface ApproveInput {
  status: AdmissionStatus;
  microchipVerified: boolean;
  legalVerified: boolean;
  isHealthEligible: boolean | null;
}

/**
 * Rule 1 — rào chắn Approve: hồ sơ phải đang INSPECTION_IN_PROGRESS và đủ 3 điều kiện
 * (vi mạch khớp + pháp lý + y tế đạt). Thiếu một → ADMISSION_CRITERIA_NOT_MET.
 */
export function assertAdmissionApprovable(input: ApproveInput): void {
  if (input.status !== AdmissionStatus.INSPECTION_IN_PROGRESS) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'ADMISSION_NOT_IN_INSPECTION',
      'Hồ sơ tiếp nhận chưa ở trạng thái đang thẩm định.',
    );
  }
  if (!input.microchipVerified || !input.legalVerified || !input.isHealthEligible) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'ADMISSION_CRITERIA_NOT_MET',
      'Không thể duyệt tiếp nhận khi chưa hoàn tất xác thực vi mạch, giấy tờ pháp lý và kiểm tra sức khỏe thú y.',
    );
  }
}

/** Rule 3 — single active admission per horse: chặn khi còn hồ sơ đang xử lý. */
export function assertNoActiveAdmission(activeCount: number): void {
  if (activeCount > 0) {
    throw apiError(
      HttpStatus.CONFLICT,
      'ACTIVE_ADMISSION_EXISTS',
      'Ngựa đã có một hồ sơ tiếp nhận đang xử lý. Hãy hoàn tất hoặc hủy hồ sơ đó trước.',
    );
  }
}

/** Lý do từ chối là bắt buộc và đủ dài (10–500 ký tự, nhất quán REASON_REQUIRED). */
export function assertRejectionReason(reason?: string): void {
  if (!reason || reason.trim().length < 10 || reason.trim().length > 500) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'REJECTION_REASON_REQUIRED',
      'Lý do từ chối phải từ 10 đến 500 ký tự.',
    );
  }
}
