import { BusinessMailContent, linkBase, renderMail } from './html';

/**
 * Templates nhóm CHUỒNG / SỨC KHỎE / THÀNH TÍCH (NOTE.md §6.3 + §6.2 tiền thưởng).
 */

export interface StallLike {
  code: string;
  zoneName?: string;
}
export interface ActorLike {
  name: string;
  id?: string;
}
export interface HorseLike {
  id: string;
  name: string;
  status?: string | null;
}

const HORSE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Sẵn sàng thi đấu (ACTIVE)',
  IN_TRAINING: 'Đang huấn luyện (IN_TRAINING)',
  UNDER_OBSERVATION: 'Đang theo dõi y tế (UNDER_OBSERVATION)',
  INJURED: 'Đang chấn thương (INJURED)',
  ISOLATED: 'Đang cách ly y tế (ISOLATED)',
  RESTING: 'Đang nghỉ ngơi (RESTING)',
  RETIRED: 'Đã nghỉ hưu / Xuất chuồng (RETIRED)',
  PENDING_ADMISSION: 'Chờ thẩm định tiếp nhận (PENDING_ADMISSION)',
  REJECTED: 'Từ chối tiếp nhận (REJECTED)',
};

const INCIDENT_STATUS_LABELS: Record<string, string> = {
  REPORTED: 'Mới ghi nhận — chờ xác minh (REPORTED)',
  OPEN: 'Đang mở (OPEN)',
  CONFIRMED: 'Bác sĩ đã xác nhận (CONFIRMED)',
  UNDER_TREATMENT: 'Đang điều trị (UNDER_TREATMENT)',
  MONITORING: 'Đang theo dõi hồi phục (MONITORING)',
  RESOLVED: 'Đã hồi phục (RESOLVED)',
  CLOSED: 'Đã đóng hồ sơ (CLOSED)',
};

const LOCK_TYPE_LABELS: Record<string, string> = {
  TRAINING_LOCK: 'Khóa huấn luyện (TRAINING_LOCK)',
  EXERCISE_LOCK: 'Khóa vận động / bài tập (EXERCISE_LOCK)',
  RACING_LOCK: 'Khóa thi đấu (RACING_LOCK)',
  ISOLATION_LOCK: 'Khóa cách ly (ISOLATION_LOCK)',
  MEDICATION_LOCK: 'Khóa đang dùng thuốc (MEDICATION_LOCK)',
  ICING_LOCK: 'Khóa chườm lạnh / hồi phục (ICING_LOCK)',
  MEDICAL_LOCK: 'Khóa y tế tổng quát (MEDICAL_LOCK)',
  DEBT_IMPOUND: 'Khóa công nợ quá hạn (DEBT_IMPOUND)',
};

const formatHorseStatus = (status?: string | null) =>
  status ? HORSE_STATUS_LABELS[status] || status : null;

const formatIncidentStatus = (status: string) => INCIDENT_STATUS_LABELS[status] || status;

const formatLockType = (type: string) => LOCK_TYPE_LABELS[type] || type;

const fmtDate = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Ho_Chi_Minh',
      })
    : '—';

/** 6.3 dòng 1 — BAN HÀNH đổi chuồng. */
export function stallMove(
  horse: HorseLike,
  oldStall: StallLike,
  newStall: StallLike,
  reason: string,
  effectiveAt: Date | string,
  actor: ActorLike,
): BusinessMailContent {
  return renderMail(`Đổi chuồng — ${horse.name}`, [
    { label: 'Ngựa', value: horse.name },
    { label: 'Chuồng cũ', value: oldStall.code },
    { label: 'Chuồng mới', value: newStall.code },
    { label: 'Lý do', value: reason },
    { label: 'Thời điểm hiệu lực', value: fmtDate(effectiveAt) },
    { label: 'Người ban hành', value: actor.name },
    { label: 'Xem bảng chuồng', value: `${linkBase()}/stalls` },
  ]);
}

