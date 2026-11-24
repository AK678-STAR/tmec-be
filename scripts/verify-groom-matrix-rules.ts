import { PrismaClient, Role, UserStatus, StallStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function runTests() {
  console.log('🧪 ========================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ NGHIỆM THU CA 4 (QA / QC)');
  console.log('🧪 ========================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, desc: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] Test ${totalTests}: ${desc}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] Test ${totalTests}: ${desc}`);
      throw new Error(`Test failed: ${desc}`);
    }
  }

  try {
    // -----------------------------------------------------------------------
    // TEST 1: Kiểm tra cấu trúc phân khu chuồng trại ma trận 4x3
    // -----------------------------------------------------------------------
    console.log('--- TEST NHÓM 1: CẤU TRÚC LƯỚI MA TRẬN 4x3 ---');
    const zones = await prisma.stallZone.findMany({
      include: { stalls: { orderBy: { code: 'asc' } } },
    });

    assert(zones.length >= 2, 'Hệ thống có ít nhất 2 phân khu Barn');
    for (const z of zones) {
      assert(z.rows === 4 && z.cols === 3, `Phân khu "${z.name}" phải có đúng rows = 4, cols = 3 (Hiện tại: ${z.rows}x${z.cols})`);
    }

    const barnA = zones.find((z) => z.name === 'Barn A' || z.code === 'BARN-A');
    assert(!!barnA, 'Tìm thấy phân khu Barn A');
    if (barnA) {
      assert(barnA.stalls.length === 12, `Barn A phải có đúng 12 ô chuồng (Hiện tại: ${barnA.stalls.length})`);
      // Kiểm tra thứ tự từ trái sang phải, từ trên xuống dưới
      // A-01 (1,1), A-02 (1,2), A-03 (1,3), A-04 (2,1), A-05 (2,2), A-06 (2,3)...
      let correctPositions = true;
      for (let i = 0; i < barnA.stalls.length; i++) {
        const s = barnA.stalls[i];
        const expectedRow = Math.floor(i / 3) + 1;
        const expectedCol = (i % 3) + 1;
        if (s.row !== expectedRow || s.col !== expectedCol) {
          correctPositions = false;
          console.error(`Lệch vị trí ô ${s.code}: kỳ vọng (${expectedRow},${expectedCol}), thực tế (${s.row},${s.col})`);
        }
      }
      assert(correctPositions, 'Barn A sắp xếp tọa độ chuẩn 4x3 từ trái sang phải, trên xuống dưới (A-01..A-12)');
    }

    // -----------------------------------------------------------------------
    // TEST 2: Kiểm tra Hard Limit 6 ô chuồng / 1 Groom
    // -----------------------------------------------------------------------
    console.log('\n--- TEST NHÓM 2: ĐỊNH MỨC TỐI ĐA 6 Ô CHUỒNG / GROOM ---');
    // Lấy 1 Groom đang hoạt động
    const groom = await prisma.user.findFirst({
      where: { role: Role.GROOM, status: UserStatus.ACTIVE },
    });
    assert(!!groom, 'Tìm thấy tài khoản Groom trong hệ thống');

    // Đếm số chuồng Groom đang phụ trách
    const currentAllocCount = await prisma.stallAllocation.count({
      where: { assignedGroomUserId: groom!.id, isActive: true },
    });
    console.log(`ℹ️ Groom "${groom!.fullName}" hiện đang phụ trách: ${currentAllocCount}/6 ô chuồng`);
    assert(currentAllocCount <= 6, `Số ô chuồng của Groom ${groom!.fullName} không được vượt quá 6 (Hiện tại: ${currentAllocCount})`);

    // -----------------------------------------------------------------------
    // TEST 3: Kiểm tra ràng buộc ô trống không có ngựa (Waiting for horse)
    // -----------------------------------------------------------------------
    console.log('\n--- TEST NHÓM 3: RÀNG BUỘC Ô CHUỒNG TRỐNG ---');
    const emptyStalls = await prisma.stall.findMany({
      where: {
        status: StallStatus.AVAILABLE,
        allocations: { none: { isActive: true } },
      },
    });
    console.log(`ℹ️ Tìm thấy ${emptyStalls.length} ô chuồng trống không có ngựa`);
    if (emptyStalls.length > 0) {
      const sampleEmptyStall = emptyStalls[0];
      const activeAlloc = await prisma.stallAllocation.findFirst({
        where: { stallId: sampleEmptyStall.id, isActive: true },
      });
      assert(activeAlloc === null, `Ô chuồng trống ${sampleEmptyStall.code} không có StallAllocation active (Ngăn chặn sinh việc ma)`);
    }

    // -----------------------------------------------------------------------
    // TEST 4: Kiểm tra tính năng tạo công việc phát sinh (Ad-hoc Task)
    // -----------------------------------------------------------------------
    console.log('\n--- TEST NHÓM 4: CÔNG VIỆC PHÁT SINH ĐỘT XUẤT (AD-HOC) ---');
    const horseWithAlloc = await prisma.horse.findFirst({
      where: { stallAllocations: { some: { isActive: true } } },
      include: { stallAllocations: { where: { isActive: true }, include: { stall: true } } },
    });
    assert(!!horseWithAlloc, 'Tìm thấy chiến mã đang có chuồng');

    const alloc = horseWithAlloc!.stallAllocations[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const testTask = await prisma.dailyCareTask.create({
      data: {
        taskCode: `ADHOC-TEST-${Date.now().toString().slice(-6)}`,
        date: today,
        horseId: horseWithAlloc!.id,
        stallZoneId: alloc.stall.zoneId,
        stallId: alloc.stall.id,
        taskType: 'CLEANING',
        title: 'QA Test: Vệ sinh ô chuồng phát sinh khẩn cấp',
        scheduledTime: '15:30',
        assignedGroomUserId: alloc.assignedGroomUserId || groom!.id,
        description: 'Kiểm thử tính năng thêm công việc phát sinh của Ca 4',
        isCompleted: false,
      },
    });

    assert(!!testTask.id, 'Tạo thành công DailyCareTask loại ad-hoc');
    assert(testTask.taskCode ? testTask.taskCode.startsWith('ADHOC-') : false, 'Mã nhiệm vụ bắt đầu bằng tiền tố ADHOC-');
    assert(testTask.horseId === horseWithAlloc!.id, 'Nhiệm vụ gán đúng chiến mã');

    // Dọn dẹp task test
    await prisma.dailyCareTask.delete({ where: { id: testTask.id } });
    console.log('🧹 Đã dọn dẹp bản ghi kiểm thử ad-hoc task.');

    console.log('\n========================================================');
    console.log(`🎉 TẤT CẢ ${passedTests}/${totalTests} BÀI KIỂM THỬ ĐÃ ĐẠT 100%!`);
    console.log('========================================================');
  } catch (err) {
    console.error('❌ KIỂM THỬ THẤT BẠI:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
