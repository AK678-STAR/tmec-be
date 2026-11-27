import { PrismaClient, HandoverStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface SanityResult {
  rule: string;
  passed: boolean;
  details: string;
}

export async function verifyDatabaseSanity(): Promise<boolean> {
  console.log('================================================================');
  console.log('=== BAT DAU KIEM DINH TOAN VEN CO SO DU LIEU (DB SANITY) ===');
  console.log('================================================================');

  const results: SanityResult[] = [];

  // RANG BUOC 1: DINH MUC HLV KHONG DUOC VUOT QUA 8 CHIEN MA
  const trainers = await prisma.user.findMany({
    where: { role: 'HEAD_TRAINER' },
    select: { id: true, email: true, fullName: true },
  });

  let trainerLimitOk = true;
  for (const t of trainers) {
    if (t.email === 'bot.trainer@gmail.com') continue; // Bo qua bot mo phong nen
    const plans = await prisma.trainingPlan.findMany({
      where: { trainerUserId: t.id, status: { in: ['ACTIVE', 'DRAFT'] } },
    });
    if (plans.length > 8) {
      trainerLimitOk = false;
      results.push({
        rule: `HLV ${t.email} khong vuot qua 8 giao an`,
        passed: false,
        details: `Vi pham nghiem trong: HLV ${t.fullName} (${t.email}) co ${plans.length}/8 giao an dong thoi!`,
      });
    }
  }
  if (trainerLimitOk) {
    results.push({
      rule: 'Rang buoc 1: Dinh muc HLV (Active + Draft <= 8)',
      passed: true,
      details: 'Tat ca Huan luyen vien nguoi that deu tuan thu tran <= 8 chien ma.',
    });
  }

  // RANG BUOC 2: HLV NGUYEN VAN TUAN PHAI CO DUNG 6/8 DINH MUC VA 2 SUAT TRONG
  const tuan = await prisma.user.findUnique({ where: { email: 'trainer@gmail.com' } });
  if (tuan) {
    const tuanPlans = await prisma.trainingPlan.findMany({
      where: { trainerUserId: tuan.id, status: { in: ['ACTIVE', 'DRAFT'] } },
    });
    const activeCount = tuanPlans.filter((p) => p.status === 'ACTIVE').length;
    const draftCount = tuanPlans.filter((p) => p.status === 'DRAFT').length;
    const passed = tuanPlans.length === 6 && activeCount === 5 && draftCount === 1;
    results.push({
      rule: 'Rang buoc 2: HLV Tuan co dung 6/8 chien ma (5 Active, 1 Draft)',
      passed,
      details: passed
        ? `Dat chuan hoan hao: 5 Active, 1 Draft (Tong 6/8, con dung 2 suat trong).`
        : `Loi: HLV Tuan co ${tuanPlans.length} giao an (${activeCount} Active, ${draftCount} Draft), ky vong dung 6!`,
    });
  }

  // RANG BUOC 3: PHAI CO CHIEN MA CHO LAP GIAO AN (BACH LONG MA)
  const blm = await prisma.horse.findUnique({
    where: { horseCode: 'HRS-BLM-01' },
    include: { trainingPlans: true },
  });
  const blmNoPlan = blm && blm.trainingPlans.length === 0;
  results.push({
    rule: 'Rang buoc 3: Bach Long Ma chua co giao an de test nut Lap giao an ngay',
    passed: Boolean(blmNoPlan),
    details: blmNoPlan
      ? 'Dat chuan: Bach Long Ma trong Barn A chua co giao an nao (San sang lap ke hoach).'
      : 'Loi: Bach Long Ma bi gan giao an hoac khong tim thay!',
  });

  // RANG BUOC 4: PHAI CO CHIEN MA BI KHOA Y TE (XICH THO KHANG)
  const medHorse = await prisma.horse.findUnique({
    where: { horseCode: 'HRS-MED-01' },
    include: { medicalRecords: true, medicalLocks: true },
  });
  const medOk = medHorse && medHorse.isMedicalLocked && medHorse.medicalRecords.length > 0;
  results.push({
    rule: 'Rang buoc 4: Xich Tho Khang bi khoa y te kem ho so benh an',
    passed: Boolean(medOk),
    details: medOk
      ? 'Dat chuan: Xich Tho Khang bi Khoa y te (isMedicalLocked=true) va co benh an dieu tri gan chan.'
      : 'Loi: Khong tim thay ngua khoa y te hoac thieu benh an!',
  });

  // RANG BUOC 5: PHAI CO YEU CAU BAN GIAO HAC LONG MA CHO HLV DUYET
  const handover = await prisma.horseHandoverRequest.findFirst({
    where: { horse: { horseCode: 'HRS-HLM-99' }, status: HandoverStatus.PENDING },
  });
  results.push({
    rule: 'Rang buoc 5: Yeu cau ban giao Hac Long Ma cho duyet (co du nut Tiep nhan/Tu choi)',
    passed: Boolean(handover),
    details: handover
      ? 'Dat chuan: Co 1 yeu cau ban giao Hac Long Ma dang cho HLV Tuan phan hoi.'
      : 'Loi: Khong tim thay yeu cau ban giao Hac Long Ma o trang thai PENDING!',
  });

  // RANG BUOC 6: DINH MUC GROOM (MOI GROOM <= 4 O CHUONG)
  const grooms = await prisma.user.findMany({ where: { role: 'GROOM' } });
  let groomLimitOk = true;
  for (const g of grooms) {
    const allocations = await prisma.stallAllocation.findMany({
      where: { assignedGroomUserId: g.id, isActive: true },
    });
    if (allocations.length > 4) {
      groomLimitOk = false;
      results.push({
        rule: `Groom ${g.email} khong vuot qua 4 o chuong`,
        passed: false,
        details: `Groom ${g.fullName} phu trach ${allocations.length} o chuong (vuot tran 4 o)!`,
      });
    }
  }
  if (groomLimitOk) {
    results.push({
      rule: 'Rang buoc 6: Dinh muc Groom (Moi Groom <= 4 o chuong)',
      passed: true,
      details: 'Tat ca nhan vien Groom deu phu trach tu 1 den 4 o chuong chuan muc.',
    });
  }

  // RANG BUOC 7: TONG SO NGUA GIAO CHO HLV TUAN DUNG BANG 8 CON (5 ACTIVE, 1 DRAFT, 1 UNPLANNED, 1 LOCKED)
  if (tuan) {
    const totalTuanHorses = await prisma.horse.findMany({
      where: { assignedTrainerId: tuan.id },
    });
    const passed = totalTuanHorses.length === 8;
    results.push({
      rule: 'Rang buoc 7: Tong so chien ma gan cho HLV Tuan phai dung bang 8 con',
      passed,
      details: passed
        ? `Dat chuan tuyet doi: HLV Tuan co dung 8 con ngua (5 Active, 1 Draft, 1 Unplanned, 1 Locked).`
        : `Loi: HLV Tuan dang bi gan ${totalTuanHorses.length} con ngua trong bang Horse (ky vong dung 8)!`,
    });
  }

  // IN BANG BAO CAO THAM DINH
  console.log('\n--- BANG KET QUA THAM DINH TINH TOAN VEN CO SO DU LIEU ---');
  let allPassed = true;
  for (const r of results) {
    const statusText = r.passed ? '[PASS]' : '[FAIL]';
    console.log(`${statusText} ${r.rule}`);
    console.log(`       -> ${r.details}`);
    if (!r.passed) allPassed = false;
  }
  console.log('------------------------------------------------------------\n');

  if (allPassed) {
    console.log('>>> KET LUAN: CO SO DU LIEU DAT CHUAN 100% CODE CONSISTENCY. SAN SANG VAN HANH. <<<\n');
  } else {
    console.error('>>> KET LUAN: CO SO DU LIEU CO LOI VI PHAM DINH MUC / QUY TAC CODE. VUI LONG KIEM TRA LAI! <<<\n');
  }

  return allPassed;
}

if (require.main === module) {
  verifyDatabaseSanity()
    .then((ok) => {
      process.exit(ok ? 0 : 1);
    })
    .catch((e) => {
      console.error('Loi khi chay verifyDatabaseSanity:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
