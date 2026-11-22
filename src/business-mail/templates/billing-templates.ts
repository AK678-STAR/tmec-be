import { BusinessMailContent, linkBase, renderMail } from './html';

/**
 * Templates nhóm TÀI CHÍNH (NOTE.md §6.2) — gửi riêng cho chủ ngựa (hoặc CM khi
 * nhắc nợ), kèm mã hóa đơn / mã giao dịch / số tiền để đối chiếu.
 */

export interface BillingInvoiceLike {
  id: string;
  billingPeriod: string;
  boardingFee: number;
  medicalFee?: number;
  trainingFee?: number;
  prizeCredit?: number;
  netAmount: number;
  dueAt: Date | string | null;
  status: string;
}
export interface HorseLike {
  id: string;
  name: string;
}
export interface OwnerLike {
  id: string;
  fullName: string;
}

const fmtVnd = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
const fmtDate = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—');

export function invoiceIssued(inv: BillingInvoiceLike, horse: HorseLike, owner: OwnerLike): BusinessMailContent {
  return renderMail(`Hóa đơn ${inv.billingPeriod} — ${horse.name}`, [
    { label: 'Chủ ngựa', value: owner.fullName },
    { label: 'Mã hóa đơn', value: inv.id },
    { label: 'Kỳ tính phí', value: inv.billingPeriod },
    { label: 'Phí chuồng', value: fmtVnd(inv.boardingFee) },
    { label: 'Phí y tế', value: inv.medicalFee ? fmtVnd(inv.medicalFee) : null },
    { label: 'Phí huấn luyện', value: inv.trainingFee ? fmtVnd(inv.trainingFee) : null },
    { label: 'Cấn trừ tiền thưởng', value: inv.prizeCredit ? fmtVnd(inv.prizeCredit) : null },
    { label: 'Số tiền cần thanh toán', value: fmtVnd(inv.netAmount) },
    { label: 'Hạn thanh toán', value: fmtDate(inv.dueAt) },
    { label: 'Xem hóa đơn', value: `${linkBase()}/owner/invoices` },
  ]);
}

export function dueSoon(inv: BillingInvoiceLike, horse: HorseLike, owner: OwnerLike): BusinessMailContent {
  return renderMail(`Nhắc hạn thanh toán — ${horse.name}`, [
    { label: 'Kỳ tính phí', value: inv.billingPeriod },
    { label: 'Số tiền', value: fmtVnd(inv.netAmount) },
    { label: 'Hạn thanh toán', value: fmtDate(inv.dueAt) },
    { label: 'Trạng thái', value: 'Sắp đến hạn' },
    { label: 'Xem / thanh toán', value: `${linkBase()}/owner/invoices` },
  ]);
}

export function dueDay(inv: BillingInvoiceLike, horse: HorseLike, owner: OwnerLike): BusinessMailContent {
  return renderMail(`Đến hạn thanh toán — ${horse.name}`, [
    { label: 'Kỳ tính phí', value: inv.billingPeriod },
    { label: 'Số tiền', value: fmtVnd(inv.netAmount) },
    { label: 'Ngày đến hạn', value: fmtDate(inv.dueAt) },
    { label: 'Xem / thanh toán', value: `${linkBase()}/owner/invoices` },
  ]);
}

export function overdue3(inv: BillingInvoiceLike, owner: OwnerLike): BusinessMailContent {
  return renderMail(`Quá hạn 3 ngày — cần thanh toán`, [
    { label: 'Chủ ngựa', value: owner.fullName },
    { label: 'Kỳ tính phí', value: inv.billingPeriod },
    { label: 'Số tiền', value: fmtVnd(inv.netAmount) },
    { label: 'Trạng thái', value: 'Quá hạn 3 ngày' },
    { label: 'Xem / thanh toán', value: `${linkBase()}/owner/invoices` },
  ]);
}

export function overdue7(inv: BillingInvoiceLike, owner: OwnerLike, remindedTimes: number): BusinessMailContent {
  return renderMail(`Quá hạn 7 ngày — cuối cùng trước khi áp dụng hạn chế`, [
    { label: 'Chủ ngựa', value: owner.fullName },
    { label: 'Kỳ tính phí', value: inv.billingPeriod },
    { label: 'Số tiền', value: fmtVnd(inv.netAmount) },
    { label: 'Trạng thái', value: `Quá hạn 7 ngày (đã nhắc ${remindedTimes} lần)` },
    { label: 'Hậu quả', value: 'Ngừng một số dịch vụ nếu không thanh toán' },
    { label: 'Xem / thanh toán', value: `${linkBase()}/owner/invoices` },
  ]);
}

/** 6.2 dòng 346 — thanh toán THẤT BẠI. KHÔNG được chứa "đã thanh toán / xác nhận". */
export function paymentFailed(inv: BillingInvoiceLike, transactionRef: string | null): BusinessMailContent {
  return renderMail(`Thanh toán thất bại — ${inv.billingPeriod}`, [
    { label: 'Mã giao dịch', value: transactionRef || '—' },
    { label: 'Kỳ tính phí', value: inv.billingPeriod },
    { label: 'Số tiền cần thanh toán', value: fmtVnd(inv.netAmount) },
    { label: 'Trạng thái', value: 'Thất bại' },
    { label: 'Hành động', value: 'Vui lòng thử lại hoặc kiểm tra tài khoản ngân hàng' },
    { label: 'Xem / thanh toán lại', value: `${linkBase()}/owner/invoices` },
  ]);
}

/** 6.2 dòng 347 — điều chỉnh / hoàn tiền. Chứng từ gốc, lý do, số tiền, chứng từ thay thế. */
export function refundNotice(
  inv: BillingInvoiceLike,
  oldAmount: number,
  newAmount: number,
  reason: string,
  owner: OwnerLike,
): BusinessMailContent {
  const adjusted = oldAmount - newAmount;
  return renderMail(`Điều chỉnh / hoàn tiền — ${inv.billingPeriod}`, [
    { label: 'Chủ ngựa', value: owner.fullName },
    { label: 'Mã chứng từ gốc', value: inv.id },
    { label: 'Lý do', value: reason },
    { label: 'Số tiền gốc', value: fmtVnd(oldAmount) },
    { label: 'Số tiền mới', value: fmtVnd(newAmount) },
    { label: 'Số tiền điều chỉnh', value: fmtVnd(adjusted) },
    { label: 'Chứng từ thay thế', value: `${linkBase()}/owner/invoices` },
  ]);
}
