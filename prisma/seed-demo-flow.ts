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
  // 3. THIẾT LẬP TẢI CỦA 3 HUẤN LUYỆN VIÊN (A3)
  // =========================================================================
  console.log('⚖️ [3/5] Thiết lập định mức tải cho 3 Huấn luyện viên...');

  // Reset các ngựa filler cũ nếu có (xóa sạch các liên kết phụ thuộc trước khi xóa ngựa)
  const demoHorseFilter = { horse: { horseCode: { startsWith: 'HR-DEMO-' } } };
  await prisma.workoutSession.deleteMany({ where: demoHorseFilter });
  await prisma.dailyCareTask.deleteMany({ where: demoHorseFilter });
  await prisma.trainingPlan.deleteMany({ where: demoHorseFilter });
  await prisma.stallAllocation.deleteMany({ where: demoHorseFilter });

  await prisma.horse.deleteMany({
    where: { horseCode: { startsWith: 'HR-DEMO-' } },
  });

  // Dọn dẹp triệt để các giáo án ACTIVE/DRAFT cũ từ seed.ts của 3 HLV để không bị cộng dồn vượt định mức 8/8
  await prisma.trainingPlan.updateMany({
    where: {
      trainerUserId: { in: [trainerA.id, trainerB.id, trainerC.id] },
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

  // Mảng theo dõi 6 chiến mã của mỗi Groom
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
        type: 'FOUNDATION',
        startDate: startDate.toISOString().slice(0, 10),
        endDate: phase1End.toISOString().slice(0, 10),
        sessionsPerWeek: 3,
        maxWeeklyDistance: 6000,
        surface: params.trackSurface,
      },
      {
        id: `${params.planCode}-PH2`,
        name: 'Giai đoạn 2: Tăng tốc & Sức bền',
        type: 'SPEED',
        startDate: phase2Start.toISOString().slice(0, 10),
        endDate: phase2End.toISOString().slice(0, 10),
        sessionsPerWeek: 3,
        maxWeeklyDistance: 8000,
        surface: params.trackSurface,
      },
      {
        id: `${params.planCode}-PH3`,
        name: 'Giai đoạn 3: Phục hồi & Nước rút',
        type: 'RECOVERY',
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

    // Phân bổ khoa học 4 tuần qua: 8 buổi tập đều đặn (mỗi tuần 2 buổi) -> avg4w = 12.0 điểm
    const prior4wOffsets = [-32, -29, -25, -22, -18, -15, -11, -8];
    // 7 ngày qua: 2 buổi tập chuẩn (tải = 12.0 điểm -> ACWR = 1.0)
    // Riêng ngựa isLoadSpike (Phong Lôi): 3 buổi tập với cự ly tăng dần -> ACWR = 1.38 > 1.3 (Spike chuẩn duy nhất)
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

  // --- HLV B (trainer2@gmail.com): Đúng 8 con -> ĐẦY TẢI 8/8 ---
  console.log('  -> Tạo 8 ngựa cho HLV B để đạt 8/8 đầy tải...');
  const horseNamesB = [
    'Tuyết Phong', 'Kim Long', 'Thần Phong', 'Hắc Báo',
    'Hồng Kỳ', 'Phi Vũ', 'Tử Điện', 'Thanh Loan',
  ];
  for (let i = 1; i <= 8; i++) {
    const avatarUrl = `/images/horses/horse-${String(i).padStart(2, '0')}.jpg`;
    const h = await prisma.horse.create({
      data: {
        horseCode: `HR-DEMO-B0${i}`,
        name: horseNamesB[i - 1],
        breed: 'Thoroughbred',
        gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
        color: 'Bay',
        avatarUrl,
        dob: new Date('2022-03-15'),
        weightKg: 460 + i * 5,
        microchip: `98500000200${i}`,
        microchipRfid: `98500000200${i}`,
        status: HorseStatus.ACTIVE,
        ownerId: owner.id,
      },
    });

    let assignedStall: any = null;
    let assignedGroomId: string | null = null;
    if (i <= 4) {
      // 4 con đầu (i=1..4): Gán vào A-07 đến A-10 của Barn A cho Groom 2 (Hoàng Văn Phúc)
      assignedStall = stallsA[5 + i];
      assignedGroomId = groom2.id;
      groom2Horses.push({ horse: h, stall: assignedStall });
    } else if (i <= 6) {
      // Con thứ 5 và 6: Gán vào A-11 và A-12 của Barn A
      assignedStall = stallsA[5 + i];
      assignedGroomId = groom2.id;
      groom2Horses.push({ horse: h, stall: assignedStall });
    } else {
      // Con thứ 7 và 8: Gán vào A-05 và A-06 của Barn A để đủ 8 con trong cùng Barn A
      assignedStall = stallsA[i - 3];
      assignedGroomId = groom2.id;
      groom2Horses.push({ horse: h, stall: assignedStall });
    }

    await prisma.stallAllocation.create({
      data: {
        stallId: assignedStall.id,
        horseId: h.id,
        assignedGroomUserId: assignedGroomId,
        isActive: true,
      },
    });

    // Tạo giáo án đang chạy cho HLV B (đủ 6 giáo án -> 6/6 Đầy tải)
    await createLivePlanWithWorkouts({
      horseId: h.id,
      trainerUserId: trainerB.id,
      planCode: `GA-DEMO-B0${i}`,
      phaseName: `Giáo án Thể lực & Sức bền B${i}`,
      objective: 'Duy trì thể lực đỉnh cao và kiểm soát nhịp tim.',
      baseScore: 8.4 + (i % 3) * 0.2,
      trackSurface: TrackSurface.TURF,
      isLoadSpike: false,
    });
  }

  // --- HLV C (trainer3@gmail.com): 3 con ở Barn B -> LỆCH BARN KHI CHỌN NGỰA BARN A ---
  console.log('  -> Tạo 3 ngựa tại Barn B cho HLV C...');
  const horseNamesC = ['Ngàn Hoa', 'Thiên Mã', 'Hỏa Phụng'];
  for (let i = 1; i <= 3; i++) {
    const avatarUrl = `/images/horses/horse-${String(i + 8).padStart(2, '0')}.jpg`;
    const h = await prisma.horse.create({
      data: {
        horseCode: `HR-DEMO-C0${i}`,
        name: horseNamesC[i - 1],
        breed: 'Arabian',
        gender: 'MALE',
        color: 'Chestnut',
        avatarUrl,
        dob: new Date('2021-05-10'),
        weightKg: 440 + i * 10,
        microchip: `98500000300${i}`,
        microchipRfid: `98500000300${i}`,
        status: HorseStatus.ACTIVE,
        ownerId: owner.id,
      },
    });

    const stallC = stallsB[i - 1]; // B-01, B-02, B-03 cho Groom 3 (Đỗ Thị Mai)
    await prisma.stallAllocation.create({
      data: {
        stallId: stallC.id,
        horseId: h.id,
        assignedGroomUserId: groom3.id,
        isActive: true,
      },
    });
    groom3Horses.push({ horse: h, stall: stallC });

    // Tạo giáo án đang chạy cho HLV C (3 giáo án -> 3/8)
    await createLivePlanWithWorkouts({
      horseId: h.id,
      trainerUserId: trainerC.id,
      planCode: `GA-DEMO-C0${i}`,
      phaseName: `Giáo án Nước kiệu Cơ bản C${i}`,
      objective: 'Tập trung phản xạ và phối hợp bước chạy 1000m.',
      baseScore: 8.2 + (i % 3) * 0.3,
      trackSurface: TrackSurface.DIRT,
      isLoadSpike: false,
    });
  }

  // --- HLV A (trainer@gmail.com): Đúng 6 con nền tảng tại Barn A (+ 1 con demo = 7 con -> Sắp đầy tải) ---
  console.log('  -> Tạo các ngựa nền tảng cho HLV A...');
  const horseNamesA = ['Phong Lôi', 'Tuyết Ảnh', 'Lôi Chấn', 'Dạ Nguyệt', 'Lão Tướng', 'Huyền Vũ'];
  for (let i = 1; i <= 6; i++) {
    const avatarUrl = `/images/horses/horse-${String(i + 11).padStart(2, '0')}.jpg`;
    const h = await prisma.horse.create({
      data: {
        horseCode: `HR-DEMO-A0${i}`,
        name: horseNamesA[i - 1],
        breed: 'Quarter Horse',
        gender: 'MALE',
        color: 'Black',
        avatarUrl,
        dob: new Date('2022-01-20'),
        weightKg: 470,
        microchip: `98500000100${i}`,
        microchipRfid: `98500000100${i}`,
        status: HorseStatus.ACTIVE,
        ownerId: owner.id,
      },
    });

    const stallA = stallsA[i - 1]; // A-01 đến A-06
    let assignedGroomId: string | null = null;
    if (i <= 4) {
      // A-01 đến A-04: Gán cho Groom 1 (Trần Thị Mai) -> Đạt 4/6 ô (còn đúng 2 slot trống)
      assignedGroomId = groom.id;
      groom1Horses.push({ horse: h, stall: stallA });
    } else {
      // A-05 và A-06: Gán cho Groom 2 (Hoàng Văn Phúc) -> Cùng với 4 con HLV B đạt đúng 6/6 ô (ĐẦY TẢI)
      assignedGroomId = groom2.id;
      groom2Horses.push({ horse: h, stall: stallA });
    }

    await prisma.stallAllocation.create({
      data: {
        stallId: stallA.id,
        horseId: h.id,
        assignedGroomUserId: assignedGroomId,
        isActive: true,
      },
    });

    // Tạo giáo án đang chạy cho HLV A (đúng 6 giáo án nền tảng)
    await createLivePlanWithWorkouts({
      horseId: h.id,
      trainerUserId: trainerA.id,
      planCode: `GA-DEMO-A0${i}`,
      phaseName: `Giáo án Thể lực Tốc độ ${i}`,
      objective: 'Tăng cường sức bền và tốc độ nước rút 1200m.',
      baseScore: 8.5 + (i % 3) * 0.2,
      trackSurface: TrackSurface.TURF,
      isLoadSpike: i === 1,
    });
  }

  // =========================================================================
  // 4. BỐ TRÍ 4 CHIẾN MÃ DEMO THEO 4 TRẠNG THÁI (A4)
  // =========================================================================
  console.log('🐴 [4/5] Tạo 4 chiến mã demo 4 trạng thái phân công...');

  // --- Ngựa 1: Ngựa phụ demo Barn B chuồng B-06 ---
  const pendingHorse = await prisma.horse.upsert({
    where: { horseCode: 'HR-DEMO-PENDING' },
    update: {
      name: 'Bạch Mã Hoàng Tử',
      avatarUrl: '/images/horses/horse-18.jpg',
    },
    create: {
      horseCode: 'HR-DEMO-PENDING',
      name: 'Bạch Mã Hoàng Tử',
      avatarUrl: '/images/horses/horse-18.jpg',
      breed: 'Thoroughbred',
      gender: 'MALE',
      color: 'White',
      dob: new Date('2022-04-12'),
      weightKg: 485.5,
      microchip: '985000009901',
      microchipRfid: '985000009901',
      status: HorseStatus.RESTING,
      ownerId: owner.id,
    },
  });

  await prisma.stallAllocation.deleteMany({ where: { horseId: pendingHorse.id } });
  await prisma.stallAllocation.create({
    data: {
      stallId: stallsB[5].id, // Chuồng B-06 (Barn B) hoàn thiện đúng 6 chuồng cho Groom 3
      horseId: pendingHorse.id,
      assignedGroomUserId: groom3.id,
      isActive: true,
    },
  });
  groom3Horses.push({ horse: pendingHorse, stall: stallsB[5] });

  // --- Ngựa 2: Ngựa phụ demo ---
  const unassignedHorse = await prisma.horse.upsert({
    where: { horseCode: 'HR-DEMO-UNASSIGNED' },
    update: {
      name: 'Hắc Long Mã',
      avatarUrl: '/images/horses/horse-19.jpg',
    },
    create: {
      horseCode: 'HR-DEMO-UNASSIGNED',
      name: 'Hắc Long Mã',
      avatarUrl: '/images/horses/horse-19.jpg',
      breed: 'Quarter Horse',
      gender: 'MALE',
      color: 'Black',
      dob: new Date('2021-08-25'),
      weightKg: 510.0,
      microchip: '985000009902',
      microchipRfid: '985000009902',
      status: HorseStatus.RESTING,
      ownerId: owner.id,
    },
  });

  await prisma.stallAllocation.deleteMany({ where: { horseId: unassignedHorse.id } });

  // --- Ngựa 3: Ngựa phụ demo ---
  const declinedHorse = await prisma.horse.upsert({
    where: { horseCode: 'HR-DEMO-DECLINED' },
    update: {
      name: 'Xích Thố Vương',
      avatarUrl: '/images/horses/horse-02.jpg',
    },
    create: {
      horseCode: 'HR-DEMO-DECLINED',
      name: 'Xích Thố Vương',
      avatarUrl: '/images/horses/horse-02.jpg',
      breed: 'Arabian',
      gender: 'MALE',
      color: 'Chestnut',
      dob: new Date('2021-11-05'),
      weightKg: 495.0,
      microchip: '985000009903',
      microchipRfid: '985000009903',
      status: HorseStatus.RESTING,
      ownerId: owner.id,
    },
  });

  await prisma.stallAllocation.deleteMany({ where: { horseId: declinedHorse.id } });

  // --- Ngựa 4: NO-STALL (Chưa gán chuồng) ---
  const noStallHorse = await prisma.horse.upsert({
    where: { horseCode: 'HR-DEMO-NO-STALL' },
    update: {
      name: 'Phi Yến',
      avatarUrl: '/images/horses/horse-04.jpg',
    },
    create: {
      horseCode: 'HR-DEMO-NO-STALL',
      name: 'Phi Yến',
      avatarUrl: '/images/horses/horse-04.jpg',
      breed: 'Warmblood',
      gender: 'FEMALE',
      color: 'Bay',
      dob: new Date('2023-02-14'),
      weightKg: 430.0,
      microchip: '985000009904',
      microchipRfid: '985000009904',
      status: HorseStatus.RESTING,
      ownerId: owner.id,
    },
  });
  await prisma.stallAllocation.deleteMany({ where: { horseId: noStallHorse.id } });

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
