import {
  PrismaClient,
  Role,
  UserStatus,
  HorseStatus,
  StallStatus,
  PlanStatus,
  WorkoutStatus,
  TrainerAssignmentStatus,
  TrackSurface,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('=== BẮT ĐẦU SEED DỮ LIỆU DEMO 100% HUẤN LUYỆN VIÊN (TRAINER) ===');

  const passwordHash = await bcrypt.hash('EquiFlow@2026', 10);
  const now = new Date();

  // Xác định ngày demo: Lấy ngày mai lúc 00:00 UTC
  const demoDate = new Date(now);
  demoDate.setDate(now.getDate() + 1);
  const demoDateStr = demoDate.toISOString().split('T')[0];

  // 1. Quản lý CLB & Bác sĩ & Groom
  console.log('[1/6] Thiết lập tài khoản Quản lý CLB, Bác sĩ thú y, Groom...');
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

  const vet = await prisma.user.upsert({
    where: { email: 'vet.ha@gmail.com' },
    update: { passwordHash, status: UserStatus.ACTIVE, fullName: 'BS. Hà Thu Thảo' },
    create: {
      email: 'vet.ha@gmail.com',
      passwordHash,
      fullName: 'BS. Hà Thu Thảo',
      role: Role.VETERINARIAN,
      status: UserStatus.ACTIVE,
      phoneNumber: '0903000001',
    },
  });

  const groom = await prisma.user.upsert({
    where: { email: 'groom.phuc@gmail.com' },
    update: { passwordHash, status: UserStatus.ACTIVE, fullName: 'Hoàng Văn Phúc' },
    create: {
      email: 'groom.phuc@gmail.com',
      passwordHash,
      fullName: 'Hoàng Văn Phúc',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
      phoneNumber: '0904000001',
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

  // 2. Khu chuồng (Barns): Barn A (Đã có HLV), Barn C (Barn trống)
  console.log('[2/6] Thiết lập Khu chuồng Barn A (Đã có người) và Barn C (Trống)...');
  const barnA = await prisma.stallZone.upsert({
    where: { code: 'BARN-A' },
    update: { name: 'Barn A · Khu Huấn Luyện Chính' },
    create: {
      code: 'BARN-A',
      name: 'Barn A · Khu Huấn Luyện Chính',
      rows: 2,
      cols: 6,
      isActive: true,
    },
  });

  const barnC = await prisma.stallZone.upsert({
    where: { code: 'BARN-C' },
    update: { name: 'Barn C · Phân Khu Mới (Trống)' },
    create: {
      code: 'BARN-C',
      name: 'Barn C · Phân Khu Mới (Trống)',
      rows: 2,
      cols: 4,
      isActive: true,
    },
  });

  // Tạo các ô chuồng A-01, A-02, A-03, A-04 cho Barn A và C-01 cho Barn C
  const stallA01 = await prisma.stall.upsert({
    where: { code: 'A-01' },
    update: { zone: barnA.name, zoneId: barnA.id, status: StallStatus.OCCUPIED },
    create: { code: 'A-01', zone: barnA.name, zoneId: barnA.id, status: StallStatus.OCCUPIED, row: 1, col: 1 },
  });
  const stallA02 = await prisma.stall.upsert({
    where: { code: 'A-02' },
    update: { zone: barnA.name, zoneId: barnA.id, status: StallStatus.OCCUPIED },
    create: { code: 'A-02', zone: barnA.name, zoneId: barnA.id, status: StallStatus.OCCUPIED, row: 1, col: 2 },
  });
  const stallA03 = await prisma.stall.upsert({
    where: { code: 'A-03' },
    update: { zone: barnA.name, zoneId: barnA.id, status: StallStatus.OCCUPIED },
    create: { code: 'A-03', zone: barnA.name, zoneId: barnA.id, status: StallStatus.OCCUPIED, row: 1, col: 3 },
  });
  const stallA04 = await prisma.stall.upsert({
    where: { code: 'A-04' },
    update: { zone: barnA.name, zoneId: barnA.id, status: StallStatus.OCCUPIED },
    create: { code: 'A-04', zone: barnA.name, zoneId: barnA.id, status: StallStatus.OCCUPIED, row: 1, col: 4 },
  });

  // Tạo chuồng C-01 trong Barn C
  const stallC01 = await prisma.stall.upsert({
    where: { code: 'C-01' },
    update: { zone: barnC.name, zoneId: barnC.id, status: StallStatus.OCCUPIED },
    create: {
      code: 'C-01',
      zone: barnC.name,
      zoneId: barnC.id,
      status: StallStatus.OCCUPIED,
      row: 1,
      col: 1,
    },
  });

  // 3. Huấn luyện viên chính hiện tại: Trần Minh Quân (phụ trách Barn A)
  // và Huấn luyện viên phụ Nguyễn Văn Tuấn (để nhận ngựa nền chạy thử)
  console.log('[3/6] Thiết lập Huấn luyện viên Trần Minh Quân (Barn A) và Nguyễn Văn Tuấn...');
  const trainerQuan = await prisma.user.upsert({
    where: { email: 'trainer.quan@gmail.com' },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      fullName: 'Trần Minh Quân',
      assignedBarnId: barnA.id,
    },
    create: {
      email: 'trainer.quan@gmail.com',
      passwordHash,
      fullName: 'Trần Minh Quân',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0902888888',
      assignedBarnId: barnA.id,
    },
  });

  const trainerTuan = await prisma.user.upsert({
    where: { email: 'trainer@gmail.com' },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      fullName: 'Nguyễn Văn Tuấn',
    },
    create: {
      email: 'trainer@gmail.com',
      passwordHash,
      fullName: 'Nguyễn Văn Tuấn',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0902000001',
    },
  });

  // Đảm bảo Barn C không bị bất kỳ HLV nào phụ trách (để thành Barn trống)
  await prisma.user.updateMany({
    where: { assignedBarnId: barnC.id },
    data: { assignedBarnId: null },
  });

  // Xóa tài khoản demo cũ nếu có để sẵn sàng mời mới trên UI
  await prisma.otpCode.deleteMany({
    where: { email: { in: ['trainer.nam@gmail.com', 'trainer.trong@gmail.com'] } },
  });
  const targetUsers = await prisma.user.findMany({
    where: { email: { in: ['trainer.nam@gmail.com', 'trainer.trong@gmail.com'] } },
    select: { id: true },
  });
  const targetUserIds = targetUsers.map((u) => u.id);
  if (targetUserIds.length > 0) {
    await prisma.horseHandoverRequest.deleteMany({
      where: {
        OR: [{ fromManagerId: { in: targetUserIds } }, { toTrainerId: { in: targetUserIds } }],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: targetUserIds } },
    });
  }

  // 4. Đường chạy huấn luyện (Tracks)
  console.log('[4/6] Khởi tạo hệ thống đường chạy (Cỏ A sức chứa 6, Cỏ B sức chứa 4)...');
  const trackTurfA = await prisma.trainingTrack.upsert({
    where: { code: 'TRK-TURF-A' },
    update: { name: 'Đường chạy cỏ A (Chính)', surface: 'TURF', capacity: 6, isActive: true },
    create: {
      code: 'TRK-TURF-A',
      name: 'Đường chạy cỏ A (Chính)',
      surface: 'TURF',
      capacity: 6,
      isActive: true,
    },
  });

  const trackTurfB = await prisma.trainingTrack.upsert({
    where: { code: 'TRK-TURF-B' },
    update: { name: 'Đường chạy cỏ B (Phụ)', surface: 'TURF', capacity: 4, isActive: true },
    create: {
      code: 'TRK-TURF-B',
      name: 'Đường chạy cỏ B (Phụ)',
      surface: 'TURF',
      capacity: 4,
      isActive: true,
    },
  });

  await prisma.trainingTrack.upsert({
    where: { code: 'TRK-DIRT-A' },
    update: { name: 'Đường chạy cát A (Cát mịn)', surface: 'DIRT', capacity: 6, isActive: true },
    create: {
      code: 'TRK-DIRT-A',
      name: 'Đường chạy cát A (Cát mịn)',
      surface: 'DIRT',
      capacity: 6,
      isActive: true,
    },
  });

  await prisma.trainingTrack.upsert({
    where: { code: 'TRK-SYNTH-A' },
    update: { name: 'Đường chạy tổng hợp A', surface: 'SYNTHETIC', capacity: 6, isActive: true },
    create: {
      code: 'TRK-SYNTH-A',
      name: 'Đường chạy tổng hợp A',
      surface: 'SYNTHETIC',
      capacity: 6,
      isActive: true,
    },
  });

  // 5. Chiến mã phục vụ kịch bản: Hắc Long Mã & Bạch Long Mã
  console.log('[5/6] Thiết lập chiến mã Hắc Long Mã (chờ giao) và Bạch Long Mã...');
  const hacLongMa = await prisma.horse.upsert({
    where: { horseCode: 'HRS-HLM-99' },
    update: {
      name: 'Hắc Long Mã',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: null,
      trainerAssignmentStatus: TrainerAssignmentStatus.UNASSIGNED,
    },
    create: {
      horseCode: 'HRS-HLM-99',
      name: 'Hắc Long Mã',
      breed: 'Thoroughbred',
      dob: new Date('2022-03-15'),
      gender: 'Colt',
      color: 'Black',
      weightKg: 510,
      microchip: '985141000999999',
      microchipRfid: 'RFID-HLM-999999',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: null,
      trainerAssignmentStatus: TrainerAssignmentStatus.UNASSIGNED,
    },
  });

  // Gán chuồng C-01 cho Hắc Long Mã
  await prisma.stallAllocation.deleteMany({
    where: { horseId: hacLongMa.id },
  });
  await prisma.stallAllocation.create({
    data: {
      stallId: stallC01.id,
      horseId: hacLongMa.id,
      assignedGroomUserId: groom.id,
      isActive: true,
    },
  });

  // Xóa mọi giáo án cũ của Hắc Long Mã để đảm bảo nó ở trạng thái Chưa có giáo án
  await prisma.workoutSession.deleteMany({
    where: { horseId: hacLongMa.id },
  });
  await prisma.trainingPlan.deleteMany({
    where: { horseId: hacLongMa.id },
  });

  // Gán chuồng A-01 cho Bạch Long Mã
  const bachLongMa = await prisma.horse.upsert({
    where: { horseCode: 'HRS-BLM-01' },
    update: {
      name: 'Bạch Long Mã',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: trainerQuan.id,
      trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
    },
    create: {
      horseCode: 'HRS-BLM-01',
      name: 'Bạch Long Mã',
      breed: 'Thoroughbred',
      dob: new Date('2021-05-10'),
      gender: 'Stallion',
      color: 'Gray',
      weightKg: 495,
      microchip: '985141000111111',
      microchipRfid: 'RFID-BLM-111111',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: trainerQuan.id,
      trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
    },
  });

  await prisma.stallAllocation.deleteMany({ where: { horseId: bachLongMa.id } });
  await prisma.stallAllocation.create({
    data: {
      stallId: stallA01.id,
      horseId: bachLongMa.id,
      assignedGroomUserId: groom.id,
      isActive: true,
    },
  });

  // 5b. Thiết lập 2 chiến mã nợ giáo án để kích hoạt ngưỡng WIP Limit = 2 của HLV Trần Minh Quân
  console.log('[5b] Thiết lập 2 chiến mã Xích Thổ & Phi Tiêu nợ giáo án (WIP Limit = 2)...');
  const xichTho = await prisma.horse.upsert({
    where: { horseCode: 'HRS-XT-01' },
    update: {
      name: 'Xích Thổ',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: trainerQuan.id,
      trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
    },
    create: {
      horseCode: 'HRS-XT-01',
      name: 'Xích Thổ',
      breed: 'Thoroughbred',
      dob: new Date('2021-06-15'),
      gender: 'Colt',
      color: 'Chestnut',
      weightKg: 505,
      microchip: '985141000222222',
      microchipRfid: 'RFID-XT-222222',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: trainerQuan.id,
      trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
    },
  });
  await prisma.stallAllocation.deleteMany({ where: { horseId: xichTho.id } });
  await prisma.stallAllocation.create({
    data: { stallId: stallA02.id, horseId: xichTho.id, assignedGroomUserId: groom.id, isActive: true },
  });
  await prisma.workoutSession.deleteMany({ where: { horseId: xichTho.id } });
  await prisma.trainingPlan.deleteMany({ where: { horseId: xichTho.id } });

  const phiTieu = await prisma.horse.upsert({
    where: { horseCode: 'HRS-PT-02' },
    update: {
      name: 'Phi Tiêu',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: trainerQuan.id,
      trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
    },
    create: {
      horseCode: 'HRS-PT-02',
      name: 'Phi Tiêu',
      breed: 'Thoroughbred',
      dob: new Date('2021-08-20'),
      gender: 'Filly',
      color: 'Bay',
      weightKg: 480,
      microchip: '985141000333333',
      microchipRfid: 'RFID-PT-333333',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: trainerQuan.id,
      trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
    },
  });
  await prisma.stallAllocation.deleteMany({ where: { horseId: phiTieu.id } });
  await prisma.stallAllocation.create({
    data: { stallId: stallA03.id, horseId: phiTieu.id, assignedGroomUserId: groom.id, isActive: true },
  });
  await prisma.workoutSession.deleteMany({ where: { horseId: phiTieu.id } });
  await prisma.trainingPlan.deleteMany({ where: { horseId: phiTieu.id } });

  // Chiến mã Hắc Phong ở Barn A, chưa có HLV -> Dùng để demo Quản lý cố tình gán con thứ 3 cho HLV Quân và bị chặn WIP Limit!
  const hacPhong = await prisma.horse.upsert({
    where: { horseCode: 'HRS-HP-03' },
    update: {
      name: 'Hắc Phong',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: null,
      trainerAssignmentStatus: TrainerAssignmentStatus.UNASSIGNED,
    },
    create: {
      horseCode: 'HRS-HP-03',
      name: 'Hắc Phong',
      breed: 'Thoroughbred',
      dob: new Date('2022-02-10'),
      gender: 'Colt',
      color: 'Black',
      weightKg: 515,
      microchip: '985141000444444',
      microchipRfid: 'RFID-HP-444444',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: null,
      trainerAssignmentStatus: TrainerAssignmentStatus.UNASSIGNED,
    },
  });
  await prisma.stallAllocation.deleteMany({ where: { horseId: hacPhong.id } });
  await prisma.stallAllocation.create({
    data: { stallId: stallA04.id, horseId: hacPhong.id, assignedGroomUserId: groom.id, isActive: true },
  });
  await prisma.workoutSession.deleteMany({ where: { horseId: hacPhong.id } });
  await prisma.trainingPlan.deleteMany({ where: { horseId: hacPhong.id } });

  // Tạo giáo án đang chạy cho Bạch Long Mã
  let planBachLongMa = await prisma.trainingPlan.findFirst({
    where: { horseId: bachLongMa.id, status: PlanStatus.ACTIVE },
  });
  if (!planBachLongMa) {
    planBachLongMa = await prisma.trainingPlan.create({
      data: {
        horseId: bachLongMa.id,
        trainerUserId: trainerQuan.id,
        phaseName: 'Giai đoạn thể lực cơ bản',
        status: PlanStatus.ACTIVE,
        trackSurface: TrackSurface.TURF,
        startDate: new Date(demoDateStr + 'T00:00:00.000Z'),
        endDate: new Date(new Date(demoDateStr).getTime() + 14 * 86400000),
      },
    });
  }

  // Khởi tạo các bài tập của Bạch Long Mã (HLV Trần Minh Quân tự dẫn tập & kiêm nài):
  // 1. Prime Time Bài Nặng 1: 06:15 - 07:00 (BREEZE, ép HEAVY)
  // 2. Prime Time Bài Nặng 2: 07:15 - 08:00 (TRIAL, ép HEAVY) -> HLV Quân đã đạt 2/2 bài nặng giờ vàng!
  // 3. Bài tập buổi sáng: 09:30 - 10:30 (CANTER) -> Dùng để test đệm HLV 15p!
  await prisma.workoutSession.deleteMany({
    where: { trainingPlanId: planBachLongMa.id },
  });
  await prisma.workoutSession.createMany({
    data: [
      {
        trainingPlanId: planBachLongMa.id,
        horseId: bachLongMa.id,
        trackId: trackTurfA.id,
        assignedStaffUserId: trainerQuan.id,
        jockeyName: trainerQuan.fullName,
        scheduledDate: new Date(demoDateStr + 'T06:15:00.000Z'),
        workoutType: 'BREEZE',
        intensity: 'HEAVY',
        trackSurface: 'TURF',
        status: WorkoutStatus.SCHEDULED,
        distanceMeters: 1000,
        targetSpeedKmh: 55,
      },
      {
        trainingPlanId: planBachLongMa.id,
        horseId: bachLongMa.id,
        trackId: trackTurfB.id,
        assignedStaffUserId: trainerQuan.id,
        jockeyName: trainerQuan.fullName,
        scheduledDate: new Date(demoDateStr + 'T07:15:00.000Z'),
        workoutType: 'TRIAL',
        intensity: 'HEAVY',
        trackSurface: 'TURF',
        status: WorkoutStatus.SCHEDULED,
        distanceMeters: 1200,
        targetSpeedKmh: 60,
      },
      {
        trainingPlanId: planBachLongMa.id,
        horseId: bachLongMa.id,
        trackId: trackTurfB.id,
        assignedStaffUserId: trainerQuan.id,
        jockeyName: trainerQuan.fullName,
        scheduledDate: new Date(demoDateStr + 'T09:30:00.000Z'),
        workoutType: 'CANTER',
        intensity: 'MEDIUM',
        trackSurface: 'TURF',
        status: WorkoutStatus.SCHEDULED,
        distanceMeters: 1600,
        targetSpeedKmh: 40,
      },
    ],
  });

  // 6. Tạo 6 bài tập trên Đường chạy Cỏ A lúc 07:00 - 08:00 ngày demo để làm đầy sức chứa 6/6
  // Chú ý: Gán cho HLV Nguyễn Văn Tuấn (trainerTuan) để không chiếm hạn mức 8 ngựa của HLV Trần Minh Quân
  console.log('[6/6] Tạo 6 buổi tập làm đầy sức chứa Đường chạy Cỏ A (6/6 chỗ lúc 07:00)...');
  for (let i = 1; i <= 6; i++) {
    const bgHorseCode = `HRS-BG-${String(i).padStart(2, '0')}`;
    const bgHorse = await prisma.horse.upsert({
      where: { horseCode: bgHorseCode },
      update: {
        name: `Chiến mã chạy thử ${i}`,
        status: HorseStatus.ACTIVE,
        assignedTrainerId: trainerTuan.id,
        trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
      },
      create: {
        horseCode: bgHorseCode,
        name: `Chiến mã chạy thử ${i}`,
        breed: 'Thoroughbred',
        dob: new Date('2022-01-01'),
        gender: 'Colt',
        color: 'Bay',
        weightKg: 500,
        microchip: `98514199900000${i}`,
        microchipRfid: `RFID-BG-00000${i}`,
        status: HorseStatus.ACTIVE,
        ownerId: owner.id,
        assignedTrainerId: trainerTuan.id,
        trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
      },
    });

    let bgPlan = await prisma.trainingPlan.findFirst({
      where: { horseId: bgHorse.id, status: PlanStatus.ACTIVE },
    });
    if (!bgPlan) {
      bgPlan = await prisma.trainingPlan.create({
        data: {
          horseId: bgHorse.id,
          trainerUserId: trainerTuan.id,
          phaseName: `Giai đoạn nền tảng ${i}`,
          status: PlanStatus.ACTIVE,
          trackSurface: TrackSurface.TURF,
          startDate: new Date(demoDateStr + 'T00:00:00.000Z'),
          endDate: new Date(new Date(demoDateStr).getTime() + 14 * 86400000),
        },
      });
    } else {
      await prisma.trainingPlan.update({
        where: { id: bgPlan.id },
        data: { trainerUserId: trainerTuan.id },
      });
    }

    // Xóa session cũ cùng khung giờ
    await prisma.workoutSession.deleteMany({
      where: {
        trackId: trackTurfA.id,
        scheduledDate: new Date(demoDateStr + 'T07:00:00.000Z'),
        trainingPlanId: bgPlan.id,
      },
    });

    // Tạo bài tập lấp đầy slot 07:00
    await prisma.workoutSession.create({
      data: {
        trainingPlanId: bgPlan.id,
        horseId: bgHorse.id,
        trackId: trackTurfA.id,
        scheduledDate: new Date(demoDateStr + 'T07:00:00.000Z'),
        workoutType: 'TROT',
        intensity: 'LIGHT',
        trackSurface: 'TURF',
        status: WorkoutStatus.SCHEDULED,
        distanceMeters: 1200,
        targetSpeedKmh: 25,
      },
    });
  }

  console.log('=== HOÀN TẤT SEED DỮ LIỆU DEMO HUẤN LUYỆN VIÊN 100% THÀNH CÔNG ===');
  console.log('Thông tin tài khoản đăng nhập:');
  console.log('- Quản lý CLB:       manager@gmail.com       | Mật khẩu: EquiFlow@2026');
  console.log('- HLV chính:          trainer.quan@gmail.com  | Mật khẩu: EquiFlow@2026 (Barn A)');
  console.log('- Bác sĩ thú y:      vet.ha@gmail.com        | Mật khẩu: EquiFlow@2026');
  console.log('- Groom chăm sóc:    groom.phuc@gmail.com    | Mật khẩu: EquiFlow@2026');
  console.log('- Mailpit Web:       http://localhost:8025');
  console.log('Dữ liệu sẵn sàng:');
  console.log(`- Barn C (Trống): Sẵn sàng để gán cho HLV mới.`);
  console.log(`- Barn A (Đã có người): Dùng để test cảnh báo Barn đã có người quản lý.`);
  console.log(`- Hắc Long Mã (HRS-HLM-99): Sẵn sàng để Quản lý giao cho HLV và lên giáo án.`);
  console.log(`- Ngày demo kiểm thử: ${demoDateStr}`);
  console.log(`  + Đường chạy Cỏ A lúc 07:00: ĐÃ ĐẦY 6/6 ngựa.`);
  console.log(`  + HLV Trần Minh Quân lúc 08:00: ĐÃ BẬN tập cho Bạch Long Mã.`);
}

main()
  .catch((e) => {
    console.error('Lỗi khi chạy seed-trainer-demo:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