/** 6.3 dòng 2 — HOÀN TẤT bàn giao chuồng (CM + các bên liên quan). */
export function stallMoveCompleted(
  horse: HorseLike,
  newStall: StallLike,
  completedBy: ActorLike,
  at: Date | string,
  notes?: string,
  evidenceUrl?: string,
): BusinessMailContent {
  return renderMail(`Hoàn tất bàn giao chuồng — ${horse.name}`, [
    { label: 'Ngựa', value: horse.name },
    { label: 'Chuồng tiếp nhận', value: newStall.code },
    { label: 'Người thực hiện', value: completedBy.name },
    { label: 'Thời điểm bàn giao', value: fmtDate(at) },
    { label: 'Ghi chú', value: notes || 'Không có ghi chú' },
    { label: 'Ảnh bằng chứng', value: evidenceUrl || 'Không đính kèm' },
    { label: 'Xem lịch sử bàn giao', value: `${linkBase()}/stalls` },
  ]);
}

/** 6.3 dòng 3 — báo sự cố (Vet+CM+HLV+Groom khu), ghi rõ CHƯA được Vet xác nhận. */
export function incidentReported(
  incident: { incidentNumber: string | null; severity: string },
  horse: HorseLike,
  reporter: ActorLike,
): BusinessMailContent {
  return renderMail(`Sự cố sức khỏe cần xác minh — ${horse.name}`, [
    { label: 'Mã sự cố', value: incident.incidentNumber },
    { label: 'Ngựa', value: horse.name },
    { label: 'Mức độ', value: incident.severity },
    { label: 'Người báo', value: reporter.name },
    { label: 'Trạng thái', value: 'Chưa được Bác sĩ xác nhận — chờ xác minh' },
    { label: 'Xem hồ sơ sự cố', value: `${linkBase()}/incidents` },
  ]);
}

/** 6.3 dòng 3 — Vet xác nhận kết luận (owner+CM+HLV+Groom), kèm hướng dẫn + hạn chế. */
export function incidentConfirmed(
  incident: { incidentNumber: string | null; vetNotes: string | null; status: string },
  horse: HorseLike,
  reviewer: ActorLike,
  restrictions?: string,
): BusinessMailContent {
  return renderMail(`Kết luận y tế đã xác nhận — ${horse.name}`, [
    { label: 'Mã sự cố', value: incident.incidentNumber },
    { label: 'Ngựa', value: horse.name },
    { label: 'Tình trạng ngựa', value: formatHorseStatus(horse.status) },
    { label: 'Bác sĩ xác nhận', value: reviewer.name },
    { label: 'Trạng thái sự cố', value: formatIncidentStatus(incident.status) },
    { label: 'Kết luận / hướng dẫn', value: incident.vetNotes || 'Xem hồ sơ y tế' },
    { label: 'Hạn chế áp dụng', value: restrictions || 'Không có hạn chế mới' },
    { label: 'Xem hồ sơ y tế', value: `${linkBase()}/medical` },
  ]);
}

export type LockAction = 'planned' | 'extended' | 'released';

/** 6.3 dòng 4 — đặt / gia hạn / gỡ khóa y tế. Khi gỡ: báo còn khóa nào khác không. */
export function lockChanged(
  horse: HorseLike,
  lock: { type: string; reason?: string; expiresAt?: Date | string | null },
  action: LockAction,
  actor: ActorLike,
  remainingActiveLocks: string[] = [],
): BusinessMailContent {
  const actionLabel =
    action === 'planned'
      ? 'Đặt khóa y tế'
      : action === 'extended'
        ? 'Gia hạn khóa y tế'
        : 'Gỡ khóa y tế';
  const rows = [
    { label: 'Ngựa', value: horse.name },
    { label: 'Tình trạng ngựa', value: formatHorseStatus(horse.status) },
    { label: 'Loại khóa', value: formatLockType(lock.type) },
    { label: 'Lý do', value: lock.reason || null },
    { label: 'Thời điểm hết hiệu lực', value: fmtDate(lock.expiresAt) },
    { label: 'Người thực hiện', value: actor.name },
  ];
  if (action === 'released' && remainingActiveLocks.length > 0) {
    rows.push({ label: 'Vẫn đang áp dụng', value: remainingActiveLocks.join(', ') });
  }
  rows.push({ label: 'Trạng thái', value: actionLabel });
  rows.push({ label: 'Xem khóa y tế', value: `${linkBase()}/medical/locks` });
  return renderMail(`${actionLabel} — ${horse.name}`, rows);
}

