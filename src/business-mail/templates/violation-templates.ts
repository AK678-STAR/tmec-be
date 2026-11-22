import { BusinessMailContent, linkBase, renderMail } from './html';

/**
 * Templates nhóm VI PHẠM / KHÔNG ĐÚNG HẠN (NOTE.md §6.4) — kèm bằng chứng
 * (ảnh, log, ghi chú, người xác nhận). Tố cáo ≠ vi phạm: chỉ cảnh báo vi phạm
 * sau khi người có thẩm quyền xác nhận.
 */

export interface TaskLike {
  taskCode: string;
  title: string;
  date: string;
  scheduledTime?: string;
  status?: string;
  horseName?: string;
}
export interface ActorLike {
  name: string;
}
export interface ComplaintLike {
  code: string;
  reason: string;
  status: string;
  createdAt: Date | string;
}

const fmtDate = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString('vi-VN') : '—');

/** Template mồ côi #1 — giao việc quan trọng. */
export function taskAssigned(task: TaskLike, horseName: string | undefined, assignee: ActorLike): BusinessMailContent {
  return renderMail(`Được giao nhiệm vụ: ${task.taskCode}`, [
    { label: 'Mã task', value: task.taskCode },
    { label: 'Nội dung', value: task.title },
    { label: 'Ngựa', value: horseName || '—' },
    { label: 'Ngày / giờ', value: `${task.date} ${task.scheduledTime || ''}` },
    { label: 'Người được giao', value: assignee.name },
    { label: 'Vai trò', value: 'Chăm sóc theo quy định — cần hoàn thành đúng hạn' },
    { label: 'Xem công việc', value: `${linkBase()}/groom/today` },
  ]);
}

/** Template mồ côi #2 — việc sắp đến hạn (cron Task 7, 3h trước). */
export function taskDueSoon(task: TaskLike, assignee: ActorLike): BusinessMailContent {
  return renderMail(`Sắp đến hạn: ${task.taskCode}`, [
    { label: 'Mã task', value: task.taskCode },
    { label: 'Nội dung', value: task.title },
    { label: 'Hạn thực hiện', value: fmtDate(task.scheduledTime) },
    { label: 'Người phụ trách', value: assignee.name },
    { label: 'Trạng thái', value: 'Sắp đến hạn (3 giờ)' },
  ]);
}

/** Việc quá hạn (kèm mã, hạn gốc, lịch sử); nếu chưa giao → "cần phân công". */
export function taskOverdue(task: TaskLike, assignee: ActorLike | null, history?: string): BusinessMailContent {
  if (!assignee) {
    return renderMail(`Quá hạn — cần phân công: ${task.taskCode}`, [
      { label: 'Mã task', value: task.taskCode },
      { label: 'Nội dung', value: task.title },
      { label: 'Hạn gốc', value: fmtDate(task.scheduledTime) },
      { label: 'Trạng thái', value: 'Quá hạn, CHƯA có người nhận — cần phân công' },
      { label: 'Lịch sử', value: history || '—' },
    ]);
  }
  return renderMail(`Quá hạn: ${task.taskCode}`, [
    { label: 'Mã task', value: task.taskCode },
    { label: 'Nội dung', value: task.title },
    { label: 'Hạn gốc', value: fmtDate(task.scheduledTime) },
    { label: 'Người phụ trách', value: assignee.name },
    { label: 'Lịch sử giao / đổi', value: history || '—' },
    { label: 'Trạng thái', value: 'Quá hạn — cần làm bù' },
  ]);
}

/** Lặp lại nhiều lần → kèm quản lý phụ trách. */
export function repeatOverdue(user: ActorLike, taskCount: number, manager: ActorLike): BusinessMailContent {
  return renderMail(`Nhiều việc quá hạn lặp lại`, [
    { label: 'Người phụ trách', value: user.name },
    { label: 'Số việc quá hạn lặp lại', value: taskCount },
    { label: 'Quản lý phụ trách', value: manager.name },
    { label: 'Hành động', value: 'Quản lý cần xem xét và hỗ trợ / xử lý' },
  ]);
}

/** Template mồ côi #3 — việc bị yêu cầu làm lại (người kiểm tra, lý do, hạn mới). */
export function taskRejected(task: TaskLike, checker: ActorLike, reason: string, retryBy?: Date | string): BusinessMailContent {
  return renderMail(`Yêu cầu làm lại: ${task.taskCode}`, [
    { label: 'Mã task', value: task.taskCode },
    { label: 'Nội dung', value: task.title },
    { label: 'Người kiểm tra', value: checker.name },
    { label: 'Lý do', value: reason },
    { label: 'Hạn thực hiện lại', value: fmtDate(retryBy) },
    { label: 'Ghi chú / bằng chứng', value: 'Xem ảnh & log trong công việc' },
    { label: 'Xem công việc', value: `${linkBase()}/groom/today` },
  ]);
}

/** Tố cáo được tiếp nhận (người bị phản ánh nhận bản tóm tắt SỰ VIỆC, không quy kết). */
export function complaintFiled(complaint: ComplaintLike, handler: ActorLike): BusinessMailContent {
  return renderMail(`Có phản ánh liên quan đến bạn: ${complaint.code}`, [
    { label: 'Mã phản ánh', value: complaint.code },
    { label: 'Nội dung phản ánh', value: complaint.reason },
    { label: 'Thời điểm', value: fmtDate(complaint.createdAt) },
    { label: 'Người xử lý', value: handler.name },
    { label: 'Lưu ý', value: 'Phản ánh chưa phải kết luận vi phạm — vui lòng hợp tác giải trình' },
    { label: 'Xem chi tiết', value: `${linkBase()}/complaints` },
  ]);
}

/** Yêu cầu giải trình (UNDER_REVIEW) cho người bị phản ánh. */
export function reviewRequested(complaint: ComplaintLike, subject: ActorLike, deadline?: Date | string): BusinessMailContent {
  return renderMail(`Yêu cầu giải trình: ${complaint.code}`, [
    { label: 'Mã phản ánh', value: complaint.code },
    { label: 'Nội dung', value: complaint.reason },
    { label: 'Đối tượng', value: subject.name },
    { label: 'Hạn phản hồi', value: fmtDate(deadline) },
    { label: 'Bằng chứng', value: 'Xem ảnh / log / hồ sơ được đính kèm' },
    { label: 'Xem chi tiết', value: `${linkBase()}/complaints` },
  ]);
}

/** CHỈ gửi sau khi CM/VET xác nhận VIOLATION_CONFIRMED. */
export function violationConfirmed(
  complaint: ComplaintLike,
  subject: ActorLike,
  confirmer: ActorLike,
  measures?: string,
): BusinessMailContent {
  return renderMail(`Kết luận vi phạm đã xác nhận: ${complaint.code}`, [
    { label: 'Mã phản ánh', value: complaint.code },
    { label: 'Đối tượng', value: subject.name },
    { label: 'Người xác nhận', value: confirmer.name },
    { label: 'Nội dung', value: complaint.reason },
    { label: 'Quy định liên quan', value: 'Quy tắc chăm sóc & quy định nội bộ (link: /complaints)' },
    { label: 'Biện pháp xử lý', value: measures || 'Đang xử lý theo quy định' },
    { label: 'Bằng chứng', value: 'Ảnh, log, ghi chú được đính kèm' },
  ]);
}
