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
}

const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';

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
    { label: 'Xem bảng chuồng', value: `${linkBase()}/club/stalls` },
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
    { label: 'Xem lịch sử bàn giao', value: `${linkBase()}/club/stalls` },
  ]);
}

/** 6.3 dòng 3 — báo sự cố (Vet+CM+HLV+Groom khu), ghi rõ CHƯA được Vet xác nhận. */
export function incidentReported(incident: { incidentNumber: string | null; severity: string }, horse: HorseLike, reporter: ActorLike): BusinessMailContent {
  return renderMail(`Sự cố sức khỏe cần xác minh — ${horse.name}`, [
    { label: 'Mã sự cố', value: incident.incidentNumber },
    { label: 'Ngựa', value: horse.name },
    { label: 'Mức độ', value: incident.severity },
    { label: 'Người báo', value: reporter.name },
    { label: 'Trạng thái', value: 'Chưa được Bác sĩ xác nhận — chờ xác minh' },
    { label: 'Xem hồ sơ sự cố', value: `${linkBase()}/medical/incidents` },
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
    { label: 'Bác sĩ xác nhận', value: reviewer.name },
    { label: 'Trạng thái', value: incident.status },
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
  const actionLabel = action === 'planned' ? 'Đặt khóa y tế' : action === 'extended' ? 'Gia hạn khóa y tế' : 'Gỡ khóa y tế';
  const rows = [
    { label: 'Ngựa', value: horse.name },
    { label: 'Loại khóa', value: lock.type },
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
export function followUpDue(schedule: { dueAt: Date | string; procedure: string }, horse: HorseLike, assignedTo?: ActorLike): BusinessMailContent {
  return renderMail(`Đến hạn tái khám — ${horse.name}`, [
    { label: 'Thủ tục', value: schedule.procedure },
    { label: 'Hạn tái khám', value: fmtDate(schedule.dueAt) },
    { label: 'Người phụ trách', value: assignedTo?.name || 'Chưa phân công' },
    { label: 'Xem lịch y tế', value: `${linkBase()}/medical/preventive` },
  ]);
}

/** 6.3 dòng 6 — bỏ lỡ y lệnh (thuốc/chăm sóc y tế) quá hạn. */
export function medicalTaskOverdue(task: { taskCode: string; title: string; scheduledTime?: string }, horse: HorseLike): BusinessMailContent {
  return renderMail(`Bỏ lỡ y lệnh — ${horse.name}`, [
    { label: 'Mã task', value: task.taskCode },
    { label: 'Nội dung', value: task.title },
    { label: 'Lịch dự kiến', value: task.scheduledTime || '—' },
    { label: 'Hành động', value: 'Vui lòng thực hiện bù và báo bác sĩ phụ trách' },
    { label: 'Xem công việc y tế', value: `${linkBase()}/groom/today` },
  ]);
}

/** §6.2 tiền thưởng — chỉ khi settledAt có (đã công bố chính thức). */
export function prizeWon(
  result: { finalRank: number; prizeMoneyWon: number; netOwnerPayout: number; settledAt: Date | null },
  tournament: { name: string },
  horse: HorseLike,
): BusinessMailContent {
  const fmtVnd = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
  return renderMail(`Tiền thưởng đã xác nhận — ${horse.name}`, [
    { label: 'Giải đấu', value: tournament.name },
    { label: 'Hạng', value: `Thứ ${result.finalRank}` },
    { label: 'Tiền thưởng', value: fmtVnd(result.prizeMoneyWon) },
    { label: 'Tiền thực nhận (sau trích)', value: fmtVnd(result.netOwnerPayout) },
    { label: 'Trạng thái', value: result.settledAt ? 'Đã xác nhận (settled)' : 'Đã công bố — chờ chốt kỳ' },
    { label: 'Xem báo cáo tài chính', value: `${linkBase()}/owner/financial` },
  ]);
}