/** 6.3 dòng 5 — đến hạn tái khám. */
export function followUpDue(
  schedule: { dueAt: Date | string; procedure: string },
  horse: HorseLike,
  assignedTo?: ActorLike,
): BusinessMailContent {
  return renderMail(`Đến hạn tái khám — ${horse.name}`, [
    { label: 'Thủ tục', value: schedule.procedure },
    { label: 'Hạn tái khám', value: fmtDate(schedule.dueAt) },
    { label: 'Người phụ trách', value: assignedTo?.name || 'Chưa phân công' },
    { label: 'Xem lịch y tế', value: `${linkBase()}/medical/preventive` },
  ]);
}

/** 6.3 dòng 6 — bỏ lỡ y lệnh (thuốc/chăm sóc y tế) quá hạn. */
export function medicalTaskOverdue(
  task: { taskCode: string; title: string; scheduledTime?: string },
  horse: HorseLike,
): BusinessMailContent {
  return renderMail(`Bỏ lỡ y lệnh — ${horse.name}`, [
    { label: 'Mã task', value: task.taskCode },
    { label: 'Nội dung', value: task.title },
    { label: 'Lịch dự kiến', value: task.scheduledTime || '—' },
    { label: 'Hành động', value: 'Vui lòng thực hiện bù và báo bác sĩ phụ trách' },
    { label: 'Xem công việc y tế', value: `${linkBase()}/tasks` },
  ]);
}

/** §6.2 tiền thưởng — chỉ khi settledAt có (đã công bố chính thức). */
export function prizeWon(
  result: {
    finalRank: number;
    prizeMoneyWon: number;
    netOwnerPayout: number;
    settledAt: Date | null;
  },
  tournament: { name: string },
  horse: HorseLike,
): BusinessMailContent {
  const fmtVnd = (n: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
  return renderMail(`Tiền thưởng đã xác nhận — ${horse.name}`, [
    { label: 'Giải đấu', value: tournament.name },
    { label: 'Hạng', value: `Thứ ${result.finalRank}` },
    { label: 'Tiền thưởng', value: fmtVnd(result.prizeMoneyWon) },
    { label: 'Tiền thực nhận (sau trích)', value: fmtVnd(result.netOwnerPayout) },
    {
      label: 'Trạng thái',
      value: result.settledAt ? 'Đã xác nhận (settled)' : 'Đã công bố — chờ chốt kỳ',
    },
    { label: 'Xem báo cáo tài chính', value: `${linkBase()}/financial-reports` },
  ]);
}

/** Thông báo kê đơn / cập nhật đơn thuốc gửi Chủ ngựa & Groom. */
export function prescriptionIssued(
  horse: HorseLike,
  rx: { med: string; dose: string; perDay: number; days: number; start: string },
  vet: ActorLike,
  isUpdate = false,
): BusinessMailContent {
  const title = isUpdate ? `Cập nhật đơn thuốc — ${horse.name}` : `Đơn thuốc mới — ${horse.name}`;
  return renderMail(title, [
    { label: 'Ngựa', value: horse.name },
    { label: 'Tình trạng ngựa', value: formatHorseStatus(horse.status) },
    { label: 'Thuốc kê đơn', value: rx.med },
    { label: 'Liều lượng', value: `${rx.dose} (${rx.perDay} lần/ngày × ${rx.days} ngày)` },
    { label: 'Ngày bắt đầu', value: rx.start },
    { label: 'Bác sĩ chỉ định', value: vet.name },
    { label: 'Xem hồ sơ y tế', value: `${linkBase()}/medical` },
  ]);
}

/** Thông báo đăng ký thi đấu gửi Chủ ngựa. */
export function raceRegistered(
  horse: HorseLike,
  tournament: { name: string; startDate?: Date | string | null },
  actor: ActorLike,
): BusinessMailContent {
  return renderMail(`Đăng ký thi đấu thành công — ${horse.name}`, [
    { label: 'Ngựa', value: horse.name },
    { label: 'Tình trạng ngựa', value: formatHorseStatus(horse.status) },
    { label: 'Giải đấu', value: tournament.name },
    { label: 'Ngày khởi tranh', value: fmtDate(tournament.startDate) },
    { label: 'Người thực hiện', value: actor.name },
    { label: 'Xem lịch thi đấu', value: `${linkBase()}/races` },
  ]);
}
