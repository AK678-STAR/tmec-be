import { HttpStatus } from '@nestjs/common';
import { HorseStatus, RetireReason } from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';
import { apiError } from '../common/exceptions/api-error';

/** Tên ngựa: chữ (có dấu tiếng Việt), số, khoảng trắng, ' . - */
export const HORSE_NAME_RE = /^[\p{L}\p{N}\s'.-]+$/u;

/** Giới tính (SC-1.02): Ngựa đực / Ngựa cái / Ngựa đực thiến. */
export const HORSE_GENDERS = ['Stallion', 'Mare', 'Gelding'];

/** Bỏ khoảng trắng đầu/cuối và gộp nhiều khoảng trắng liền nhau thành một. */
export function normalizeName(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}

/** Nhóm Vận hành: HT điều khiển. ACTIVE = Sẵn sàng thi đấu. */
export const OPERATIONAL_STATUSES: HorseStatus[] = [
  HorseStatus.RESTING,
  HorseStatus.IN_TRAINING,
  HorseStatus.ACTIVE,
];

/** Nhóm Y tế: VET điều khiển. */
export const MEDICAL_STATUSES: HorseStatus[] = [
  HorseStatus.UNDER_OBSERVATION,
  HorseStatus.INJURED,
  HorseStatus.ISOLATED,
];

export interface StatusChangeInput {
  role: string;
  from: HorseStatus;
  to: HorseStatus;
  isMedicalLocked: boolean;
  reason?: string;
  retireReason?: RetireReason | null;
  /** Lý do ngừng quản lý hiện tại của ngựa (khi from = RETIRED). */
  currentRetireReason?: RetireReason | null;
  /** Đánh dấu thao tác chuyển trạng thái nằm trong quy trình tiếp nhận ADM (Duyệt / Từ chối). */
  isAdmissionProcess?: boolean;
}

function deny(code: string, message: string): never {
  throw apiError(HttpStatus.FORBIDDEN, code, message);
}

function requireReason(reason?: string): void {
  if (!reason || reason.trim().length < 10) {
    throw apiError(HttpStatus.BAD_REQUEST, 'REASON_REQUIRED', 'Lý do phải từ 10 đến 500 ký tự.');
  }
}

/**
 * Bảng chuyển trạng thái Flow 1 §4.2 (quyết định Q14 = C). Ném lỗi nếu không được phép.
 *
 * - HT: chỉ đổi trong nhóm Vận hành, bị chặn khi đang Khóa huấn luyện.
 * - VET: Vận hành -> Y tế, Y tế -> Y tế bất kỳ lúc nào; Y tế -> RESTING/IN_TRAINING chỉ khi không khóa.
 * - CM: chỉ Ngừng quản lý (RETIRED, kèm lý do) và Kích hoạt lại (RETIRED -> RESTING).
 * - CM duyệt tiếp nhận: PENDING_ADMISSION -> RESTING / REJECTED (trong quy trình ADM).
 * - Ngựa đã Ngừng quản lý: chỉ CM kích hoạt lại, trừ khi lý do là Đã chết.
 */
export function assertStatusTransition(input: StatusChangeInput): void {
  const { role, from, to, isMedicalLocked, reason, isAdmissionProcess } = input;

  if (from === to) {
    throw apiError(HttpStatus.BAD_REQUEST, 'SAME_STATUS', `Horse is already in status ${to}.`);
  }

  // Khóa không cho chuyển thủ công sang PENDING_ADMISSION (chỉ tạo qua nộp đơn đăng ký)
  if (to === HorseStatus.PENDING_ADMISSION) {
    deny('ROLE_RESTRICTION', 'Không thể chuyển thủ công trạng thái ngựa sang Chờ tiếp nhận.');
  }

  // Ngựa đang chờ tiếp nhận: chỉ CM duyệt/từ chối thông qua quy trình tiếp nhận ADM
  if (from === HorseStatus.PENDING_ADMISSION) {
    if (!isAdmissionProcess) {
      deny(
        'ADMISSION_PROCESS_REQUIRED',
        'Không thể đổi trạng thái ngựa đang chờ tiếp nhận qua API này. Vui lòng sử dụng quy trình Thẩm định tiếp nhận.',
      );
    }
    if (
      role !== UserRole.CLUB_MANAGER ||
      (to !== HorseStatus.RESTING && to !== HorseStatus.REJECTED)
    ) {
      deny(
        'ROLE_RESTRICTION',
        'Quản lý CLB chỉ được chuyển trạng thái ngựa đang chờ tiếp nhận sang Nghỉ ngơi (Duyệt) hoặc Từ chối.',
      );
    }
    if (to === HorseStatus.REJECTED) {
      requireReason(reason);
    }
    return;
  }

  // Ngựa đã bị từ chối tiếp nhận: không thể đổi trạng thái qua API này, phải nộp lại đơn tiếp nhận mới
  if (from === HorseStatus.REJECTED) {
    deny(
      'HORSE_REJECTED',
      'Ngựa đã bị từ chối tiếp nhận. Vui lòng nộp lại đơn đăng ký tiếp nhận mới.',
    );
  }

  if (from === HorseStatus.RETIRED) {
    if (role !== UserRole.CLUB_MANAGER || to !== HorseStatus.RESTING) {
      deny(
        'HORSE_RETIRED',
        'Ngựa đã ngừng quản lý. Chỉ Quản lý CLB được kích hoạt lại về Nghỉ ngơi.',
      );
    }
    if (input.currentRetireReason === RetireReason.DECEASED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'HORSE_DECEASED',
        'Không thể kích hoạt lại hồ sơ ngựa đã chết.',
      );
    }
    requireReason(reason);
    return;
  }

  if (role === UserRole.CLUB_MANAGER) {
    if (to !== HorseStatus.RETIRED) {
      deny(
        'ROLE_RESTRICTION',
        'Quản lý CLB chỉ được Ngừng quản lý hoặc Kích hoạt lại. Trạng thái vận hành do HLV trưởng đổi, trạng thái y tế do Bác sĩ thú y đổi.',
      );
    }
    if (!input.retireReason) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'RETIRE_REASON_REQUIRED',
        'Vui lòng chọn lý do ngừng quản lý.',
      );
    }
    if (isMedicalLocked && input.retireReason !== RetireReason.DECEASED) {
      deny(
        'MEDICAL_LOCK_ACTIVE',
        'Ngựa đang Khóa huấn luyện: chỉ được Ngừng quản lý với lý do Đã chết.',
      );
    }
    requireReason(reason);
    return;
  }

  if (role === UserRole.HEAD_TRAINER) {
    if (!OPERATIONAL_STATUSES.includes(from) || !OPERATIONAL_STATUSES.includes(to)) {
      deny(
        'ROLE_RESTRICTION',
        'HLV trưởng chỉ được đổi giữa Nghỉ ngơi, Đang tập luyện và Sẵn sàng thi đấu.',
      );
    }
    if (isMedicalLocked) {
      deny('MEDICAL_LOCK_ACTIVE', 'Ngựa đang Khóa huấn luyện. Chỉ Bác sĩ thú y gỡ khóa ở Flow 3.');
    }
    return;
  }

  if (role === UserRole.VETERINARIAN) {
    const toMedical = MEDICAL_STATUSES.includes(to);
    // VET có thể đưa ngựa về RESTING từ nhóm y tế hoặc nhóm vận hành (khi điều trị/kết thúc bệnh án).
    // VET cũng có thể trả ngựa về IN_TRAINING nếu ngựa đang ở nhóm y tế.
    const canRest = to === HorseStatus.RESTING;
    const returnFromMedicalToTraining =
      MEDICAL_STATUSES.includes(from) && to === HorseStatus.IN_TRAINING;
    const backToWork = canRest || returnFromMedicalToTraining;

    if (!toMedical && !backToWork) {
      deny(
        'ROLE_RESTRICTION',
        'Bác sĩ thú y chỉ được đưa ngựa vào nhóm y tế, đổi trong nhóm y tế, hoặc trả về Nghỉ ngơi / Đang tập luyện.',
      );
    }
    if (backToWork && isMedicalLocked) {
      deny('MEDICAL_LOCK_ACTIVE', 'Ngựa đang Khóa huấn luyện. Hãy gỡ khóa ở Flow 3 trước.');
    }
    requireReason(reason);
    return;
  }

  deny('ROLE_RESTRICTION', 'Bạn không có quyền đổi trạng thái ngựa.');
}
