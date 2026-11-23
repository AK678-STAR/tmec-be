import { renderMail } from './html';
import { invoiceIssued, dueSoon, paymentFailed, refundNotice, overdue7 } from './billing-templates';
import {
  stallMove,
  stallMoveCompleted,
  incidentReported,
  incidentConfirmed,
  lockChanged,
  followUpDue,
  medicalTaskOverdue,
  prizeWon,
} from './health-templates';
import {
  taskAssigned,
  taskDueSoon,
  taskOverdue,
  taskRejected,
  complaintFiled,
  violationConfirmed,
} from './violation-templates';
import {
  admissionRequestReceived,
  admissionAppointmentScheduled,
  admissionApproved,
  admissionRejected,
} from './admission-templates';

const inv = {
  id: 'INV-1',
  billingPeriod: '2026-07',
  boardingFee: 5000000,
  medicalFee: 300000,
  trainingFee: 2000000,
  prizeCredit: 1000000,
  netAmount: 6300000,
  dueAt: new Date('2026-07-31T00:00:00Z'),
  status: 'SENT',
};
const horse = { id: 'h1', name: 'Silver Bolt' };
const owner = { id: 'o1', fullName: 'Trần Văn Chủ' };
const groom = { name: 'Lê Groom' };
const vet = { name: 'BS Phạm' };

describe('billing templates', () => {
  it('invoiceIssued contains net amount + period + owner', () => {
    const m = invoiceIssued(inv, horse, owner);
    expect(m.subject).toContain('2026-07');
    expect(m.text).toContain(owner.fullName);
    expect(m.text).toContain('6.300.000' /* vi-VN: dot separator */);
    expect(m.html).toContain('Silver Bolt');
  });

  it('dueSoon flags status as sắp đến hạn', () => {
    const m = dueSoon(inv, horse, owner);
    expect(m.text).toContain('Sắp đến hạn');
  });

  it('overdue7 shows reminded count + consequence', () => {
    const m = overdue7(inv, owner, 3);
    expect(m.text).toContain('đã nhắc 3 lần');
    expect(m.text).toContain('Hậu quả');
    expect(m.subject).not.toContain('trước khi áp dụng');
    expect(m.text).toContain('Kiểm tra hạn chế dịch vụ');
  });

  it('paymentFailed NEVER says "đã thanh toán" / "xác nhận" (Review Focus)', () => {
    const m = paymentFailed(inv, 'TX-999');
    expect(m.text).toContain('Thất bại');
    expect(m.text.toLowerCase()).not.toContain('đã thanh toán');
    expect(m.text.toLowerCase()).not.toContain('xác nhận');
    expect(m.text).toContain('TX-999');
  });

  it('refundNotice shows old/new/adjusted amounts + reason', () => {
    const m = refundNotice(inv, 6300000, 4300000, 'Giảm phí y tế', owner);
    expect(m.text).toContain('Giảm phí y tế');
    expect(m.text).toContain('2.000.000' /* adjusted, vi-VN dot separator */);
  });
});

