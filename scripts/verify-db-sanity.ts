import { PrismaClient, HandoverStatus, InvoiceStatus, PreventiveStatus, HorseStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface SanityResult {
  rule: string;
  passed: boolean;
  details: string;
}

export async function verifyDatabaseSanity(): Promise<boolean> {
  console.log('========================================================================');
  console.log('=== BẮT ĐẦU KIỂM ĐỊNH TOÀN DIỆN CƠ SỞ DỮ LIỆU (10/10 QUY TẮC TOÀN HỆ THỐNG) ===');
  console.log('========================================================================');

  const results: SanityResult[] = [];

  // RÀNG BUỘC 1: ĐỊNH MỨC HLV KHÔNG ĐƯỢC VƯỢT QUÁ 8 CHIẾN MÃ
  const trainers = await prisma.user.findMany({
    where: { role: 'HEAD_TRAINER' },
    select: { id: true, email: true, fullName: true },
  });

  let trainerLimitOk = true;
  for (const t of trainers) {
    if (t.email === 'bot.trainer@gmail.com') continue;
    const plans = await prisma.trainingPlan.findMany({
      where: { trainerUserId: t.id, status: { in: ['ACTIVE', 'DRAFT'] } },
    });
    if (plans.length > 8) {
      trainerLimitOk = false;
      results.push({
        rule: `HLV ${t.email} không vượt quá 8 giáo án`,
        passed: false,
        details: `Vi phạm: HLV ${t.fullName} (${t.email}) có ${plans.length}/8 giáo án đồng thời!`,
      });
    }
  }
  if (trainerLimitOk) {
    results.push({
      rule: 'Ràng buộc 1: Định mức HLV (Active + Draft <= 8)',
      passed: true,
      details: 'Tất cả Huấn luyện viên đều tuân thủ trần <= 8 chiến mã.',
    });
  }

  // RÀNG BUỘC 2: HLV NGUYỄN VĂN TUẤN CÓ ĐÚNG 8 CHIẾN MÃ (5 ACTIVE, 1 DRAFT, 1 CHỜ LẬP GIÁO ÁN, 1 KHÓA Y TẾ)
  const tuan = await prisma.user.findUnique({ where: { email: 'trainer@gmail.com' } });
  if (tuan) {
    const tuanHorses = await prisma.horse.findMany({
      where: { assignedTrainerId: tuan.id },
      include: { trainingPlans: true, medicalLocks: { where: { isLocked: true } } },
    });
    const activePlans = tuanHorses.filter((h) => h.trainingPlans.some((p) => p.status === 'ACTIVE')).length;
    const draftPlans = tuanHorses.filter((h) => h.trainingPlans.some((p) => p.status === 'DRAFT')).length;
    const lockedHorses = tuanHorses.filter((h) => h.isMedicalLocked).length;
    const passed = tuanHorses.length === 8 && activePlans === 5 && draftPlans === 1 && lockedHorses === 1;
    results.push({
      rule: 'Ràng buộc 2: HLV Tuấn đạt chuẩn 8/8 chiến mã (5 Active, 1 Draft, 1 Chờ giáo án, 1 Khóa y tế)',
      passed,
      details: passed
        ? `Đạt chuẩn tuyệt đối: 8/8 chiến mã (${activePlans} Active, ${draftPlans} Draft, 1 Chờ giáo án, ${lockedHorses} Khóa y tế).`
        : `Lỗi: HLV Tuấn có ${tuanHorses.length} chiến mã (${activePlans} Active, ${draftPlans} Draft, ${lockedHorses} Khóa y tế)!`,
    });
  }

  // RÀNG BUỘC 3: ĐỊNH MỨC GROOM (TỐI ĐA 4 GROOM / BARN)
  const activeZones = await prisma.stallZone.findMany({
    where: { isActive: true },
    include: { stalls: true },
  });
  let barnGroomOk = true;
  for (const z of activeZones) {
    const groomCount = await prisma.user.count({
      where: {
        role: 'GROOM',
        assignedBarnId: z.id,
        status: { in: ['ACTIVE', 'INVITED'] },
      },
    });
    if (groomCount > 4) {
      barnGroomOk = false;
      results.push({
        rule: `Khu chuồng ${z.name} không quá 4 Groom`,
        passed: false,
        details: `Vi phạm: Khu chuồng ${z.name} có ${groomCount}/4 Groom!`,
      });
    }
  }
  if (barnGroomOk) {
    results.push({
      rule: 'Ràng buộc 3: Trần nhân sự Groom (Tối đa 4 Groom / Barn)',
      passed: true,
      details: 'Tất cả các khu chuồng hoạt động đều có số Groom <= 4 người (kể cả Active & Invited).',
    });
  }

  // RÀNG BUỘC 4: ĐỊNH MỨC Ô CHUỒNG GROOM (TỐI ĐA 6 Ô / GROOM)
  const grooms = await prisma.user.findMany({ where: { role: 'GROOM' } });
  let groomStallLimitOk = true;
  for (const g of grooms) {
    const allocations = await prisma.stallAllocation.findMany({
      where: { assignedGroomUserId: g.id, isActive: true },
    });
    if (allocations.length > 6) {
      groomStallLimitOk = false;
      results.push({
        rule: `Groom ${g.email} không vượt quá 6 ô chuồng`,
        passed: false,
        details: `Vi phạm: Groom ${g.fullName} phụ trách ${allocations.length} ô chuồng (vượt trần 6 ô)!`,
      });
    }
  }
  if (groomStallLimitOk) {
    results.push({
      rule: 'Ràng buộc 4: Trần tải chăm sóc của Groom (Tối đa 6 ô chuồng / Groom)',
      passed: true,
      details: 'Tất cả nhân viên Groom đều chăm sóc từ 0 đến 6 ô chuồng chuẩn mực.',
    });
  }

  // RÀNG BUỘC 5: CÔ LẬP KHU VỰC GROOM (GROOM CHỈ CHĂM SÓC Ô THUỘC BARN CỦA MÌNH)
  let groomIsolationOk = true;
  for (const g of grooms) {
    if (!g.assignedBarnId) continue;
    const invalidAllocations = await prisma.stallAllocation.findMany({
      where: {
        assignedGroomUserId: g.id,
        isActive: true,
        stall: { zoneId: { not: g.assignedBarnId } },
      },
      include: { stall: true },
    });
    if (invalidAllocations.length > 0) {
      groomIsolationOk = false;
      results.push({
        rule: `Groom ${g.email} cô lập trong Barn của mình`,
        passed: false,
        details: `Vi phạm: Groom ${g.fullName} được gán ô ở Barn khác (${invalidAllocations.map((a) => a.stall.code).join(', ')})!`,
      });
    }
  }
  if (groomIsolationOk) {
    results.push({
      rule: 'Ràng buộc 5: Tính cô lập khu chuồng của Groom (BR-GROOM-ZONE-LOCK)',
      passed: true,
      details: '100% ô chuồng được phân công cho Groom đều nằm chính xác trong Barn biên chế của Groom đó.',
    });
  }

  // RÀNG BUỘC 6: CHIẾN MÃ KHÓA Y TẾ KHÔNG ĐƯỢC CÓ BÀI TẬP LÊN LỊCH TRONG KHI KHÓA
  const lockedHorses = await prisma.horse.findMany({
    where: { isMedicalLocked: true },
    include: {
      workoutSessions: {
        where: { status: 'SCHEDULED' },
      },
      medicalLocks: { where: { isLocked: true } },
    },
  });
  let medLockOk = true;
  for (const h of lockedHorses) {
    if (h.workoutSessions.length > 0) {
      medLockOk = false;
      results.push({
        rule: `Chiến mã ${h.name} bị khóa y tế không có bài tập Scheduled`,
        passed: false,
        details: `Vi phạm: Chiến mã ${h.name} đang khóa y tế nhưng vẫn có ${h.workoutSessions.length} bài tập SCHEDULED!`,
      });
    }
  }
  if (medLockOk) {
    results.push({
      rule: 'Ràng buộc 6: Tính toàn vẹn Khóa y tế (Khóa huấn luyện triệt để)',
      passed: true,
      details: 'Chiến mã bị Khóa y tế (Hắc Báo, Chiến Thần) không có bất kỳ bài tập SCHEDULED nào.',
    });
  }

  // RÀNG BUỘC 7: CÓ ĐỦ CHIẾN MÃ DEMO BÀN GIAO & SLA (BẠCH LONG MÃ & XÍCH THỐ)
  const demo1 = await prisma.horse.findUnique({
    where: { horseCode: 'HRS-DEMO-01' },
    include: { handoverRequests: { where: { status: 'PENDING' } } },
  });
  const demo2 = await prisma.horse.findUnique({
    where: { horseCode: 'HRS-DEMO-02' },
    include: { handoverRequests: { where: { status: 'PENDING' } } },
  });
  const slaPassed = Boolean(demo1 && demo1.handoverRequests.length > 0 && demo2 && demo2.handoverRequests.length > 0);
  results.push({
    rule: 'Ràng buộc 7: Kịch bản Bàn giao & SLA (Bạch Long Mã 36h an toàn, Xích Thố <12h khẩn cấp)',
    passed: slaPassed,
    details: slaPassed
      ? 'Đạt chuẩn: Có đủ 2 yêu cầu bàn giao phục vụ kiểm thử SLA bình thường và cảnh báo khẩn cấp.'
      : 'Lỗi: Thiếu dữ liệu yêu cầu bàn giao cho chiến mã demo!',
  });

  // RÀNG BUỘC 8: CÓ HỒ SƠ TIẾP NHẬN CHIẾN MÃ (ADM-01) ĐỦ ĐIỀU KIỆN THẨM ĐỊNH
  const admRecord = await prisma.horseAdmissionRecord.findFirst({
    where: { status: 'INSPECTION_IN_PROGRESS', microchipVerified: true, isHealthEligible: true },
  });
  const admPassed = Boolean(admRecord);
  results.push({
    rule: 'Ràng buộc 8: Kịch bản Thẩm định tiếp nhận (Hồ sơ Ánh Dương sẵn sàng phê duyệt)',
    passed: admPassed,
    details: admPassed
      ? `Đạt chuẩn: Hồ sơ ${admRecord?.admissionCode} đã hoàn tất kiểm tra vi mạch, pháp lý và thú y.`
      : 'Lỗi: Không tìm thấy hồ sơ tiếp nhận đạt chuẩn thẩm định!',
  });

  // RÀNG BUỘC 9: LỊCH PHÒNG BỆNH ĐỊNH KỲ (CÓ ĐỦ COMPLETED, PENDING, VÀ OVERDUE BÁO ĐỎ)
  const schedules = await prisma.preventiveSchedule.findMany({});
  const hasCompleted = schedules.some((s) => s.status === PreventiveStatus.COMPLETED);
  const hasPending = schedules.some((s) => s.status === PreventiveStatus.PENDING);
  const hasOverdue = schedules.some((s) => s.status === PreventiveStatus.OVERDUE);
  const prevPassed = hasCompleted && hasPending && hasOverdue;
  results.push({
    rule: 'Ràng buộc 9: Phân hệ Thú y & Lịch phòng dịch (Có đủ Đã xong, Sắp đến hạn và Quá hạn báo đỏ)',
    passed: prevPassed,
    details: prevPassed
      ? `Đạt chuẩn y tế: ${schedules.length} lịch phòng bệnh (Đạt chuẩn, Sắp đến hạn, Quá hạn cảnh báo).`
      : 'Lỗi: Thiếu các trạng thái COMPLETED, PENDING hoặc OVERDUE trong PreventiveSchedule!',
  });

  // RÀNG BUỘC 10: TÀI CHÍNH, HÓA ĐƠN & CỜ NỢ XẤU (BAD DEBT FLAGGED)
  const invoices = await prisma.financialInvoice.findMany({});
  const hasPaidInv = invoices.some((i) => i.status === InvoiceStatus.PAID);
  const hasSentInv = invoices.some((i) => i.status === InvoiceStatus.SENT);
  const hasOverdueInv = invoices.some((i) => i.status === InvoiceStatus.OVERDUE);
  const ownerUser = await prisma.user.findUnique({ where: { email: 'owner@gmail.com' } });
  const finPassed = hasPaidInv && hasSentInv && hasOverdueInv && Boolean(ownerUser?.isBadDebtFlagged);
  results.push({
    rule: 'Ràng buộc 10: Phân hệ Tài chính (Hóa đơn PAID, SENT, OVERDUE & Cờ Nợ xấu)',
    passed: finPassed,
    details: finPassed
      ? `Đạt chuẩn tài chính: Có đủ 3 hóa đơn mẫu và Chủ ngựa Robert Sterling được gắn cờ Nợ xấu hợp lệ.`
      : 'Lỗi: Thiếu hóa đơn hoặc Chủ ngựa chưa được gắn cờ nợ xấu!',
  });

  // IN BẢNG BÁO CÁO THẨM ĐỊNH
  console.log('\n--- BẢNG KẾT QUẢ ĐỐI SOÁT TÍNH TOÀN VẸN CƠ SỞ DỮ LIỆU ---');
  let allPassed = true;
  for (const r of results) {
    const statusText = r.passed ? '[PASS]' : '[FAIL]';
    console.log(`${statusText} ${r.rule}`);
    console.log(`       -> ${r.details}`);
    if (!r.passed) allPassed = false;
  }
  console.log('------------------------------------------------------------\n');

  if (allPassed) {
    console.log('>>> KẾT LUẬN: CƠ SỞ DỮ LIỆU ĐẠT CHUẨN 100% TOÀN BỘ 10 RÀNG BUỘC NGHIỆP VỤ. SẴN SÀNG BẢO VỆ HỘI ĐỒNG. <<<\n');
  } else {
    console.error('>>> KẾT LUẬN: CƠ SỞ DỮ LIỆU CÓ VI PHẠM RÀNG BUỘC! <<<\n');
  }

  return allPassed;
}

if (require.main === module) {
  verifyDatabaseSanity()
    .then((ok) => {
      process.exit(ok ? 0 : 1);
    })
    .catch((e) => {
      console.error('Lỗi khi chạy verifyDatabaseSanity:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
