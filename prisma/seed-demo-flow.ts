import {
  PrismaClient,
  Role,
  UserStatus,
  HorseStatus,
  StallStatus,
  PlanStatus,
  WorkoutStatus,
  TrackSurface,
  DailyTaskType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 [seed-demo-flow] Bắt đầu khởi tạo dữ liệu demo cho tất cả các luồng...');

  const passwordHash = await bcrypt.hash('EquiFlow@2026', 10);
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayDate = new Date(`${todayStr}T00:00:00.000Z`);

  // =========================================================================
  // 1. TÀI KHOẢN DIỄN VIÊN DEMO (EquiFlow@2026)
  // =========================================================================
  console.log('👤 [1/5] Khởi tạo tài khoản Quản lý, Huấn luyện viên, Groom (Mật khẩu: EquiFlow@2026)...');

  // Đảm bảo tất cả người dùng trong DB đều có mật khẩu EquiFlow@2026 và mở khóa đăng nhập
  await prisma.user.updateMany({
    data: { passwordHash, status: UserStatus.ACTIVE, lockedAt: null, statusReason: null },
  });
  await prisma.loginAttempt.deleteMany({});

  const manager = await prisma.user.upsert({
    where: { email: 'manager@gmail.com' },
    update: { passwordHash, status: UserStatus.ACTIVE, fullName: 'Nguyễn Hoàng Long' },
    create: {
      email: 'manager@gmail.com',
      passwordHash,
      fullName: 'Nguyễn Hoàng Long',
      role: Role.CLUB_MANAGER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0901000001',
    },
  });

  const trainerA = await prisma.user.upsert({
    where: { email: 'trainer@gmail.com' },
    update: { passwordHash, status: UserStatus.ACTIVE, fullName: 'Nguyễn Văn Tuấn' },
    create: {
      email: 'trainer@gmail.com',
      passwordHash,
      fullName: 'Nguyễn Văn Tuấn',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0902000001',
    },
  });

  const trainerB = await prisma.user.upsert({
    where: { email: 'trainer2@gmail.com' },
    update: { passwordHash, status: UserStatus.ACTIVE, fullName: 'Lê Hoàng Nam' },
    create: {
      email: 'trainer2@gmail.com',
      passwordHash,
      fullName: 'Lê Hoàng Nam',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0902000002',
    },
  });

  const trainerC = await prisma.user.upsert({
    where: { email: 'trainer3@gmail.com' },
    update: { passwordHash, status: UserStatus.ACTIVE, fullName: 'Phạm Quốc Trung' },
    create: {
      email: 'trainer3@gmail.com',
      passwordHash,
      fullName: 'Phạm Quốc Trung',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0902000003',
    },
  });

  const groom = await prisma.user.upsert({
    where: { email: 'groom@gmail.com' },
    update: { passwordHash, status: UserStatus.ACTIVE, fullName: 'Trần Thị Mai' },
    create: {
      email: 'groom@gmail.com',
      passwordHash,
      fullName: 'Trần Thị Mai',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
      phoneNumber: '0904000001',
    },
  });

  const groom2 = await prisma.user.upsert({
    where: { email: 'groom2@gmail.com' },
    update: { passwordHash, status: UserStatus.ACTIVE, fullName: 'Hoàng Văn Phúc' },
    create: {
      email: 'groom2@gmail.com',
      passwordHash,
      fullName: 'Hoàng Văn Phúc',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
      phoneNumber: '0904000002',
    },
  });

  const groom3 = await prisma.user.upsert({
    where: { email: 'groom3@gmail.com' },
    update: { passwordHash, status: UserStatus.ACTIVE, fullName: 'Đỗ Thị Mai' },
    create: {
      email: 'groom3@gmail.com',
      passwordHash,
      fullName: 'Đỗ Thị Mai',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
      phoneNumber: '0904000003',
    },
  });

  const groom4 = await prisma.user.upsert({
    where: { email: 'groom4@gmail.com' },
    update: { passwordHash, status: UserStatus.ACTIVE, fullName: 'Lê Quốc Tuấn' },
    create: {
      email: 'groom4@gmail.com',
      passwordHash,
      fullName: 'Lê Quốc Tuấn',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
      phoneNumber: '0904000004',
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: 'owner@gmail.com' },
    update: { passwordHash, status: UserStatus.ACTIVE, fullName: 'Robert Sterling' },
    create: {
      email: 'owner@gmail.com',
      passwordHash,
      fullName: 'Robert Sterling',
      role: Role.HORSE_OWNER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0905000001',
    },
  });

  // =========================================================================
  // 2. KHU CHUỒNG (Barn A & Barn B) & Ô CHUỒNG
  // =========================================================================
  console.log('🏠 [2/5] Khởi tạo khu chuồng Barn A và Barn B...');

  const zoneA = await prisma.stallZone.upsert({
    where: { code: 'BARN-A' },
    update: { name: 'Barn A', rows: 4, cols: 3, isActive: true },
    create: {
      code: 'BARN-A',
      name: 'Barn A',
      rows: 4,
      cols: 3,
      description: 'Khu chuồng chính A (Chuyên môn HLV Tuấn & Nam)',
    },
  });

  const zoneB = await prisma.stallZone.upsert({
    where: { code: 'BARN-B' },
    update: { name: 'Barn B', rows: 4, cols: 3, isActive: true },
    create: {
      code: 'BARN-B',
      name: 'Barn B',
      rows: 4,
      cols: 3,
      description: 'Khu chuồng biệt lập B (Chuyên môn HLV Trung)',
    },
  });

  // Gán Barn cho các HLV theo định mức tối đa 2 HLV / Barn (BR-BARN-STAFFING-LIMIT):
  // Barn A: HLV Tuấn & HLV Quân
  // Barn B: HLV Nam & HLV Trung
  await prisma.user.update({
    where: { id: trainerA.id },
    data: { assignedBarnId: zoneA.id },
  });
  await prisma.user.update({
    where: { id: trainerB.id },
    data: { assignedBarnId: zoneB.id },
  });
  await prisma.user.update({
    where: { id: trainerC.id },
    data: { assignedBarnId: zoneB.id },
  });

  const trainerQuan = await prisma.user.upsert({
    where: { email: 'trainer.quan@gmail.com' },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      fullName: 'Trần Minh Quân',
      assignedBarnId: zoneA.id,
    },
    create: {
      email: 'trainer.quan@gmail.com',
      passwordHash,
      fullName: 'Trần Minh Quân',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0902000004',
      assignedBarnId: zoneA.id,
    },
  });

  // Reset tạm thời row và col để tránh conflict unique constraint khi sắp xếp lại theo lưới 4x3
  await prisma.stall.updateMany({
    where: { zoneId: { in: [zoneA.id, zoneB.id] } },
    data: { row: null, col: null },
  });

  // Tạo các ô chuồng mẫu theo lưới chuẩn 4x3 (4 hàng x 3 cột = 12 ô chuồng)
  const stallsA: any[] = [];
  for (let i = 1; i <= 12; i++) {
    const code = `A-${String(i).padStart(2, '0')}`;
    const s = await prisma.stall.upsert({
      where: { code },
      update: {
        zoneId: zoneA.id,
        zone: 'Barn A',
        row: Math.ceil(i / 3),
        col: ((i - 1) % 3) + 1,
      },
      create: {
        code,
        zone: 'Barn A',
        zoneId: zoneA.id,
        row: Math.ceil(i / 3),
        col: ((i - 1) % 3) + 1,
        status: StallStatus.OCCUPIED,
      },
    });
    stallsA.push(s);
  }

  const stallsB: any[] = [];
  for (let i = 1; i <= 12; i++) {
    const code = `B-${String(i).padStart(2, '0')}`;
    const s = await prisma.stall.upsert({
      where: { code },
      update: {
        zoneId: zoneB.id,
        zone: 'Barn B',
        row: Math.ceil(i / 3),
        col: ((i - 1) % 3) + 1,
        status: i <= 6 ? StallStatus.OCCUPIED : StallStatus.AVAILABLE,
      },
      create: {
        code,
        zone: 'Barn B',
        zoneId: zoneB.id,
        row: Math.ceil(i / 3),
        col: ((i - 1) % 3) + 1,
        status: i <= 6 ? StallStatus.OCCUPIED : StallStatus.AVAILABLE,
      },
    });
    stallsB.push(s);
  }

  // =========================================================================
  // 3. THIẾT LẬP TẢI CỦA CÁC HUẤN LUYỆN VIÊN (ĐẠT CHUẨN 8/8 & TRẦN 2 HLV/BARN)
  // =========================================================================
  console.log('⚖️ [3/5] Thiết lập định mức tải đạt chuẩn (HLV Tuấn 8/8, HLV Quân 2/8, HLV Nam 4/8, HLV Trung 3/8)...');

  // Reset các ngựa demo cũ nếu có (xóa sạch các liên kết phụ thuộc trước khi xóa ngựa)
  const demoHorseFilter = { horse: { horseCode: { in: ['HRS-DEMO-01', 'HRS-DEMO-02', 'HRS-DEMO-03', 'HRS-DEMO-04'] } } };
  const demoPrefixedFilter = { horse: { horseCode: { startsWith: 'HR-DEMO-' } } };
  await prisma.workoutSession.deleteMany({ where: { OR: [demoHorseFilter, demoPrefixedFilter] } });
  await prisma.dailyCareTask.deleteMany({ where: { OR: [demoHorseFilter, demoPrefixedFilter] } });
  await prisma.trainingPlan.deleteMany({ where: { OR: [demoHorseFilter, demoPrefixedFilter] } });
  await prisma.stallAllocation.deleteMany({ where: { OR: [demoHorseFilter, demoPrefixedFilter] } });
  await prisma.medicalLock.deleteMany({ where: { OR: [demoHorseFilter, demoPrefixedFilter] } });
  await prisma.horseHandoverRequest.deleteMany({});

  await prisma.horse.deleteMany({
    where: {
      OR: [
        { horseCode: { in: ['HRS-DEMO-01', 'HRS-DEMO-02', 'HRS-DEMO-03', 'HRS-DEMO-04'] } },
        { horseCode: { startsWith: 'HR-DEMO-' } },
      ],
    },
  });

  // Dọn dẹp triệt để các giáo án ACTIVE/DRAFT cũ từ seed.ts của các HLV
  await prisma.trainingPlan.updateMany({
    where: {
      trainerUserId: { in: [trainerA.id, trainerB.id, trainerC.id, trainerQuan.id] },
      status: { in: [PlanStatus.ACTIVE, PlanStatus.DRAFT] },
    },
    data: { status: PlanStatus.COMPLETED },
  });

  // Gỡ toàn bộ phân bổ chuồng cũ của các groom để đảm bảo định mức chuẩn
  await prisma.stallAllocation.updateMany({
    where: {
      assignedGroomUserId: { in: [groom.id, groom2.id, groom3.id, groom4.id] },
    },
    data: { assignedGroomUserId: null },
  });

  // Mảng theo dõi chiến mã của mỗi Groom
  const groom1Horses: { horse: any; stall: any }[] = [];
  const groom2Horses: { horse: any; stall: any }[] = [];
  const groom3Horses: { horse: any; stall: any }[] = [];

  // --- Helper tạo giáo án đang hoạt động kèm phases và các buổi tập thực tế ---
  async function createLivePlanWithWorkouts(params: {
    horseId: string;
    trainerUserId: string;
    planCode: string;
    phaseName: string;
    objective: string;
    baseScore: number;
    trackSurface: TrackSurface;
    isLoadSpike?: boolean;
  }) {
    const startDate = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    const endDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const phase1End = new Date(Date.now() - 15 * 24 * 3600 * 1000);
    const phase2Start = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    const phase2End = new Date(Date.now() + 15 * 24 * 3600 * 1000);

    const phases = [
      {
        id: `${params.planCode}-PH1`,
        name: 'Giai đoạn 1: Nền tảng',
        type: 'BASE',
        startDate: startDate.toISOString().slice(0, 10),
        endDate: phase1End.toISOString().slice(0, 10),
        sessionsPerWeek: 3,
        maxWeeklyDistance: 6000,
        surface: params.trackSurface,
      },
      {
        id: `${params.planCode}-PH2`,
        name: 'Giai đoạn 2: Tăng tốc & Sức bền',
        type: 'BUILD',
        startDate: phase2Start.toISOString().slice(0, 10),
        endDate: phase2End.toISOString().slice(0, 10),
        sessionsPerWeek: 3,
        maxWeeklyDistance: 8000,
        surface: params.trackSurface,
      },
      {
        id: `${params.planCode}-PH3`,
        name: 'Giai đoạn 3: Phục hồi & Nước rút',
        type: 'SPEED',
        startDate: new Date(Date.now() + 16 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        sessionsPerWeek: 3,
        maxWeeklyDistance: 5000,
        surface: params.trackSurface,
      },
    ];

    const plan = await prisma.trainingPlan.create({
      data: {
        horseId: params.horseId,
        trainerUserId: params.trainerUserId,
        planCode: params.planCode,
        phaseName: params.phaseName,
        objective: params.objective,
        status: PlanStatus.ACTIVE,
        startDate,
        endDate,
        trackSurface: params.trackSurface,
        phases,
      },
    });

    const prior4wOffsets = [-32, -29, -25, -22, -18, -15, -11, -8];
    const recentOffsets = params.isLoadSpike ? [-6, -3, -1] : [-5, -2];
    const allCompleted = [...prior4wOffsets, ...recentOffsets];

    for (let s = 0; s < allCompleted.length; s++) {
      const off = allCompleted[s];
      const sDate = new Date(Date.now() + off * 24 * 3600 * 1000);
      sDate.setHours(7 + (s % 3), 0, 0, 0);
      const score = Math.min(9.6, Math.max(7.8, params.baseScore + (s % 3) * 0.2 - 0.1));
      const phaseId = off <= -15 ? `${params.planCode}-PH1` : `${params.planCode}-PH2`;
      const isExtraSpikeSession = params.isLoadSpike && off === -1;
      await prisma.workoutSession.create({
        data: {
          trainingPlanId: plan.id,
          horseId: params.horseId,
          assignedStaffUserId: params.trainerUserId,
          scheduledDate: sDate,
          phaseId,
          workoutType: s % 2 === 0 ? 'CANTER' : 'BREEZE',
          intensity: isExtraSpikeSession ? 'HEAVY' : s % 3 === 0 ? 'LIGHT' : 'MEDIUM',
          trackSurface: params.trackSurface,
          distanceMeters: isExtraSpikeSession ? 2000 : 1500,
          repetitions: 2,
          targetSpeedKmh: isExtraSpikeSession ? 62 : 58,
          status: WorkoutStatus.COMPLETED,
          performanceScore: Math.round(score * 10) / 10,
          heartRatePeak: 185 + (s % 4) * 4,
          heartRateRecovery: 95 + (s % 3) * 3,
          resultRecordedAt: new Date(sDate.getTime() + 3600 * 1000),
          trainerNotes: 'Chiến mã duy trì thể lực tốt, bước chạy ổn định.',
        },
      });
    }

    const upcomingOffsets = [2, 4, 7];
    for (let u = 0; u < upcomingOffsets.length; u++) {
      const off = upcomingOffsets[u];
      const uDate = new Date(Date.now() + off * 24 * 3600 * 1000);
      uDate.setHours(8 + u, 30, 0, 0);
      await prisma.workoutSession.create({
        data: {
          trainingPlanId: plan.id,
          horseId: params.horseId,
          assignedStaffUserId: params.trainerUserId,
          scheduledDate: uDate,
          phaseId: `${params.planCode}-PH2`,
          workoutType: u === 0 ? 'CANTER' : 'BREEZE',
          intensity: 'MEDIUM',
          trackSurface: params.trackSurface,
          distanceMeters: 1500,
          repetitions: 2,
          targetSpeedKmh: 60,
          status: WorkoutStatus.SCHEDULED,
          jockeyName: 'Trần Văn Kiên',
          trainerNotes: 'Chuẩn bị bài tập cự ly trung bình trên sân cỏ.',
        },
      });
    }

    return plan;
  }

  // --- 3.1. HLV TUẤN (trainer@gmail.com, Barn A): ĐÚNG 8 CHIẾN MÃ (8/8 TẢI THỰC TẾ) ---
  console.log('  -> Tạo ĐÚNG 8 chiến mã tại Barn A cho HLV Tuấn theo cơ cấu sống động thực tế (5 Active, 1 Draft, 1 Chờ giáo án, 1 Khóa y tế)...');
  const horseNamesA = [
    'Phong Lôi', 'Tuyết Ảnh', 'Lôi Chấn', 'Dạ Nguyệt',
    'Lão Tướng', 'Huyền Vũ', 'Thần Phong', 'Hắc Báo',
  ];
  for (let i = 1; i <= 8; i++) {
    const avatarUrl = `/images/horses/horse-${String(i).padStart(2, '0')}.jpg`;
    const isMedical = i === 8;
    const isWaitingPlan = i === 7;
    const isDraft = i === 6;
    const isActive = i <= 5;

    const horseStatus = isMedical
      ? HorseStatus.INJURED
      : isWaitingPlan
        ? HorseStatus.RESTING
        : HorseStatus.IN_TRAINING;

    const h = await prisma.horse.create({
      data: {
        horseCode: `HR-DEMO-A0${i}`,
        name: horseNamesA[i - 1],
        breed: 'Quarter Horse',
        gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
        color: 'Bay',
        avatarUrl,
        dob: new Date('2022-01-20'),
        weightKg: 470 + i * 5,
        microchip: `98500000100${i}`,
        microchipRfid: `98500000100${i}`,
        status: horseStatus,
        isMedicalLocked: isMedical,
        assignedTrainerId: trainerA.id,
        trainerAssignmentStatus: 'ASSIGNED',
        ownerId: owner.id,
      },
    });

    const stallA = stallsA[i - 1]; // Ô A-01 đến A-08
    const assignedGroomId = i <= 4 ? groom.id : groom2.id;
    if (i <= 4) groom1Horses.push({ horse: h, stall: stallA });
    else groom2Horses.push({ horse: h, stall: stallA });

    await prisma.stallAllocation.create({
      data: {
        stallId: stallA.id,
        horseId: h.id,
        assignedGroomUserId: assignedGroomId,
        isActive: true,
      },
    });

    if (isActive) {
      await createLivePlanWithWorkouts({
        horseId: h.id,
        trainerUserId: trainerA.id,
        planCode: `GA-DEMO-A0${i}`,
        phaseName: `Giáo án Thể lực & Tốc độ A${i}`,
        objective: 'Tăng cường sức bền và tốc độ nước rút 1200m.',
        baseScore: 8.5 + (i % 3) * 0.2,
        trackSurface: TrackSurface.TURF,
        isLoadSpike: i === 1,
      });
    } else if (isDraft) {
      // 1 Chiến mã có giáo án DRAFT (chờ kích hoạt)
      const startDate = new Date(Date.now() + 2 * 24 * 3600 * 1000);
      const endDate = new Date(Date.now() + 32 * 24 * 3600 * 1000);
      await prisma.trainingPlan.create({
        data: {
          horseId: h.id,
          trainerUserId: trainerA.id,
          planCode: `GA-DEMO-A0${i}`,
          phaseName: `Giáo án Thể lực & Bứt tốc Mùa Thu`,
          objective: 'Rèn luyện khả năng tăng tốc 400m cuối và hồi phục nhịp tim.',
          status: PlanStatus.DRAFT,
          startDate,
          endDate,
          trackSurface: TrackSurface.TURF,
          phases: [
            {
              id: `GA-DEMO-A0${i}-PH1`,
              name: 'Giai đoạn 1: Nền tảng',
              type: 'BASE',
              startDate: startDate.toISOString().slice(0, 10),
              endDate: new Date(Date.now() + 16 * 24 * 3600 * 1000).toISOString().slice(0, 10),
              sessionsPerWeek: 3,
              maxWeeklyDistance: 6000,
              surface: TrackSurface.TURF,
            },
          ],
        },
      });
    } else if (isWaitingPlan) {
      // 1 Chiến mã mới tiếp nhận, chờ lập giáo án (SLA 3 ngày)
      await prisma.horseHandoverRequest.create({
        data: {
          horseId: h.id,
          fromManagerId: manager.id,
          toTrainerId: trainerA.id,
          status: 'ACCEPTED',
          token: `token-accepted-a07-${Date.now()}`,
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          acceptedAt: new Date(Date.now() - 3600 * 1000),
          planDeadlineAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
        },
      });
    } else if (isMedical) {
      // 1 Chiến mã bị khóa y tế
      await prisma.medicalLock.create({
        data: {
          horseId: h.id,
          lockCode: `KH-DEMO-01`,
          lockedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
          expectedRestDays: 14,
          recheckDate: new Date(Date.now() + 12 * 24 * 3600 * 1000),
          lockReason: 'Chấn thương gân chân trước bên phải cấp độ 2 sau bài tập nặng',
        },
      });
    }
  }

  // --- 3.2. HLV QUÂN (trainer.quan@gmail.com, Barn A): 2 CHIẾN MÃ (2/8, CÒN 6 CHỖ TRỐNG ĐỂ DEMO HAPPY CASE) ---
  console.log('  -> Tạo 2 chiến mã tại Barn A cho HLV Quân (2/8 tải, phục vụ test Happy Case phân công)...');
  const horseNamesQ = ['Tử Điện', 'Thanh Loan'];
  for (let i = 1; i <= 2; i++) {
    const avatarUrl = `/images/horses/horse-${String(i + 8).padStart(2, '0')}.jpg`;
    const h = await prisma.horse.create({
      data: {
        horseCode: `HR-DEMO-Q0${i}`,
        name: horseNamesQ[i - 1],
        breed: 'Thoroughbred',
        gender: 'FEMALE',
        color: 'Chestnut',
        avatarUrl,
        dob: new Date('2022-05-10'),
        weightKg: 460 + i * 10,
        microchip: `98500000400${i}`,
        microchipRfid: `98500000400${i}`,
        status: HorseStatus.IN_TRAINING,
        assignedTrainerId: trainerQuan.id,
        trainerAssignmentStatus: 'ASSIGNED',
        ownerId: owner.id,
      },
    });

    const stallQ = stallsA[7 + i]; // Ô A-09 và A-10
    await prisma.stallAllocation.create({
      data: {
        stallId: stallQ.id,
        horseId: h.id,
        assignedGroomUserId: groom2.id,
        isActive: true,
      },
    });
    groom2Horses.push({ horse: h, stall: stallQ });

    await createLivePlanWithWorkouts({
      horseId: h.id,
      trainerUserId: trainerQuan.id,
      planCode: `GA-DEMO-Q0${i}`,
      phaseName: `Giáo án Nước kiệu Quân ${i}`,
      objective: 'Rèn luyện phản xạ và cự ly trung bình.',
      baseScore: 8.3,
      trackSurface: TrackSurface.TURF,
      isLoadSpike: false,
    });
  }

  // --- 3.3. HLV NAM (trainer2@gmail.com, Barn B): 4 CHIẾN MÃ TẠI BARN B (4/8 TẢI) ---
  console.log('  -> Tạo 4 chiến mã tại Barn B cho HLV Nam (Barn B)...');
  const horseNamesB = ['Tuyết Phong', 'Kim Long', 'Hồng Kỳ', 'Phi Vũ'];
  for (let i = 1; i <= 4; i++) {
    const avatarUrl = `/images/horses/horse-${String(i + 10).padStart(2, '0')}.jpg`;
    const h = await prisma.horse.create({
      data: {
        horseCode: `HR-DEMO-B0${i}`,
        name: horseNamesB[i - 1],
        breed: 'Thoroughbred',
        gender: 'MALE',
        color: 'Bay',
        avatarUrl,
        dob: new Date('2022-03-15'),
        weightKg: 480 + i * 5,
        microchip: `98500000200${i}`,
        microchipRfid: `98500000200${i}`,
        status: HorseStatus.IN_TRAINING,
        assignedTrainerId: trainerB.id,
        trainerAssignmentStatus: 'ASSIGNED',
        ownerId: owner.id,
      },
    });

    const stallB = stallsB[i - 1]; // Ô B-01 đến B-04
    await prisma.stallAllocation.create({
      data: {
        stallId: stallB.id,
        horseId: h.id,
        assignedGroomUserId: groom3.id,
        isActive: true,
      },
    });
    groom3Horses.push({ horse: h, stall: stallB });

    await createLivePlanWithWorkouts({
      horseId: h.id,
      trainerUserId: trainerB.id,
      planCode: `GA-DEMO-B0${i}`,
      phaseName: `Giáo án Tốc độ Nam ${i}`,
      objective: 'Duy trì thể lực và kiểm soát nhịp tim trên sân cát.',
      baseScore: 8.4,
      trackSurface: TrackSurface.DIRT,
      isLoadSpike: false,
    });
  }

  // --- 3.4. HLV TRUNG (trainer3@gmail.com, Barn B): 3 CHIẾN MÃ TẠI BARN B (3/8 TẢI) ---
  console.log('  -> Tạo 3 chiến mã tại Barn B cho HLV Trung (Barn B)...');
  const horseNamesC = ['Ngàn Hoa', 'Thiên Mã', 'Hỏa Phụng'];
  for (let i = 1; i <= 3; i++) {
    const avatarUrl = `/images/horses/horse-${String(i + 14).padStart(2, '0')}.jpg`;
    const h = await prisma.horse.create({
      data: {
        horseCode: `HR-DEMO-C0${i}`,
        name: horseNamesC[i - 1],
        breed: 'Arabian',
        gender: 'MALE',
        color: 'Chestnut',
        avatarUrl,
        dob: new Date('2021-05-10'),
        weightKg: 450 + i * 10,
        microchip: `98500000300${i}`,
        microchipRfid: `98500000300${i}`,
        status: HorseStatus.IN_TRAINING,
        assignedTrainerId: trainerC.id,
        trainerAssignmentStatus: 'ASSIGNED',
        ownerId: owner.id,
      },
    });

    const stallC = stallsB[3 + i]; // Ô B-05 đến B-07
    await prisma.stallAllocation.create({
      data: {
        stallId: stallC.id,
        horseId: h.id,
        assignedGroomUserId: groom3.id,
        isActive: true,
      },
    });
    groom3Horses.push({ horse: h, stall: stallC });

    await createLivePlanWithWorkouts({
      horseId: h.id,
      trainerUserId: trainerC.id,
      planCode: `GA-DEMO-C0${i}`,
      phaseName: `Giáo án Nước kiệu Trung ${i}`,
      objective: 'Tập trung phản xạ và phối hợp bước chạy 1000m.',
      baseScore: 8.2,
      trackSurface: TrackSurface.DIRT,
      isLoadSpike: false,
    });
  }

  // =========================================================================
  // 4. BỐ TRÍ 4 CHIẾN MÃ DEMO CHUYÊN BIỆT CHO CÁC LUỒNG THỰC TẾ
  // =========================================================================
  console.log('🐴 [4/5] Tạo 4 chiến mã phục vụ kịch bản demo Happy Case & Ngoại lệ...');

  // --- Ngựa Demo 1: "Bạch Long Mã" (HRS-DEMO-01) tại Chuồng A-11 (Barn A) - CHƯA CÓ HLV ---
  // Dùng để demo Happy Case: Quản lý gán cho HLV Quân (thành công -> gửi Email SLA 48h)
  // Và demo Ngoại lệ 1: Quản lý gán cho HLV Tuấn (báo lỗi Quá tải 8/8)
  // Và demo Ngoại lệ 2: Quản lý gán cho HLV Nam (báo lỗi Lệch Barn A != Barn B)
  const demoHorse1 = await prisma.horse.upsert({
    where: { horseCode: 'HRS-DEMO-01' },
    update: {
      name: 'Bạch Long Mã',
      avatarUrl: '/images/horses/horse-18.jpg',
      status: HorseStatus.RESTING,
      assignedTrainerId: null,
      trainerAssignmentStatus: 'UNASSIGNED',
      isMedicalLocked: false,
    },
    create: {
      horseCode: 'HRS-DEMO-01',
      name: 'Bạch Long Mã',
      avatarUrl: '/images/horses/horse-18.jpg',
      breed: 'Thoroughbred',
      gender: 'MALE',
      color: 'White',
      dob: new Date('2022-04-12'),
      weightKg: 485.5,
      microchip: '985000009901',
      microchipRfid: '985000009901',
      status: HorseStatus.RESTING,
      assignedTrainerId: null,
      trainerAssignmentStatus: 'UNASSIGNED',
      isMedicalLocked: false,
      ownerId: owner.id,
    },
  });

  await prisma.stallAllocation.deleteMany({ where: { horseId: demoHorse1.id } });
  await prisma.stallAllocation.create({
    data: {
      stallId: stallsA[10].id, // Chuồng A-11 (Barn A)
      horseId: demoHorse1.id,
      assignedGroomUserId: groom.id,
      isActive: true,
    },
  });

  // --- Ngựa Demo 2: "Xích Thố" (HRS-DEMO-02) tại Chuồng A-12 (Barn A) - CHƯA CÓ HLV ---
  // Dùng để demo SLA Lũy tiến: HLV Quân nhận con thứ 2 -> SLA tăng từ 3 ngày lên 5 ngày!
  const demoHorse2 = await prisma.horse.upsert({
    where: { horseCode: 'HRS-DEMO-02' },
    update: {
      name: 'Xích Thố',
      avatarUrl: '/images/horses/horse-19.jpg',
      status: HorseStatus.RESTING,
      assignedTrainerId: null,
      trainerAssignmentStatus: 'UNASSIGNED',
      isMedicalLocked: false,
    },
    create: {
      horseCode: 'HRS-DEMO-02',
      name: 'Xích Thố',
      avatarUrl: '/images/horses/horse-19.jpg',
      breed: 'Quarter Horse',
      gender: 'MALE',
      color: 'Chestnut',
      dob: new Date('2021-08-25'),
      weightKg: 510.0,
      microchip: '985000009902',
      microchipRfid: '985000009902',
      status: HorseStatus.RESTING,
      assignedTrainerId: null,
      trainerAssignmentStatus: 'UNASSIGNED',
      isMedicalLocked: false,
      ownerId: owner.id,
    },
  });

  await prisma.stallAllocation.deleteMany({ where: { horseId: demoHorse2.id } });
  await prisma.stallAllocation.create({
    data: {
      stallId: stallsA[11].id, // Chuồng A-12 (Barn A)
      horseId: demoHorse2.id,
      assignedGroomUserId: groom.id,
      isActive: true,
    },
  });

  // --- Ngựa Demo 3: "Phi Yến" (HRS-DEMO-03) - CHƯA XẾP CHUỒNG (NO-STALL) ---
  // Dùng để demo Ngoại lệ: Ngựa chưa xếp ô chuồng thì bị chặn không cho phân công HLV
  const demoHorse3 = await prisma.horse.upsert({
    where: { horseCode: 'HRS-DEMO-03' },
    update: {
      name: 'Phi Yến',
      avatarUrl: '/images/horses/horse-04.jpg',
      status: HorseStatus.RESTING,
      assignedTrainerId: null,
      trainerAssignmentStatus: 'UNASSIGNED',
    },
    create: {
      horseCode: 'HRS-DEMO-03',
      name: 'Phi Yến',
      avatarUrl: '/images/horses/horse-04.jpg',
      breed: 'Warmblood',
      gender: 'FEMALE',
      color: 'Bay',
      dob: new Date('2023-02-14'),
      weightKg: 430.0,
      microchip: '985000009903',
      microchipRfid: '985000009903',
      status: HorseStatus.RESTING,
      assignedTrainerId: null,
      trainerAssignmentStatus: 'UNASSIGNED',
      ownerId: owner.id,
    },
  });
  await prisma.stallAllocation.deleteMany({ where: { horseId: demoHorse3.id } });

  // --- Ngựa Demo 4: "Chiến Thần" (HRS-DEMO-04) tại Barn B - ĐANG BỊ KHÓA Y TẾ ---
  // Dùng để demo Ngoại lệ: Chiến mã đang bị Khóa y tế (chấn thương) bị chặn tạo giáo án
  const demoHorse4 = await prisma.horse.upsert({
    where: { horseCode: 'HRS-DEMO-04' },
    update: {
      name: 'Chiến Thần',
      avatarUrl: '/images/horses/horse-02.jpg',
      status: HorseStatus.RESTING,
      assignedTrainerId: trainerC.id,
      trainerAssignmentStatus: 'ASSIGNED',
      isMedicalLocked: true,
    },
    create: {
      horseCode: 'HRS-DEMO-04',
      name: 'Chiến Thần',
      avatarUrl: '/images/horses/horse-02.jpg',
      breed: 'Arabian',
      gender: 'MALE',
      color: 'Black',
      dob: new Date('2021-11-05'),
      weightKg: 495.0,
      microchip: '985000009904',
      microchipRfid: '985000009904',
      status: HorseStatus.RESTING,
      assignedTrainerId: trainerC.id,
      trainerAssignmentStatus: 'ASSIGNED',
      isMedicalLocked: true,
      ownerId: owner.id,
    },
  });

  await prisma.stallAllocation.deleteMany({ where: { horseId: demoHorse4.id } });
  await prisma.stallAllocation.create({
    data: {
      stallId: stallsB[7].id, // Chuồng B-08
      horseId: demoHorse4.id,
      assignedGroomUserId: groom3.id,
      isActive: true,
    },
  });

  // =========================================================================
  // 5. DỮ LIỆU CA TRỰC & LỊCH TẬP (A5)
  // =========================================================================
  console.log('📊 [5/5] Khởi tạo dữ liệu ca trực Groom & ca tập HLV...');

  // --- Shift Roster cho Groom hôm nay ---
  // Tìm hoặc tạo ShiftCatalog Sáng (06:00 - 14:00)
  let shiftMorning = await prisma.shiftCatalog.findFirst({
    where: { name: { contains: 'Sáng', mode: 'insensitive' } },
  });
  if (!shiftMorning) {
    shiftMorning = await prisma.shiftCatalog.create({
      data: {
        code: 'SHIFT_MORNING',
        name: 'Ca Sáng',
        startTime: '06:00',
        endTime: '14:00',
        description: 'Ca chăm sóc & trực buổi sáng',
      },
    });
  }

  const groomProfiles = [
    { user: groom, horses: groom1Horses, zone: zoneA, shiftNotes: 'Trực chính phân khu Barn A (Ô A-01 đến A-04, 4/6 ô)' },
    { user: groom2, horses: groom2Horses, zone: zoneA, shiftNotes: 'Trực hỗ trợ phân khu Barn A (Ô A-05 đến A-10, 6/6 ô đầy tải)' },
    { user: groom4, horses: [], zone: zoneA, shiftNotes: 'Trực dự phòng phân khu Barn A (Sẵn sàng nhận việc, 0/6 ô)' },
    { user: groom3, horses: groom3Horses, zone: zoneB, shiftNotes: 'Trực chính phân khu Barn B (Ô B-01 đến B-03, 3/6 ô)' },
  ];

  for (const gp of groomProfiles) {
    await prisma.shiftRoster.deleteMany({
      where: {
        groomUserId: gp.user.id,
        date: todayDate,
      },
    });

    await prisma.shiftRoster.create({
      data: {
        groomUserId: gp.user.id,
        date: todayDate,
        shiftId: shiftMorning.id,
        zoneId: gp.zone.id,
        notes: gp.shiftNotes,
      },
    });

    await prisma.dailyCareTask.deleteMany({
      where: {
        assignedGroomUserId: gp.user.id,
        date: todayDate,
      },
    });

    // Định mức chuẩn: Mỗi Groom chăm sóc đúng 6 chuồng = 6 con ngựa.
    // Mỗi con ngựa có đúng 4 đầu việc/ngày:
    // 1. 06:00: FEEDING (Ăn sáng) - Hoàn thành
    // 2. 08:30: CLEANING (Dọn chuồng) - Hoàn thành
    // 3. 10:00: GROOMING (Chải lông & cạo móng) - Hoàn thành
    // 4. 16:30: FEEDING (Ăn chiều) - Chưa hoàn thành (Chờ ca chiều)
    // Tổng cộng: đúng 24 công việc/ngày cho mỗi Groom (18 việc hoàn thành ca sáng, 6 việc ca chiều).
    const taskSchedule = [
      {
        title: 'Cho ăn cỏ khô Alfalfa & kiểm tra nước uống',
        time: '06:00',
        type: DailyTaskType.FEEDING,
        isCompleted: true,
        completedHour: 6,
        completedMinute: 20,
      },
      {
        title: 'Dọn chuồng, thay rơm lót & khử khuẩn ô chuồng',
        time: '08:30',
        type: DailyTaskType.CLEANING,
        isCompleted: true,
        completedHour: 8,
        completedMinute: 45,
      },
      {
        title: 'Chải lông, vệ sinh mắt mũi & cạo móng',
        time: '10:00',
        type: DailyTaskType.GROOMING,
        isCompleted: true,
        completedHour: 10,
        completedMinute: 30,
      },
      {
        title: 'Cho ăn thức ăn tinh & bổ sung khoáng chất ca chiều',
        time: '16:30',
        type: DailyTaskType.FEEDING,
        isCompleted: false,
      },
    ];

    let taskIndex = 1;
    for (const hItem of gp.horses) {
      for (const t of taskSchedule) {
        let completedAt: Date | null = null;
        if (t.isCompleted) {
          completedAt = new Date(todayDate);
          completedAt.setHours(t.completedHour!, t.completedMinute!, 0, 0);
        }
        await prisma.dailyCareTask.create({
          data: {
            taskCode: `TASK-${gp.user.email.split('@')[0].toUpperCase()}-${todayStr.replace(/-/g, '')}-${String(taskIndex).padStart(2, '0')}`,
            date: todayDate,
            assignedGroomUserId: gp.user.id,
            horseId: hItem.horse.id,
            stallZoneId: gp.zone.id,
            stallId: hItem.stall.id,
            taskType: t.type,
            title: `${t.title} (${hItem.horse.name})`,
            scheduledTime: t.time,
            isCompleted: t.isCompleted,
            completedAt,
            completedById: t.isCompleted ? gp.user.id : null,
          },
        });
        taskIndex++;
      }
    }
  }

  // --- Ca tập hôm nay của HLV A tuân thủ đệm an toàn >= 45 phút ---
  // Tìm giáo án hoạt động của HLV A
  const activePlanA = await prisma.trainingPlan.findFirst({
    where: { trainerUserId: trainerA.id, status: PlanStatus.ACTIVE },
    include: { horse: true },
  });

  if (activePlanA) {
    const startToday = new Date(`${todayStr}T00:00:00+07:00`);
    const endToday = new Date(`${todayStr}T23:59:59.999+07:00`);
    // Dọn sạch toàn bộ ca tập hôm nay cũ của ngày để triệt tiêu mọi xung đột hoặc dữ liệu rác
    await prisma.workoutSession.deleteMany({
      where: {
        scheduledDate: { gte: startToday, lte: endToday },
      },
    });

    // Ca 1: 07:00 - 07:45 (Sân Cỏ - TURF) cho Phong Lôi
    const workout1Time = new Date(`${todayStr}T07:00:00+07:00`);
    await prisma.workoutSession.create({
      data: {
        trainingPlanId: activePlanA.id,
        horseId: activePlanA.horseId,
        assignedStaffUserId: trainerA.id,
        scheduledDate: workout1Time,
        workoutType: 'CANTER',
        intensity: 'MEDIUM',
        trackSurface: TrackSurface.TURF,
        distanceMeters: 1400,
        repetitions: 1,
        status: WorkoutStatus.COMPLETED,
        performanceScore: 8.8,
        heartRatePeak: 188,
        heartRateRecovery: 96,
        resultRecordedAt: new Date(`${todayStr}T07:45:00+07:00`),
        trainerNotes: 'Bắt nhịp chạy tốt trên thảm cỏ, nhịp tim hồi phục ổn định.',
      },
    });

    // Ca 2: 08:30 - 09:15 (Sân Cát - DIRT) cho Tuyết Ảnh -> Cách Ca 1 kết thúc (07:45) đúng 45 phút đệm an toàn
    const horseA2 = groom1Horses[1]?.horse ?? activePlanA.horse;
    const planA2 = (await prisma.trainingPlan.findFirst({ where: { horseId: horseA2.id, status: PlanStatus.ACTIVE } })) ?? activePlanA;
    const workout2Time = new Date(`${todayStr}T08:30:00+07:00`);
    await prisma.workoutSession.create({
      data: {
        trainingPlanId: planA2.id,
        horseId: horseA2.id,
        assignedStaffUserId: trainerA.id,
        scheduledDate: workout2Time,
        workoutType: 'TROT',
        intensity: 'MEDIUM',
        trackSurface: TrackSurface.DIRT,
        distanceMeters: 1200,
        repetitions: 1,
        status: WorkoutStatus.SCHEDULED,
        trainerNotes: 'Chuyển sân cát sau 45 phút đệm an toàn, khởi động kỹ cổ chân.',
      },
    });

    // Ca 3: 15:30 - 16:15 (Sân Cát - DIRT) cho Lôi Chấn
    const horseA3 = groom1Horses[2]?.horse ?? activePlanA.horse;
    const planA3 = (await prisma.trainingPlan.findFirst({ where: { horseId: horseA3.id, status: PlanStatus.ACTIVE } })) ?? activePlanA;
    const workout3Time = new Date(`${todayStr}T15:30:00+07:00`);
    await prisma.workoutSession.create({
      data: {
        trainingPlanId: planA3.id,
        horseId: horseA3.id,
        assignedStaffUserId: trainerA.id,
        scheduledDate: workout3Time,
        workoutType: 'BREEZE',
        intensity: 'HIGH',
        trackSurface: TrackSurface.DIRT,
        distanceMeters: 1000,
        repetitions: 1,
        status: WorkoutStatus.SCHEDULED,
        trainerNotes: 'Bài tập tốc độ chiều trên sân cát.',
      },
    });

    // Ca 4: 17:00 - 17:45 (Sân Cỏ - TURF) cho Dạ Nguyệt -> Cách Ca 3 kết thúc (16:15) đúng 45 phút đệm an toàn
    const horseA4 = groom1Horses[3]?.horse ?? activePlanA.horse;
    const planA4 = (await prisma.trainingPlan.findFirst({ where: { horseId: horseA4.id, status: PlanStatus.ACTIVE } })) ?? activePlanA;
    const workout4Time = new Date(`${todayStr}T17:00:00+07:00`);
    await prisma.workoutSession.create({
      data: {
        trainingPlanId: planA4.id,
        horseId: horseA4.id,
        assignedStaffUserId: trainerA.id,
        scheduledDate: workout4Time,
        workoutType: 'WALK',
        intensity: 'LIGHT',
        trackSurface: TrackSurface.TURF,
        distanceMeters: 800,
        repetitions: 1,
        status: WorkoutStatus.SCHEDULED,
        trainerNotes: 'Đi bộ thư giãn trên thảm cỏ cuối ngày sau 45 phút đệm an toàn.',
      },
    });
  }

  console.log('✅ [seed-demo-flow] HOÀN TẤT KHỞI TẠO DỮ LIỆU DEMO 100% THÀNH CÔNG!');
  console.log('---------------------------------------------------------------------');
  console.log('🔑 THÔNG TIN TÀI KHOẢN ĐĂNG NHẬP (Mật khẩu chung: EquiFlow@2026):');
  console.log('   - Quản lý CLB:     manager@gmail.com  (Nguyễn Hoàng Long)');
  console.log('   - Huấn luyện viên: trainer@gmail.com  (Nguyễn Văn Tuấn)');
  console.log('   - Huấn luyện viên: trainer2@gmail.com (Lê Hoàng Nam)');
  console.log('   - Huấn luyện viên: trainer3@gmail.com (Phạm Quốc Trung)');
  console.log(`   - Groom 1 (Barn A, 4/6 ô):  groom@gmail.com    (Trần Thị Mai)
   - Groom 2 (Barn A, 6/6 ô):  groom2@gmail.com   (Hoàng Văn Phúc)
   - Groom 3 (Barn B, 3/6 ô):  groom3@gmail.com   (Đỗ Thị Mai)
   - Groom 4 (Barn A, 0/6 ô):  groom4@gmail.com   (Lê Quốc Tuấn)`);
  console.log('---------------------------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi seed demo:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
