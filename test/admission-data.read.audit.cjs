require('dotenv').config({ quiet: true });
require('ts-node').register({ transpileOnly: true });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const { rosterDay, shiftInterval } = require('../src/shift-rosters/groom-zones');
const target = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Local database only');
const db = new PrismaClient({ datasources: { db: { url: target.toString() } } });
const issues = [];
function add(code, severity, ids, detail) { if (ids.length) issues.push({ code, severity, count: ids.length, ids, detail }); }
const group = (rows, key) => { const result = new Map(); for (const row of rows) { const k = key(row); const list = result.get(k) || []; list.push(row); result.set(k, list); } return result; };
(async () => {
 try {
  const report = await db.$transaction(async tx => {
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   const now = new Date(), today = rosterDay(now), earliest = new Date(today.getTime() - 86400000);
   const [users, horses, stalls, allocations, admissions, rosters, tasks] = await Promise.all([
    tx.user.findMany({ select: { id: true, role: true, status: true } }),
    tx.horse.findMany({ select: { id: true, horseCode: true, ownerId: true, status: true, dob: true, microchip: true, microchipRfid: true, deletedAt: true } }),
    tx.stall.findMany({ include: { zoneRef: { select: { isActive: true } } } }),
    tx.stallAllocation.findMany({ where: { isActive: true }, include: { stall: true } }),
    tx.horseAdmissionRecord.findMany({ include: { history: { orderBy: { createdAt: 'asc' } }, healthReviews: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' } }),
    tx.shiftRoster.findMany({ where: { date: { gte: earliest } }, include: { shift: true } }),
    tx.dailyCareTask.findMany({ where: { date: { gte: earliest }, cancelledAt: null }, select: { id: true, horseId: true, date: true, shiftId: true, stallId: true, stallZoneId: true, assignedGroomUserId: true, isCompleted: true, taskType: true } })
   ]);
   const userMap = new Map(users.map(u => [u.id, u])), horseMap = new Map(horses.map(h => [h.id, h]));
   const activeHorses = horses.filter(h => !h.deletedAt);
   add('HORSE_INVALID_DOB', 'ERROR', activeHorses.filter(h => !h.dob || h.dob > now).map(h => h.id), 'Ngày sinh thiếu hoặc nằm trong tương lai.');
   add('HORSE_INVALID_MICROCHIP', 'ERROR', activeHorses.filter(h => !/^\d{15}$/.test(h.microchip || h.microchipRfid || '')).map(h => h.id), 'Chip không có đúng 15 chữ số.');
   add('HORSE_CHIP_ALIAS_MISMATCH', 'ERROR', activeHorses.filter(h => h.microchip && h.microchipRfid && h.microchip !== h.microchipRfid).map(h => h.id), 'Hai trường chip không trùng nhau.');
   add('HORSE_INVALID_OWNER', 'ERROR', activeHorses.filter(h => userMap.get(h.ownerId)?.role !== 'HORSE_OWNER').map(h => h.id), 'Chủ ngựa không có vai trò Chủ ngựa.');
   for (const [key, rows] of group(allocations, a => a.stallId)) if (rows.length > 1) add('MULTIPLE_HORSES_PER_STALL', 'ERROR', rows.map(a => a.id), key);
   for (const [key, rows] of group(allocations, a => a.horseId)) if (rows.length > 1) add('MULTIPLE_STALLS_PER_HORSE', 'ERROR', rows.map(a => a.id), key);
   add('ALLOCATION_STATUS_MISMATCH', 'ERROR', allocations.filter(a => a.stall.status !== 'OCCUPIED').map(a => a.id), 'Có ngựa nhưng trạng thái ô không phải OCCUPIED.');
   add('OCCUPIED_STALL_WITHOUT_HORSE', 'ERROR', stalls.filter(s => s.status === 'OCCUPIED' && !allocations.some(a => a.stallId === s.id)).map(s => s.id), 'Ô OCCUPIED không có phân bổ đang hoạt động.');
   add('ALLOCATION_INACTIVE_ZONE', 'ERROR', allocations.filter(a => !a.stall.zoneId || !stalls.find(s => s.id === a.stallId)?.zoneRef?.isActive).map(a => a.id), 'Ô đang chứa ngựa không có khu hoạt động.');
   add('UNADMITTED_HORSE_HAS_STALL', 'ERROR', allocations.filter(a => !horseMap.get(a.horseId) || horseMap.get(a.horseId).deletedAt || ['PENDING_ADMISSION','REJECTED','RETIRED'].includes(horseMap.get(a.horseId).status)).map(a => a.id), 'Ngựa chưa được tiếp nhận hoặc đã ngừng quản lý vẫn có ô hoạt động.');
   add('ALLOCATION_MISSING_PRIMARY_GROOM', 'WARNING', allocations.filter(a => !a.assignedGroomUserId).map(a => a.id), 'Cần quản lý phân Groom chính; không tự suy đoán người phụ trách.');
   add('ALLOCATION_INVALID_PRIMARY_GROOM', 'ERROR', allocations.filter(a => a.assignedGroomUserId && (userMap.get(a.assignedGroomUserId)?.role !== 'GROOM' || userMap.get(a.assignedGroomUserId)?.status !== 'ACTIVE')).map(a => a.id), 'Groom chính sai vai trò hoặc ngừng hoạt động.');
   for (const [id, rows] of group(allocations.filter(a => a.assignedGroomUserId), a => a.assignedGroomUserId)) {
    if (rows.length > 6) add('GROOM_OVER_6_STALLS','ERROR', rows.map(a => a.id), `Groom ${id}: ${rows.length} ô.`);
    if (new Set(rows.map(a => a.stall.zoneId)).size > 1) add('GROOM_MULTIPLE_PRIMARY_ZONES','ERROR', rows.map(a => a.id), `Groom ${id} phụ trách nhiều khu.`);
   }
   const ongoing = admissions.filter(a => ['PENDING_VERIFICATION','APPOINTED','INSPECTION_IN_PROGRESS'].includes(a.status));
   for (const [id, rows] of group(ongoing, a => a.horseId)) if (rows.length > 1) add('MULTIPLE_ACTIVE_ADMISSIONS','ERROR',rows.map(a => a.admissionCode),id);
   const appointed = ongoing.filter(a => ['APPOINTED','INSPECTION_IN_PROGRESS'].includes(a.status));
   add('ADMISSION_INVALID_APPOINTMENT','ERROR',appointed.filter(a => !a.appointmentDate || !a.appointmentEndDate || a.appointmentEndDate <= a.appointmentDate).map(a => a.admissionCode),'Thiếu hoặc sai khoảng giờ hẹn.');
   add('ADMISSION_MISSING_PARTICIPANTS','WARNING',appointed.filter(a => !a.managerUserId || !a.veterinarianUserId).map(a => a.admissionCode),'Lịch cũ thiếu Quản lý/Bác sĩ; cần xếp lại lịch chung.');
   add('ADMISSION_WRONG_PARTICIPANT_ROLE','ERROR',appointed.filter(a => (a.managerUserId && userMap.get(a.managerUserId)?.role !== 'CLUB_MANAGER') || (a.veterinarianUserId && userMap.get(a.veterinarianUserId)?.role !== 'VETERINARIAN')).map(a => a.admissionCode),'Người được phân công sai vai trò.');
   add('REJECTION_WITHOUT_REASON','ERROR',admissions.filter(a => a.status === 'REJECTED' && (!a.rejectionReason || a.rejectionReason.trim().length < 10)).map(a => a.admissionCode),'Lý do từ chối phải ít nhất 10 ký tự.');
   add('LEGACY_HEALTH_WITHOUT_FINALIZATION','WARNING',admissions.filter(a => a.isHealthEligible !== null && !a.healthFinalizedAt).map(a => a.admissionCode),'Kết luận cũ chưa có mốc chốt, không tự xác nhận thay bác sĩ.');
   add('FINALIZED_HEALTH_WITHOUT_REVIEW','ERROR',admissions.filter(a => a.healthFinalizedAt && !a.healthReviews.length).map(a => a.admissionCode),'Có mốc chốt nhưng thiếu bản kết luận bất biến.');
   add('APPROVED_WITHOUT_CRITERIA','ERROR',admissions.filter(a => a.status === 'APPROVED' && (!a.microchipVerified || !a.legalVerified || a.isHealthEligible !== true || !a.admittedAt)).map(a => a.admissionCode),'Đã duyệt nhưng thiếu điều kiện hoặc thời điểm tiếp nhận.');
   add('ADMISSION_HISTORY_STATUS_MISMATCH','WARNING',admissions.filter(a => !a.history.length || a.history[a.history.length-1].toStatus !== a.status).map(a => a.admissionCode),'Lịch sử thiếu hoặc bước cuối không khớp trạng thái hiện tại.');
   const futureRosters = rosters.filter(r => shiftInterval(r.date,r.shift).end > now.getTime());
   add('ROSTER_INVALID_DUTIES','ERROR',futureRosters.filter(r => !r.dutyTypes.length || r.dutyTypes.some(d => !['CLEANING','HORSE_CARE'].includes(d))).map(r => r.id),'Nhiệm vụ ca không hợp lệ.');
   add('ROSTER_INACTIVE_STAFF_OR_SHIFT','ERROR',futureRosters.filter(r => userMap.get(r.groomUserId)?.role !== 'GROOM' || userMap.get(r.groomUserId)?.status !== 'ACTIVE' || !r.shift.isActive).map(r=>r.id),'Ca sắp tới giao cho nhân viên/ca không hợp lệ.');
   for (const [id, rows] of group(futureRosters, r=>r.groomUserId)) {
    const sorted=rows.map(r=>({...r,interval:shiftInterval(r.date,r.shift)})).sort((a,b)=>a.interval.start-b.interval.start);
    const overlap=new Set(); for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length && sorted[j].interval.start<sorted[i].interval.end;j++){overlap.add(sorted[i].id);overlap.add(sorted[j].id);}
    add('GROOM_ROSTER_OVERLAP','ERROR',[...overlap],`Groom ${id}: ca trực chồng giờ.`);
   }
   const pending=tasks.filter(t=>!t.isCompleted && t.date>=today);
   add('PENDING_TASK_UNASSIGNED','WARNING',pending.filter(t=>!t.assignedGroomUserId || !t.shiftId).map(t=>t.id),'Việc chưa có Groom/ca; cần bố trí hoặc đồng bộ checklist.');
   add('PENDING_TASK_STALE_STALL','ERROR',pending.filter(t=>!allocations.some(a=>a.horseId===t.horseId && a.stallId===t.stallId && a.stall.zoneId===t.stallZoneId)).map(t=>t.id),'Việc chưa hoàn thành không khớp ô hiện tại của ngựa.');
   add('PENDING_TASK_WITHOUT_MATCHING_ROSTER','ERROR',pending.filter(t=>t.assignedGroomUserId && t.shiftId && !rosters.some(r=>r.groomUserId===t.assignedGroomUserId && r.shiftId===t.shiftId && r.zoneId===t.stallZoneId && r.date.getTime()===t.date.getTime() && r.dutyTypes.includes(t.taskType==='CLEANING'?'CLEANING':'HORSE_CARE'))).map(t=>t.id),'Người được giao không có ca/nhiệm vụ tương ứng.');
   for(const [key,rows] of group(tasks.filter(t=>t.assignedGroomUserId && t.shiftId),t=>`${t.date.toISOString().slice(0,10)}|${t.shiftId}|${t.assignedGroomUserId}`)) if(new Set(rows.map(t=>t.horseId)).size>6) add('GROOM_SHIFT_OVER_6_HORSES','ERROR',[key],`Đã giao ${new Set(rows.map(t=>t.horseId)).size} ngựa.`);
   const pendingWithoutStall = pending.filter(t=>!allocations.some(a=>a.horseId===t.horseId && a.stallId===t.stallId && a.stall.zoneId===t.stallZoneId));
   const context = {
    missingGrooms: allocations.filter(a=>!a.assignedGroomUserId).map(a=>({ allocationId:a.id,horseCode:horseMap.get(a.horseId)?.horseCode,stallCode:a.stall.code,zoneId:a.stall.zoneId })),
    appointed:appointed.map(a=>({ code:a.admissionCode,status:a.status,appointmentDate:a.appointmentDate,appointmentEndDate:a.appointmentEndDate,hasManager:!!a.managerUserId,hasVet:!!a.veterinarianUserId })),
    legacyHealth:admissions.filter(a=>a.isHealthEligible!==null&&!a.healthFinalizedAt).map(a=>({code:a.admissionCode,status:a.status,result:a.isHealthEligible})),
    unassignedByDate:[...group(pending.filter(t=>!t.assignedGroomUserId||!t.shiftId),t=>t.date.toISOString().slice(0,10))].map(([date,rows])=>({date,tasks:rows.length,horses:new Set(rows.map(t=>t.horseId)).size})),
    staleTasksByHorse:[...group(pendingWithoutStall,t=>t.horseId)].map(([horseId,rows])=>({horseId,horseCode:horseMap.get(horseId)?.horseCode,status:horseMap.get(horseId)?.status,tasks:rows.length,hasActiveAllocation:allocations.some(a=>a.horseId===horseId),currentStalls:allocations.filter(a=>a.horseId===horseId).map(a=>a.stall.code),taskStallMissing:rows.filter(t=>!t.stallId||!t.stallZoneId).length})),
    rosters:futureRosters.map(r=>({date:r.date.toISOString().slice(0,10),shift:r.shift.name,startTime:r.shift.startTime,endTime:r.shift.endTime,zoneId:r.zoneId,dutyTypes:r.dutyTypes}))
   };
   return { context, checkedAt:now.toISOString(), databaseHost:target.hostname, readOnly:true, counts:{users:users.length,horses:horses.length,stalls:stalls.length,activeAllocations:allocations.length,admissions:admissions.length,upcomingRosters:futureRosters.length,recentTasks:tasks.length}, issues, rejectedAppointments:admissions.filter(a=>a.status==='REJECTED').map(a=>({admissionCode:a.admissionCode,horseId:a.horseId,appointmentDate:a.appointmentDate,appointmentEndDate:a.appointmentEndDate,hasReason:!!a.rejectionReason,historyCount:a.history.length})) };
  }, { timeout:60000, isolationLevel:'RepeatableRead' });
  fs.writeFileSync('../tmp/admission-data-audit-2026-11-25.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,issues:report.issues.map(({ids,...rest})=>({...rest,samples:ids.slice(0,4)}))},null,2));
 } finally { await db.$disconnect(); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
