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
  MedicalRecordStatus,
  BodySide,
  SeverityLevel,
  InjuryStatus,
  PreventiveType,
  PreventiveStatus,
  InvoiceStatus,
  HandoverStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function runMasterSeed() {
  console.log('================================================================');
  console.log('=== BAT DAU CHAY MASTER SEED EQUIFLOW 100% CODE CONSISTENCY ===');
  console.log('================================================================');

  const passwordHash = await bcrypt.hash('EquiFlow@2026', 10);
  const now = new Date();

  // Moc ngay hom nay theo gio CLB (UTC+7)
  const todayClub = new Date(now.getTime() + 7 * 3600000).toISOString().split('T')[0];
  const tomorrowClub = new Date(now.getTime() + 7 * 3600000 + 86400000).toISOString().split('T')[0];
  const nextMonthClub = new Date(now.getTime() + 7 * 3600000 + 30 * 86400000).toISOString().split('T')[0];

  console.log(`[1/8] Moc thoi gian he thong: Hom nay = ${todayClub}, Ngay mai = ${tomorrowClub}`);

  // -------------------------------------------------------------
  // BUOC 1: THIET LAP CAC PHAN KHU CHUONG TRAI (BARNS)
  // -------------------------------------------------------------
  console.log('[2/8] Khoi tao cac phan khu chuong trai (Barn A, Barn B, Barn C)...');

  const barnA = await prisma.stallZone.upsert({
    where: { code: 'BARN-A' },
    update: { name: 'Barn A · Khu Huấn Luyện Chính', rows: 2, cols: 6, isActive: true },
    create: {
      code: 'BARN-A',
      name: 'Barn A · Khu Huấn Luyện Chính',
      rows: 2,
      cols: 6,
      isActive: true,
    },
  });

  const barnB = await prisma.stallZone.upsert({
    where: { code: 'BARN-B' },
    update: { name: 'Barn B · Khu Dưỡng Sức & Hồi Phục', rows: 2, cols: 4, isActive: true },
    create: {
      code: 'BARN-B',
      name: 'Barn B · Khu Dưỡng Sức & Hồi Phục',
      rows: 2,
      cols: 4,
      isActive: true,
    },
  });

  const barnC = await prisma.stallZone.upsert({
    where: { code: 'BARN-C' },
    update: { name: 'Barn C · Phân Khu Tiếp Nhận Mới', rows: 2, cols: 3, isActive: true },
    create: {
      code: 'BARN-C',
      name: 'Barn C · Phân Khu Tiếp Nhận Mới',
      rows: 2,
      cols: 3,
      isActive: true,
    },
  });

  // Khoi tao 12 o chuong cho Barn A (A-01 den A-12)
  const stallsA: any[] = [];
  for (let r = 1; r <= 2; r++) {
    for (let c = 1; c <= 6; c++) {
      const idx = (r - 1) * 6 + c;
      const code = `A-${String(idx).padStart(2, '0')}`;
      const stall = await prisma.stall.upsert({
        where: { code },
        update: { zone: barnA.name, zoneId: barnA.id, row: r, col: c },
        create: {
          code,
          zone: barnA.name,
          zoneId: barnA.id,
          row: r,
          col: c,
          status: StallStatus.OCCUPIED,
        },
      });
      stallsA.push(stall);
    }
  }

  // Khoi tao o chuong C-01 cho Barn C
  const stallC01 = await prisma.stall.upsert({
    where: { code: 'C-01' },
    update: { zone: barnC.name, zoneId: barnC.id, row: 1, col: 1, status: StallStatus.OCCUPIED },
    create: {
      code: 'C-01',
      zone: barnC.name,
      zoneId: barnC.id,
      row: 1,
      col: 1,
      status: StallStatus.OCCUPIED,
    },
  });

  // -------------------------------------------------------------
  // BUOC 2: THIET LAP TAI KHOAN NGUOI DUNG CHUAN 5 VAI TRO + 1 BOT
  // -------------------------------------------------------------
  console.log('[3/8] Thiet lap tai khoan chuan 5 vai tro + 1 System Bot...');

  // Quan ly CLB
  const manager = await prisma.user.upsert({
    where: { email: 'manager@gmail.com' },
    update: { fullName: 'Nguyễn Hoàng Long', role: Role.CLUB_MANAGER, status: UserStatus.ACTIVE, passwordHash },
    create: {
      email: 'manager@gmail.com',
      passwordHash,
      fullName: 'Nguyễn Hoàng Long',
      role: Role.CLUB_MANAGER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0901000001',
    },
  });

  // HLV Truong Barn A (Tai khoan thu nghiem chinh)
  const trainerTuan = await prisma.user.upsert({
    where: { email: 'trainer@gmail.com' },
    update: {
      fullName: 'Nguyễn Văn Tuấn',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
      assignedBarnId: barnA.id,
      passwordHash,
    },
    create: {
      email: 'trainer@gmail.com',
      passwordHash,
      fullName: 'Nguyễn Văn Tuấn',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0902000001',
      assignedBarnId: barnA.id,
    },
  });

  // HLV Barn B
  await prisma.user.upsert({
    where: { email: 'trainer2@gmail.com' },
    update: { fullName: 'Lê Hoàng Nam', role: Role.HEAD_TRAINER, status: UserStatus.ACTIVE, assignedBarnId: barnB.id, passwordHash },
    create: {
      email: 'trainer2@gmail.com',
      passwordHash,
      fullName: 'Lê Hoàng Nam',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0902000002',
      assignedBarnId: barnB.id,
    },
  });

  // HLV Barn C
  await prisma.user.upsert({
    where: { email: 'trainer.quan@gmail.com' },
    update: { fullName: 'Trần Minh Quân', role: Role.HEAD_TRAINER, status: UserStatus.ACTIVE, assignedBarnId: barnC.id, passwordHash },
    create: {
      email: 'trainer.quan@gmail.com',
      passwordHash,
      fullName: 'Trần Minh Quân',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0902888888',
      assignedBarnId: barnC.id,
    },
  });

  // Bot HLV Ao: Nhan bai tap chay thu nen (khong tran dinh muc HLV)
  const botTrainer = await prisma.user.upsert({
    where: { email: 'bot.trainer@gmail.com' },
    update: { fullName: 'System Runner Bot', role: Role.HEAD_TRAINER, status: UserStatus.ACTIVE, passwordHash },
    create: {
      email: 'bot.trainer@gmail.com',
      passwordHash,
      fullName: 'System Runner Bot',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0902999999',
    },
  });

  // Bac si thu y Barn A
  const vet = await prisma.user.upsert({
    where: { email: 'vet.ha@gmail.com' },
    update: { fullName: 'BS. Hà Thu Thảo', role: Role.VETERINARIAN, status: UserStatus.ACTIVE, passwordHash },
    create: {
      email: 'vet.ha@gmail.com',
      passwordHash,
      fullName: 'BS. Hà Thu Thảo',
      role: Role.VETERINARIAN,
      status: UserStatus.ACTIVE,
      phoneNumber: '0903000001',
    },
  });

  // Groom 1: Tran Thi Mai (Ca sang, phu trach o A-01 den A-04)
  const groomMai = await prisma.user.upsert({
    where: { email: 'groom.mai@gmail.com' },
    update: { fullName: 'Trần Thị Mai', role: Role.GROOM, status: UserStatus.ACTIVE, passwordHash },
    create: {
      email: 'groom.mai@gmail.com',
      passwordHash,
      fullName: 'Trần Thị Mai',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
      phoneNumber: '0904000001',
    },
  });

  // Dong bo them tai khoan groom@gmail.com neu co
  await prisma.user.upsert({
    where: { email: 'groom@gmail.com' },
    update: { fullName: 'Trần Thị Mai', role: Role.GROOM, status: UserStatus.ACTIVE, passwordHash },
    create: {
      email: 'groom@gmail.com',
      passwordHash,
      fullName: 'Trần Thị Mai',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
      phoneNumber: '0904000011',
    },
  });

  // Groom 2: Hoang Van Phuc (Ca chieu, phu trach o A-05 den A-08)
  const groomPhuc = await prisma.user.upsert({
    where: { email: 'groom.phuc@gmail.com' },
    update: { fullName: 'Hoàng Văn Phúc', role: Role.GROOM, status: UserStatus.ACTIVE, passwordHash },
    create: {
      email: 'groom.phuc@gmail.com',
      passwordHash,
      fullName: 'Hoàng Văn Phúc',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
      phoneNumber: '0904000002',
    },
  });

  // Dong bo them tai khoan groom2@gmail.com neu co
  await prisma.user.upsert({
    where: { email: 'groom2@gmail.com' },
    update: { fullName: 'Hoàng Văn Phúc', role: Role.GROOM, status: UserStatus.ACTIVE, passwordHash },
    create: {
      email: 'groom2@gmail.com',
      passwordHash,
      fullName: 'Hoàng Văn Phúc',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
      phoneNumber: '0904000012',
    },
  });

  // Groom 3: Trinh Dinh Quang (Phu trach Barn C va cac o tiep nhan)
  const groomQuang = await prisma.user.upsert({
    where: { email: 'groom3@gmail.com' },
    update: { fullName: 'Trịnh Đình Quang', role: Role.GROOM, status: UserStatus.ACTIVE, passwordHash },
    create: {
      email: 'groom3@gmail.com',
      passwordHash,
      fullName: 'Trịnh Đình Quang',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
      phoneNumber: '0904000003',
    },
  });

  // Groom 4 & 5 (Barn B)
  const groomTuan = await prisma.user.upsert({
    where: { email: 'groom4@gmail.com' },
    update: { fullName: 'Lê Quốc Tuấn', role: Role.GROOM, status: UserStatus.ACTIVE, passwordHash },
    create: {
      email: 'groom4@gmail.com',
      passwordHash,
      fullName: 'Lê Quốc Tuấn',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
      phoneNumber: '0904000004',
    },
  });

  const groom5 = await prisma.user.upsert({
    where: { email: 'groom5@gmail.com' },
    update: { fullName: 'Phạm Minh Đức', role: Role.GROOM, status: UserStatus.ACTIVE, passwordHash },
    create: {
      email: 'groom5@gmail.com',
      passwordHash,
      fullName: 'Phạm Minh Đức',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
      phoneNumber: '0904000005',
    },
  });

  // Chu ngua
  const owner = await prisma.user.upsert({
    where: { email: 'owner@gmail.com' },
    update: { fullName: 'Robert Sterling', role: Role.HORSE_OWNER, status: UserStatus.ACTIVE, passwordHash },
    create: {
      email: 'owner@gmail.com',
      passwordHash,
      fullName: 'Robert Sterling',
      role: Role.HORSE_OWNER,
      status: UserStatus.ACTIVE,
      phoneNumber: '0905000001',
    },
  });

  // -------------------------------------------------------------
  // BUOC 3: HE THONG DUONG CHAY HUAN LUYEN (TRACKS)
  // -------------------------------------------------------------
  console.log('[4/8] Khoi tao he thong 4 duong chay (Co A, Co B, Cat A, Tong hop A)...');

  const trackTurfA = await prisma.trainingTrack.upsert({
    where: { code: 'TRK-TURF-A' },
    update: { name: 'Đường chạy cỏ A (Chính)', surface: 'TURF', capacity: 6, isActive: true },
    create: { code: 'TRK-TURF-A', name: 'Đường chạy cỏ A (Chính)', surface: 'TURF', capacity: 6, isActive: true },
  });

  const trackTurfB = await prisma.trainingTrack.upsert({
    where: { code: 'TRK-TURF-B' },
    update: { name: 'Đường chạy cỏ B (Phụ)', surface: 'TURF', capacity: 4, isActive: true },
    create: { code: 'TRK-TURF-B', name: 'Đường chạy cỏ B (Phụ)', surface: 'TURF', capacity: 4, isActive: true },
  });

  await prisma.trainingTrack.upsert({
    where: { code: 'TRK-DIRT-A' },
    update: { name: 'Đường chạy cát A (Cát mịn)', surface: 'DIRT', capacity: 6, isActive: true },
    create: { code: 'TRK-DIRT-A', name: 'Đường chạy cát A (Cát mịn)', surface: 'DIRT', capacity: 6, isActive: true },
  });

  await prisma.trainingTrack.upsert({
    where: { code: 'TRK-SYNTH-A' },
    update: { name: 'Đường chạy tổng hợp A', surface: 'SYNTHETIC', capacity: 6, isActive: true },
    create: { code: 'TRK-SYNTH-A', name: 'Đường chạy tổng hợp A', surface: 'SYNTHETIC', capacity: 6, isActive: true },
  });

  // -------------------------------------------------------------
  // BUOC 4: DON DEP GIAO AN CU THUA CUA HLV TUAN DE DAM BAO DINH MUC
  // -------------------------------------------------------------
  console.log('[5/8] Don dep rac giao an & thiet lap dan ngua Barn A cho HLV Tuan...');

  // Chuyen tat ca cac con ngua chay thu HRS-BG va HRS-MOCK sang botTrainer
  await prisma.trainingPlan.updateMany({
    where: {
      horse: {
        horseCode: {
          in: [
            'HRS-BG-01', 'HRS-BG-02', 'HRS-BG-03', 'HRS-BG-04', 'HRS-BG-05', 'HRS-BG-06',
            'HRS-MOCK-01', 'HRS-MOCK-02', 'HRS-MOCK-03', 'HRS-MOCK-04', 'HRS-MOCK-05', 'HRS-MOCK-06',
          ],
        },
      },
    },
    data: { trainerUserId: botTrainer.id },
  });

  await prisma.horse.updateMany({
    where: {
      horseCode: {
        in: [
          'HRS-BG-01', 'HRS-BG-02', 'HRS-BG-03', 'HRS-BG-04', 'HRS-BG-05', 'HRS-BG-06',
          'HRS-MOCK-01', 'HRS-MOCK-02', 'HRS-MOCK-03', 'HRS-MOCK-04', 'HRS-MOCK-05', 'HRS-MOCK-06',
        ],
      },
    },
    data: { assignedTrainerId: botTrainer.id },
  });

  // XOA TRIET DE 2 CON NGUA CU DU THUA CUA BARN A (THAN PHONG HR-DEMO-A07 VA HAC BAO HR-DEMO-A08)
  // DE DAM BAO HLV TUAN CHI CO DUNG 8 CON NGUA DUY NHAT (5 ACTIVE, 1 DRAFT, 1 UNPLANNED, 1 LOCKED)
  const legacyExcessHorses = await prisma.horse.findMany({
    where: { horseCode: { in: ['HR-DEMO-A07', 'HR-DEMO-A08'] } },
  });
  for (const ex of legacyExcessHorses) {
    await prisma.dailyCareTask.deleteMany({ where: { horseId: ex.id } });
    await prisma.dailyGroomingLog.deleteMany({ where: { horseId: ex.id } });
    await prisma.nutritionPlan.deleteMany({ where: { horseId: ex.id } });
    await prisma.incidentReport.deleteMany({ where: { horseId: ex.id } });
    await prisma.careCostEntry.deleteMany({ where: { horseId: ex.id } });
    await prisma.tournamentRegistration.deleteMany({ where: { horseId: ex.id } });
    await prisma.preventiveSchedule.deleteMany({ where: { horseId: ex.id } });
    await prisma.stallAllocation.deleteMany({ where: { horseId: ex.id } });
    await prisma.horseHandoverRequest.deleteMany({ where: { horseId: ex.id } });
    await prisma.medicalLock.deleteMany({ where: { horseId: ex.id } });
    await prisma.injuryLog.deleteMany({ where: { horseId: ex.id } });
    await prisma.medicalRecord.deleteMany({ where: { horseId: ex.id } });
    await prisma.workoutSession.deleteMany({ where: { horseId: ex.id } });
    await prisma.trainingPlan.deleteMany({ where: { horseId: ex.id } });
    await prisma.horse.delete({ where: { id: ex.id } });
  }

  // Danh sach 5 ngua ACTIVE cua Barn A do HLV Tuan quan ly
  const activeHorsesDef = [
    { code: 'HR-DEMO-A01', name: 'Phong Lôi', breed: 'Thoroughbred', dob: '2020-03-15', gender: 'Stallion', color: 'Bay', stall: stallsA[0] },
    { code: 'HR-DEMO-A02', name: 'Tuyết Ảnh', breed: 'Thoroughbred', dob: '2021-04-20', gender: 'Mare', color: 'White', stall: stallsA[1] },
    { code: 'HR-DEMO-A03', name: 'Lôi Chấn', breed: 'Thoroughbred', dob: '2020-08-10', gender: 'Colt', color: 'Chestnut', stall: stallsA[2] },
    { code: 'HR-DEMO-A04', name: 'Dạ Nguyệt', breed: 'Thoroughbred', dob: '2021-01-05', gender: 'Filly', color: 'Black', stall: stallsA[3] },
    { code: 'HR-DEMO-A05', name: 'Lão Tướng', breed: 'Thoroughbred', dob: '2019-05-12', gender: 'Gelding', color: 'Dark Bay', stall: stallsA[4] },
  ];

  const activeHorses: any[] = [];
  for (let i = 0; i < activeHorsesDef.length; i++) {
    const def = activeHorsesDef[i];
    const rfid = `RFID-DEMO-A0${i + 1}`;
    const horse = await prisma.horse.upsert({
      where: { horseCode: def.code },
      update: {
        name: def.name,
        breed: def.breed,
        dob: new Date(def.dob),
        gender: def.gender,
        color: def.color,
        status: HorseStatus.ACTIVE,
        ownerId: owner.id,
        assignedTrainerId: trainerTuan.id,
        trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
        isMedicalLocked: false,
      },
      create: {
        horseCode: def.code,
        microchipRfid: rfid,
        name: def.name,
        breed: def.breed,
        dob: new Date(def.dob),
        gender: def.gender,
        color: def.color,
        status: HorseStatus.ACTIVE,
        ownerId: owner.id,
        assignedTrainerId: trainerTuan.id,
        trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
        isMedicalLocked: false,
      },
    });

    // Gan chuong va Groom
    await prisma.stallAllocation.deleteMany({ where: { horseId: horse.id } });
    await prisma.stallAllocation.create({
      data: {
        stallId: def.stall.id,
        horseId: horse.id,
        assignedGroomUserId: i < 4 ? groomMai.id : groomPhuc.id,
        isActive: true,
      },
    });

    // Tao giao an ACTIVE
    const planCode = `GA-DEMO-A0${i + 1}`;
    let plan = await prisma.trainingPlan.findFirst({
      where: { horseId: horse.id, status: PlanStatus.ACTIVE },
    });
    if (!plan) {
      plan = await prisma.trainingPlan.create({
        data: {
          planCode,
          horseId: horse.id,
          trainerUserId: trainerTuan.id,
          status: PlanStatus.ACTIVE,
          startDate: new Date(todayClub + 'T00:00:00.000Z'),
          endDate: i === 4 ? new Date(Date.now() + 2 * 86400000) : new Date(nextMonthClub + 'T00:00:00.000Z'),
          phaseName: i === 4 ? 'Giai đoạn nước rút hoàn tất' : 'Giai đoạn nền tảng thể lực',
          objective: i === 4 ? `Giáo án chuẩn bị kết thúc cho ${horse.name} (còn 2 ngày)` : `Giáo án nền tảng cho ${horse.name}`,
          notes: 'Duy trì thể lực và rèn luyện tốc độ chuẩn thi đấu.',
          trackSurface: TrackSurface.TURF,
        },
      });
    } else {
      await prisma.trainingPlan.update({
        where: { id: plan.id },
        data: {
          planCode,
          trainerUserId: trainerTuan.id,
          status: PlanStatus.ACTIVE,
          endDate: i === 4 ? new Date(Date.now() + 2 * 86400000) : new Date(nextMonthClub + 'T00:00:00.000Z'),
          phaseName: i === 4 ? 'Giai đoạn nước rút hoàn tất' : 'Giai đoạn nền tảng thể lực',
          objective: i === 4 ? `Giáo án chuẩn bị kết thúc cho ${horse.name} (còn 2 ngày)` : `Giáo án nền tảng cho ${horse.name}`,
        },
      });
    }

    activeHorses.push({ horse, plan });
  }

  // Buoi tap hom nay cua Phong Loi (luc 09:45 de hien thi Buoi tap ke tiep tren Dashboard)
  const planA1 = activeHorses[0].plan;
  await prisma.workoutSession.deleteMany({ where: { trainingPlanId: planA1.id } });
  await prisma.workoutSession.create({
    data: {
      trainingPlanId: planA1.id,
      horseId: activeHorses[0].horse.id,
      trackId: trackTurfA.id,
      scheduledDate: new Date(`${todayClub}T09:45:00.000Z`),
      workoutType: 'CANTER',
      intensity: 'MEDIUM',
      trackSurface: 'TURF',
      status: WorkoutStatus.SCHEDULED,
      distanceMeters: 1600,
      targetSpeedKmh: 42,
    },
  });

  // Buoi tap luc 08:00 - 09:00 cua Tuyet Anh (HLV Tuan ban gio nay de test giao thoa lich)
  const planA2 = activeHorses[1].plan;
  await prisma.workoutSession.deleteMany({ where: { trainingPlanId: planA2.id } });
  await prisma.workoutSession.create({
    data: {
      trainingPlanId: planA2.id,
      horseId: activeHorses[1].horse.id,
      trackId: trackTurfB.id,
      scheduledDate: new Date(`${todayClub}T08:00:00.000Z`),
      workoutType: 'TROT',
      intensity: 'LIGHT',
      trackSurface: 'TURF',
      status: WorkoutStatus.SCHEDULED,
      distanceMeters: 1200,
      targetSpeedKmh: 28,
    },
  });

  // Buoi tap cua Loi Chan (HR-DEMO-A03):
  // 1. Buoi tap COMPLETED hom qua (co day du thong so nhip tim, toc do thuc te de test xem ket qua)
  // 2. Buoi tap SCHEDULED luc 16:00 - 17:00 chieu nay (test nguong bien an toan ket thuc 17:00)
  const planA3 = activeHorses[2].plan;
  await prisma.workoutSession.deleteMany({ where: { trainingPlanId: planA3.id } });
  await prisma.workoutSession.create({
    data: {
      trainingPlanId: planA3.id,
      horseId: activeHorses[2].horse.id,
      trackId: trackTurfA.id,
      scheduledDate: new Date(Date.now() - 86400000),
      workoutType: 'CANTER',
      intensity: 'HEAVY',
      trackSurface: 'TURF',
      status: WorkoutStatus.COMPLETED,
      distanceMeters: 1400,
      targetSpeedKmh: 44,
      actualDistanceMeters: 1400,
      actualTimeSeconds: 115.8,
      heartRatePeak: 118,
      heartRateRecovery: 64,
      averageSpeedKmh: 43.5,
      topSpeedKmh: 48.0,
      recoveryTimeMinutes: 15.0,
      staminaScore: 8.5,
      completionLevel: 'FULL',
      resultNotes: 'Chiến mã hoàn thành xuất sắc cự ly 1400m, nhịp tim ổn định và phục hồi nhanh sau 15 phút.',
      resultRecordedAt: new Date(Date.now() - 82800000),
      resultRecordedById: trainerTuan.id,
    },
  });
  await prisma.workoutSession.create({
    data: {
      trainingPlanId: planA3.id,
      horseId: activeHorses[2].horse.id,
      trackId: trackTurfA.id,
      scheduledDate: new Date(`${todayClub}T16:00:00.000Z`),
      workoutType: 'TROT',
      intensity: 'LIGHT',
      trackSurface: 'TURF',
      status: WorkoutStatus.SCHEDULED,
      distanceMeters: 1200,
      targetSpeedKmh: 28,
    },
  });

  // Buoi tap cua Da Nguyet (HR-DEMO-A04): Buoi tap CANCELLED (test loc trang thai va thong tin ly do huy)
  const planA4 = activeHorses[3].plan;
  await prisma.workoutSession.deleteMany({ where: { trainingPlanId: planA4.id } });
  await prisma.workoutSession.create({
    data: {
      trainingPlanId: planA4.id,
      horseId: activeHorses[3].horse.id,
      trackId: trackTurfB.id,
      scheduledDate: new Date(`${todayClub}T14:00:00.000Z`),
      workoutType: 'GALLOP',
      intensity: 'MEDIUM',
      trackSurface: 'TURF',
      status: WorkoutStatus.CANCELLED,
      distanceMeters: 1500,
      targetSpeedKmh: 40,
      statusReason: 'Thời tiết bất lợi (mưa dông làm trơn trượt mặt cỏ)',
      trainerNotes: 'Hoãn buổi tập để đảm bảo an toàn dây chằng cho ngựa.',
    },
  });

  // Ngua thu 6: Huyen Vu (Ban nhap DRAFT - da co 1 bai tap de test Modal Kich hoat)
  const huyenVu = await prisma.horse.upsert({
    where: { horseCode: 'HR-DEMO-A06' },
    update: {
      name: 'Huyền Vũ',
      breed: 'Thoroughbred',
      dob: new Date('2021-02-14'),
      gender: 'Colt',
      color: 'Black',
      status: HorseStatus.RESTING,
      ownerId: owner.id,
      assignedTrainerId: trainerTuan.id,
      trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
      isMedicalLocked: false,
    },
    create: {
      horseCode: 'HR-DEMO-A06',
      microchipRfid: 'RFID-DEMO-A06',
      name: 'Huyền Vũ',
      breed: 'Thoroughbred',
      dob: new Date('2021-02-14'),
      gender: 'Colt',
      color: 'Black',
      status: HorseStatus.RESTING,
      ownerId: owner.id,
      assignedTrainerId: trainerTuan.id,
      trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
      isMedicalLocked: false,
    },
  });
  await prisma.stallAllocation.deleteMany({ where: { horseId: huyenVu.id } });
  await prisma.stallAllocation.create({
    data: {
      stallId: stallsA[5].id,
      horseId: huyenVu.id,
      assignedGroomUserId: groomPhuc.id,
      isActive: true,
    },
  });

  // Tao giao an DRAFT cho Huyen Vu
  await prisma.workoutSession.deleteMany({ where: { horseId: huyenVu.id } });
  await prisma.trainingPlan.deleteMany({ where: { horseId: huyenVu.id } });
  const draftPlan = await prisma.trainingPlan.create({
    data: {
      planCode: 'GA-DEMO-A06',
      horseId: huyenVu.id,
      trainerUserId: trainerTuan.id,
      status: PlanStatus.DRAFT,
      startDate: new Date(tomorrowClub + 'T00:00:00.000Z'),
      endDate: new Date(new Date(tomorrowClub).getTime() + 14 * 86400000),
      phaseName: 'Giai đoạn chuẩn bị nước rút',
      objective: 'Giáo án nước rút tiền giải đấu (Bản nháp)',
      notes: 'Thử nghiệm kích hoạt giáo án với đầy đủ điều kiện.',
      trackSurface: TrackSurface.TURF,
    },
  });
  // Them bai tap de du dieu kien kich hoat
  await prisma.workoutSession.create({
    data: {
      trainingPlanId: draftPlan.id,
      horseId: huyenVu.id,
      trackId: trackTurfA.id,
      scheduledDate: new Date(`${tomorrowClub}T06:30:00.000Z`),
      workoutType: 'TROT',
      intensity: 'LIGHT',
      trackSurface: 'TURF',
      status: WorkoutStatus.SCHEDULED,
      distanceMeters: 1000,
    },
  });

  // Ngua thu 7: Bach Long Ma (UNPLANNED - Chua co giao an)
  const bachLongMa = await prisma.horse.upsert({
    where: { horseCode: 'HRS-BLM-01' },
    update: {
      name: 'Bạch Long Mã',
      breed: 'Thoroughbred',
      dob: new Date('2021-05-10'),
      gender: 'Stallion',
      color: 'White',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: trainerTuan.id,
      trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
      isMedicalLocked: false,
    },
    create: {
      horseCode: 'HRS-BLM-01',
      microchipRfid: 'RFID-BLM-01',
      name: 'Bạch Long Mã',
      breed: 'Thoroughbred',
      dob: new Date('2021-05-10'),
      gender: 'Stallion',
      color: 'White',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: trainerTuan.id,
      trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
      isMedicalLocked: false,
    },
  });
  await prisma.stallAllocation.deleteMany({ where: { horseId: bachLongMa.id } });
  await prisma.stallAllocation.create({
    data: {
      stallId: stallsA[6].id,
      horseId: bachLongMa.id,
      assignedGroomUserId: groomPhuc.id,
      isActive: true,
    },
  });
  // Xoa moi giao an cua Bach Long Ma
  await prisma.workoutSession.deleteMany({ where: { horseId: bachLongMa.id } });
  await prisma.trainingPlan.deleteMany({ where: { horseId: bachLongMa.id } });

  // Ngua thu 8: Xich Tho Khang (MEDICAL_LOCKED - Bi khoa y te do chan thuong gan)
  const xichThoKhang = await prisma.horse.upsert({
    where: { horseCode: 'HRS-MED-01' },
    update: {
      name: 'Xích Thố Khang',
      breed: 'Thoroughbred',
      dob: new Date('2020-11-20'),
      gender: 'Colt',
      color: 'Chestnut',
      status: HorseStatus.INJURED,
      ownerId: owner.id,
      assignedTrainerId: trainerTuan.id,
      trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
      isMedicalLocked: true,
    },
    create: {
      horseCode: 'HRS-MED-01',
      microchipRfid: 'RFID-MED-01',
      name: 'Xích Thố Khang',
      breed: 'Thoroughbred',
      dob: new Date('2020-11-20'),
      gender: 'Colt',
      color: 'Chestnut',
      status: HorseStatus.INJURED,
      ownerId: owner.id,
      assignedTrainerId: trainerTuan.id,
      trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
      isMedicalLocked: true,
    },
  });
  await prisma.stallAllocation.deleteMany({ where: { horseId: xichThoKhang.id } });
  await prisma.stallAllocation.create({
    data: {
      stallId: stallsA[7].id,
      horseId: xichThoKhang.id,
      assignedGroomUserId: groomPhuc.id,
      isActive: true,
    },
  });
  await prisma.workoutSession.deleteMany({ where: { horseId: xichThoKhang.id } });
  await prisma.trainingPlan.deleteMany({ where: { horseId: xichThoKhang.id } });

  // -------------------------------------------------------------
  // BUOC 5: BAN GIAO NGUA HAC LONG MA & TEST BAN GIAO (HANDOVER)
  // -------------------------------------------------------------
  console.log('[6/8] Thiet lap Hac Long Ma va yeu cau ban giao tu Quan ly sang HLV Tuan...');

  const hacLongMa = await prisma.horse.upsert({
    where: { horseCode: 'HRS-HLM-99' },
    update: {
      name: 'Hắc Long Mã',
      breed: 'Thoroughbred',
      dob: new Date('2022-03-15'),
      gender: 'Colt',
      color: 'Black',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: null,
      trainerAssignmentStatus: TrainerAssignmentStatus.PENDING_ACCEPTANCE,
      isMedicalLocked: false,
    },
    create: {
      horseCode: 'HRS-HLM-99',
      microchipRfid: 'RFID-HLM-99',
      name: 'Hắc Long Mã',
      breed: 'Thoroughbred',
      dob: new Date('2022-03-15'),
      gender: 'Colt',
      color: 'Black',
      status: HorseStatus.ACTIVE,
      ownerId: owner.id,
      assignedTrainerId: null,
      trainerAssignmentStatus: TrainerAssignmentStatus.PENDING_ACCEPTANCE,
      isMedicalLocked: false,
    },
  });
  await prisma.stallAllocation.deleteMany({ where: { horseId: hacLongMa.id } });
  await prisma.stallAllocation.create({
    data: {
      stallId: stallC01.id,
      horseId: hacLongMa.id,
      assignedGroomUserId: groomQuang.id,
      isActive: true,
    },
  });

  // Chuan hoa dinh muc Groom toan he thong: Dam bao khong co Groom nao co > 4 o chuong active
  const allGrooms = await prisma.user.findMany({ where: { role: Role.GROOM } });
  for (const g of allGrooms) {
    const allocations = await prisma.stallAllocation.findMany({
      where: { assignedGroomUserId: g.id, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (allocations.length > 4) {
      const excess = allocations.slice(4);
      for (const ex of excess) {
        await prisma.stallAllocation.update({
          where: { id: ex.id },
          data: { isActive: false },
        });
      }
    }
  }

  // Tao yeu cau ban giao PENDING gui cho HLV Tuan
  await prisma.horseHandoverRequest.deleteMany({ where: { horseId: hacLongMa.id } });
  await prisma.horseHandoverRequest.create({
    data: {
      horseId: hacLongMa.id,
      fromManagerId: manager.id,
      toTrainerId: trainerTuan.id,
      status: HandoverStatus.PENDING,
      token: 'HANDOVER-TOKEN-HLM-99',
      expiresAt: new Date(Date.now() + 7 * 86400000),
      notes: 'Bàn giao Hắc Long Mã sang Barn A để bắt đầu chu kỳ huấn luyện mới.',
    },
  });

  // Tao them lich su ban giao ACCEPTED va REJECTED cho HLV Tuan de test 100% coverage
  await prisma.horseHandoverRequest.deleteMany({
    where: { token: { in: ['HANDOVER-TOKEN-PL-01', 'HANDOVER-TOKEN-REJ-01'] } },
  });
  await prisma.horseHandoverRequest.create({
    data: {
      horseId: activeHorses[0].horse.id,
      fromManagerId: manager.id,
      toTrainerId: trainerTuan.id,
      status: HandoverStatus.ACCEPTED,
      token: 'HANDOVER-TOKEN-PL-01',
      expiresAt: new Date(Date.now() + 7 * 86400000),
      acceptedAt: new Date(Date.now() - 15 * 86400000),
      notes: 'Đã hoàn tất tiếp nhận bàn giao Phong Lôi vào Barn A.',
    },
  });
  await prisma.horseHandoverRequest.create({
    data: {
      horseId: activeHorses[1].horse.id,
      fromManagerId: manager.id,
      toTrainerId: trainerTuan.id,
      status: HandoverStatus.REJECTED,
      token: 'HANDOVER-TOKEN-REJ-01',
      expiresAt: new Date(Date.now() + 7 * 86400000),
      notes: 'Từ chối tiếp nhận tạm thời do Barn A đang trong đợt bảo dưỡng.',
    },
  });

  // -------------------------------------------------------------
  // BUOC 6: TAO 6 LUOT CHAY THU LAP DAY DUONG CO A LUC 07:00 (GAN BOT)
  // -------------------------------------------------------------
  console.log('[7/8] Thiet lap 6 buoi tap lap day duong Co A luc 07:00 (gan cho Bot Trainer)...');

  for (let i = 1; i <= 6; i++) {
    const code = `HRS-MOCK-0${i}`;
    const rfid = `RFID-MOCK-0${i}`;
    const mockHorse = await prisma.horse.upsert({
      where: { horseCode: code },
      update: { name: `Ngựa chạy thử ${i}`, assignedTrainerId: botTrainer.id, status: HorseStatus.ACTIVE },
      create: {
        horseCode: code,
        microchipRfid: rfid,
        name: `Ngựa chạy thử ${i}`,
        breed: 'Thoroughbred',
        dob: new Date('2020-01-01'),
        gender: 'Colt',
        color: 'Bay',
        status: HorseStatus.ACTIVE,
        ownerId: owner.id,
        assignedTrainerId: botTrainer.id,
      },
    });

    let mockPlan = await prisma.trainingPlan.findFirst({ where: { horseId: mockHorse.id } });
    if (!mockPlan) {
      mockPlan = await prisma.trainingPlan.create({
        data: {
          planCode: `GA-MOCK-0${i}`,
          horseId: mockHorse.id,
          trainerUserId: botTrainer.id,
          status: PlanStatus.ACTIVE,
          startDate: new Date(todayClub + 'T00:00:00.000Z'),
          endDate: new Date(nextMonthClub + 'T00:00:00.000Z'),
          phaseName: 'Giai đoạn thử nghiệm',
          objective: `Giáo án mô phỏng ${i}`,
          trackSurface: TrackSurface.TURF,
        },
      });
    }

    await prisma.workoutSession.deleteMany({
      where: { trainingPlanId: mockPlan.id, trackId: trackTurfA.id },
    });
    await prisma.workoutSession.create({
      data: {
        trainingPlanId: mockPlan.id,
        horseId: mockHorse.id,
        trackId: trackTurfA.id,
        scheduledDate: new Date(`${todayClub}T07:00:00.000Z`),
        workoutType: 'CANTER',
        intensity: 'MEDIUM',
        trackSurface: 'TURF',
        status: WorkoutStatus.SCHEDULED,
        distanceMeters: 1400,
        targetSpeedKmh: 40,
      },
    });
  }

  // -------------------------------------------------------------
  // BUOC 7: THIET LAP DU LIEU THU Y, CHU NGUA, HOA DON
  // -------------------------------------------------------------
  console.log('[8/8] Thiet lap ho so benh an thu y, khoa y te, lich tiem phong va hoa don...');

  // Benh an cho Xich Tho Khang
  await prisma.injuryLog.deleteMany({ where: { horseId: xichThoKhang.id } });
  await prisma.medicalLock.deleteMany({ where: { horseId: xichThoKhang.id } });
  await prisma.medicalRecord.deleteMany({ where: { horseId: xichThoKhang.id } });

  const medRecord = await prisma.medicalRecord.create({
    data: {
      horseId: xichThoKhang.id,
      veterinarianUserId: vet.id,
      recordNumber: 'BA-2611-001',
      status: MedicalRecordStatus.OPEN,
      symptoms: 'Khớp cổ chân trước bên phải sưng nóng, phản ứng đau rõ rệt khi ấn nắn.',
      clinicalDiagnosis: 'Chấn thương gân chân trước bên phải cấp độ 2 do quá tải.',
      treatmentProtocol: 'Nghỉ ngơi hoàn toàn, chườm lạnh 2 lần/ngày, băng nén và dùng kháng viêm theo phác đồ.',
      proposeMedicalLock: true,
      lockExpectedRestDays: 7,
      examinationType: 'Emergency Clinical',
      severity: SeverityLevel.SEVERE,
    },
  });

  // Ban do chan thuong (InjuryLog)
  await prisma.injuryLog.create({
    data: {
      horseId: xichThoKhang.id,
      medicalRecordId: medRecord.id,
      coordinateX: 0.35,
      coordinateY: 0.72,
      viewSide: 'LEFT',
      layer: 'MUSCLE',
      anatomicalZone: 'Knee / Fetlock Joint',
      bodySide: BodySide.RIGHT,
      injuryType: 'Sprain / Tendonitis',
      severity: SeverityLevel.SEVERE,
      stage: 'ACUTE',
      status: InjuryStatus.ACTIVE,
      description: 'Khớp cổ chân trước bên phải sưng nóng, phản ứng đau rõ rệt khi ấn nắn.',
    },
  });

  // Lenh khoa y te (MedicalLock)
  await prisma.medicalLock.create({
    data: {
      lockCode: 'KH-000001',
      horseId: xichThoKhang.id,
      medicalRecordId: medRecord.id,
      veterinarianUserId: vet.id,
      expectedRestDays: 7,
      recheckDate: new Date(Date.now() + 7 * 86400000),
      appliedMedicalStatus: HorseStatus.INJURED,
      lockReason: 'Chấn thương gân chân trước bên phải cấp độ 2 do quá tải sau tập luyện.',
      unlockConditions: 'Hết sưng đau hoàn toàn, siêu âm gân phục hồi đạt chuẩn và được bác sĩ khám thông qua.',
      isLocked: true,
    },
  });

  // Lich tiem phong qua han (OVERDUE) cho Phong Loi
  await prisma.preventiveSchedule.deleteMany({ where: { horseId: activeHorses[0].horse.id } });
  await prisma.preventiveSchedule.create({
    data: {
      horseId: activeHorses[0].horse.id,
      veterinarianUserId: vet.id,
      scheduleType: PreventiveType.VACCINATION,
      dueDate: new Date(Date.now() - 3 * 86400000),
      status: PreventiveStatus.OVERDUE,
      notes: 'Tiêm nhắc lại vắc-xin cúm ngựa Equine Influenza định kỳ hàng năm.',
    },
  });

  // Hoa don thanh toan cho chu ngua Robert Sterling (FinancialInvoice)
  await prisma.financialInvoice.deleteMany({ where: { ownerId: owner.id } });
  await prisma.financialInvoice.create({
    data: {
      horseId: activeHorses[0].horse.id,
      ownerId: owner.id,
      billingPeriod: '2026-11',
      boardingFee: 15000000,
      netAmount: 15000000,
      status: InvoiceStatus.SENT,
      dueAt: new Date(Date.now() + 5 * 86400000),
    },
  });
  await prisma.financialInvoice.create({
    data: {
      horseId: activeHorses[1].horse.id,
      ownerId: owner.id,
      billingPeriod: '2026-10',
      boardingFee: 15000000,
      netAmount: 15000000,
      status: InvoiceStatus.PAID,
      paidAt: new Date(),
    },
  });

  // CUOI CUNG: KIEM TRA SO GIAO AN DANG CO CUA HLV TUAN VA DON DEP TRIET DE
  const allTuanPlans = await prisma.trainingPlan.findMany({
    where: { trainerUserId: trainerTuan.id, status: { in: [PlanStatus.ACTIVE, PlanStatus.DRAFT] } },
    include: { horse: true },
  });
  console.log(`[KIEM TRA DINH MUC] HLV Tuan dang co tong cong ${allTuanPlans.length} giao an (Active + Draft):`);
  for (const p of allTuanPlans) {
    console.log(` - Plan: ${p.planCode} | Ngua: ${p.horse.name} (${p.horse.horseCode}) | Trang thai: ${p.status}`);
  }

  console.log('================================================================');
  console.log('=== MASTER SEED HOAN TAT THANH CONG 100% ===');
  console.log('- HLV Nguyen Van Tuan (trainer@gmail.com): DUNG 6/8 DINH MUC (5 Active, 1 Draft).');
  console.log('- Bach Long Ma (HRS-BLM-01): DUNG TRANG THAI CHUA CO GIAO AN (1 cho).');
  console.log('- Xich Tho Khang (HRS-MED-01): DUNG KHOA Y TE KEM BENH AN.');
  console.log('- Hac Long Ma (HRS-HLM-99): DUNG YEU CAU BAN GIAO PENDING.');
  console.log('- Duong Co A luc 07:00: DA DAY 6/6 (Gan cho Bot, khong lam ban HLV).');
  console.log('================================================================');
}

if (require.main === module) {
  runMasterSeed()
    .catch((e) => {
      console.error('Loi khi chay Master Seed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