describe('health / stall / prize templates', () => {
  it('stallMove shows old/new stall + reason + issuer', () => {
    const m = stallMove(horse, { code: 'A-01' }, { code: 'A-12' }, 'Khu cũ bảo trì', new Date(), {
      id: 'x',
      name: 'CM An',
    });
    expect(m.text).toContain('A-01');
    expect(m.text).toContain('A-12');
    expect(m.text).toContain('CM An');
  });

  it('stallMoveCompleted shows performer + time + evidence (NOTE 6.3 line 2)', () => {
    const m = stallMoveCompleted(
      horse,
      { code: 'A-12' },
      { id: 'g', name: 'Lê Groom' },
      new Date('2026-07-09T12:00:00Z'),
      'đã kiểm tra sức ngựa',
      'https://tmec/e1.jpg',
    );
    expect(m.text).toContain('Lê Groom');
    expect(m.text).toContain('đã kiểm tra sức ngựa');
    expect(m.text).toContain('e1.jpg');
  });

  it('incidentReported marks UNCONFIRMED (no vet verdict yet)', () => {
    const m = incidentReported({ incidentNumber: 'INC-1', severity: 'HIGH' }, horse, {
      name: 'Groom B',
    });
    expect(m.text.toLowerCase()).toContain('chưa được bác sĩ xác nhận');
  });

  it('incidentConfirmed shows vet verdict + restrictions', () => {
    const m = incidentConfirmed(
      { incidentNumber: 'INC-1', vetNotes: 'Đầu gối sưng nhẹ', status: 'CONFIRMED' },
      horse,
      vet,
      'nghỉ 2 tuần',
    );
    expect(m.text).toContain('BS Phạm');
    expect(m.text).toContain('nghỉ 2 tuần');
  });

  it('lockChanged on release lists remaining active locks (Review Focus #5)', () => {
    const m = lockChanged(horse, { type: 'EXERCISE_LOCK' }, 'released', vet, [
      'MEDICATION_LOCK',
      'ICING_LOCK',
    ]);
    expect(m.text).toContain('Gỡ khóa');
    expect(m.text).toContain('MEDICATION_LOCK');
    expect(m.text).toContain('ICING_LOCK');
  });

  it('followUpDue shows procedure + due date', () => {
    const m = followUpDue({ dueAt: '2026-07-15', procedure: 'X-quang' }, horse, vet);
    expect(m.text).toContain('X-quang');
  });

  it('medicalTaskOverdue shows task code', () => {
    const m = medicalTaskOverdue(
      { taskCode: 'M-ICE-1', title: 'Đắp đá lạnh', scheduledTime: '07:30' },
      horse,
    );
    expect(m.text).toContain('M-ICE-1');
  });

  it('prizeWon shows payout only meaningful when settled (NOTE 6.2)', () => {
    const settled = prizeWon(
      { finalRank: 2, prizeMoneyWon: 10000000, netOwnerPayout: 8500000, settledAt: new Date() },
      { name: 'Giải A' },
      horse,
    );
    expect(settled.text).toContain('Đã xác nhận');
    expect(settled.text).toContain('8.500.000');

    const unsettled = prizeWon(
      { finalRank: 1, prizeMoneyWon: 20000000, netOwnerPayout: 17000000, settledAt: null },
      { name: 'Giải B' },
      horse,
    );
    expect(unsettled.text).toContain('chờ chốt');
  });
});

describe('violation templates', () => {
  const task = {
    taskCode: 'T-1',
    title: 'Vệ sinh chuồng',
    date: '2026-07-08',
    scheduledTime: '07:00',
  };

  it('taskAssigned names assignee + task', () => {
    const m = taskAssigned(task, 'Silver Bolt', groom);
    expect(m.text).toContain('T-1');
    expect(m.text).toContain('Lê Groom');
  });

  it('taskDueSoon shows the deadline window', () => {
    const m = taskDueSoon(task, groom);
    expect(m.text).toContain('Sắp đến hạn');
  });

  it('taskOverdue with no assignee says "cần phân công" (Review Focus #3)', () => {
    const m = taskOverdue(task, null, 'giao lúc 05:00');
    expect(m.text).toContain('CHƯA có người nhận');
    expect(m.text).toContain('cần phân công');
  });

  it('taskOverdue with assignee shows original deadline + history', () => {
    const m = taskOverdue(task, groom, 'giao 05:00, đổi 06:00');
    expect(m.text).toContain('Hạn gốc');
    expect(m.text).toContain('đổi 06:00');
  });

  it('taskRejected shows checker + reason + retry deadline (orphan #3)', () => {
    const m = taskRejected(task, { name: 'Trưởng ca' }, 'làm chưa đạt', new Date('2026-07-09'));
    expect(m.subject).toContain('làm lại');
    expect(m.text).toContain('Trưởng ca');
    expect(m.text).toContain('làm chưa đạt');
  });

  it('complaintFiled does NOT conclude violation (NOTE 6.4)', () => {
    const m = complaintFiled(
      { code: 'CMP-1', reason: 'Không cho ăn đúng giờ', status: 'OPEN', createdAt: new Date() },
      { name: 'CM An' },
    );
    expect(m.text).toContain('chưa phải kết luận');
  });

  it('violationConfirmed names confirmer + measures', () => {
    const m = violationConfirmed(
      {
        code: 'CMP-1',
        reason: 'bỏ chăm sóc',
        status: 'VIOLATION_CONFIRMED',
        createdAt: new Date(),
      },
      groom,
      { name: 'CM An' },
      'cảnh cáo',
    );
    expect(m.text).toContain('CM An');
    expect(m.text).toContain('cảnh cáo');
  });
});

describe('safe mail markup', () => {
  it('escapes untrusted names and keeps plain text readable', () => {
    const unsafe = '<img src=x onerror=alert(1)> & text';
    const output = renderMail(unsafe, [{ label: unsafe, value: unsafe }]);
    expect(output.html).not.toContain('<img');
    expect(output.html).toContain('&lt;img');
    expect(output.html).toContain('&amp; text');
    expect(output.text).toContain(unsafe);
  });
});

describe('admission templates (ADM-03)', () => {
  const admMock = {
    id: 'adm-101',
    admissionCode: 'ADM-2026-001',
    declaredMicrochip: '985123456789012',
    scannedMicrochip: '985123456789012',
    appointmentDate: new Date('2026-11-25T09:00:00Z'),
    appointmentNotes: 'Vui lòng đến đúng giờ tại cổng A',
    rejectionReason: 'Chưa đủ giấy tờ phả hệ gốc và sổ tiêm chủng',
    admittedAt: new Date('2026-11-25T11:00:00Z'),
    createdAt: new Date('2026-11-23T08:00:00Z'),
  };
  const horseMock = { id: 'h1', name: 'Đại Bàng Lửa', microchip: '985123456789012' };
  const ownerMock = { id: 'o1', fullName: 'Nguyễn Văn Chủ' };

  it('admissionRequestReceived generates proper subject and escaped html', () => {
    const m = admissionRequestReceived(admMock, horseMock, ownerMock);
    expect(m.subject).toContain('Đại Bàng Lửa');
    expect(m.subject).toContain('[EquiFlow]');
    expect(m.text).toContain('ADM-2026-001');
    expect(m.text).toContain('Nguyễn Văn Chủ');
    expect(m.html).toContain('ADM-2026-001');
    expect(m.html).toContain('Đại Bàng Lửa');
  });

  it('admissionAppointmentScheduled includes Gate A and appointment instructions', () => {
    const m = admissionAppointmentScheduled(admMock, horseMock, ownerMock);
    expect(m.subject).toContain('Lịch hẹn thẩm định tiếp nhận ngựa');
    expect(m.text).toContain('Trạm kiểm định Cổng A — CLB Đua Ngựa EquiFlow');
    expect(m.text).toContain('Giấy chứng nhận phả hệ');
    expect(m.html).toContain('Cổng A');
    expect(m.html).toContain('Vui lòng đến đúng giờ tại cổng A');
  });

  it('admissionApproved indicates RESTING status and microchip confirmation', () => {
    const m = admissionApproved(admMock, horseMock, ownerMock, 'BS Nguyễn Thú Y');
    expect(m.subject).toContain('Chúc mừng: Chiến mã Đại Bàng Lửa đã chính thức gia nhập CLB');
    expect(m.text).toContain('RESTING');
    expect(m.text).toContain('985123456789012');
    expect(m.text).toContain('BS Nguyễn Thú Y');
    expect(m.html).toContain('RESTING');
  });

  it('admissionRejected includes rejection reason and remedy guidance', () => {
    const m = admissionRejected(admMock, horseMock, ownerMock);
    expect(m.subject).toContain('Thông báo kết quả thẩm định tiếp nhận ngựa');
    expect(m.text).toContain('Chưa đủ giấy tờ phả hệ gốc và sổ tiêm chủng');
    expect(m.text).toContain('nộp lại đơn đăng ký tiếp nhận sau');
    expect(m.html).toContain('Chưa đủ giấy tờ phả hệ gốc');
  });

  it('properly escapes XSS payloads in admission templates', () => {
    const xssHorse = { id: 'h2', name: '<script>alert("hacked")</script>' };
    const xssReason = {
      ...admMock,
      rejectionReason: '<b onmouseover=alert(1)>Lỗi</b> & nguy hiểm',
    };
    const m = admissionRejected(xssReason, xssHorse, ownerMock);
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).not.toContain('<b onmouseover');
    expect(m.html).toContain('&lt;b');
    expect(m.html).toContain('&amp; nguy hiểm');
  });
});
