import { randomUUID } from 'node:crypto';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/exceptions/api-error';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { availableAdmissionStalls, lockAdmissionStall } from '../../horses/admission-capacity';
import { assertPrimaryGroom, assertReceivingGroom } from '../../stalls/groom-care.rules';
import { onDutyGrooms } from '../../shift-rosters/groom-zones';
import { assertTrainerZone, LIVE_TRAINER_PLAN_STATUSES } from '../../training/trainer-zones';
import {
  clubDate,
  isHeavy,
  MAX_DAILY_WORKOUTS_PER_GROOM,
  MAX_HORSES_PER_TRAINER,
  startOfClubDay,
  TRACK_MAX_LIGHT_HORSES,
  validatePhases,
  withinTrainingHours,
  workoutDurationMinutes,
} from '../../training/training-rules';
import {
  AvailableTrack,
  OccupiedWorkout,
  evaluateWorkoutAvailability,
  lockWorkoutSchedule,
} from '../../training/workout-availability.service';
import { DemoArgs } from '../demo-data.catalog';
import { createDemoAdmission, createDemoHorse } from './admission-pending.fixture';

const DAY = 86_400_000;

function unavailable(message: string, reasons: string[] = []) {
  return apiError(HttpStatus.CONFLICT, 'RESOURCE_UNAVAILABLE', message, { reasons });
}

function expectedConstraint(error: unknown): error is HttpException {
  return (
    error instanceof HttpException &&
    [HttpStatus.CONFLICT, HttpStatus.BAD_REQUEST].includes(error.getStatus())
  );
}

function selectWorkoutDates(
  now: Date,
  horseId: string,
  trainerUserId: string,
  track: AvailableTrack,
  rows: OccupiedWorkout[],
): Date[] {
  const chosen: Date[] = [];
  const occupied = [...rows];
  const offsets = [
    ...Array.from({ length: 7 }, (_, index) => 7 - index),
    ...Array.from({ length: 13 }, (_, index) => 20 - index),
  ];
  for (const offset of offsets) {
    const date = clubDate(new Date(+now - offset * DAY));
    if (
      occupied.filter(
        (row) =>
          row.trainingPlan.trainerUserId === trainerUserId && clubDate(row.scheduledDate) === date,
      ).length >= MAX_DAILY_WORKOUTS_PER_GROOM
    )
      continue;
    for (const hour of [13, 15, 10, 8]) {
      const scheduledDate = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+07:00`);
      const end = +scheduledDate + workoutDurationMinutes('TROT') * 60_000;
      if (!withinTrainingHours(scheduledDate) || !withinTrainingHours(new Date(end))) continue;
      if (chosen.some((previous) => Math.abs(+previous - +scheduledDate) < DAY)) continue;
      const overlapping = occupied.filter(
        (row) =>
          +row.scheduledDate < end &&
          +scheduledDate < +row.scheduledDate + workoutDurationMinutes(row.workoutType) * 60_000,
      );
      if (
        overlapping.filter((row) => row.trackSurface === 'TURF').length >= TRACK_MAX_LIGHT_HORSES ||
        overlapping.some(
          (row) => row.trackSurface === 'TURF' && isHeavy(row.workoutType, row.intensity),
        )
      )
        continue;
      try {
        evaluateWorkoutAvailability(
          {
            horseId,
            trainerUserId,
            scheduledDate,
            workoutType: 'TROT',
            intensity: 'LIGHT',
            trackSurface: 'TURF',
            trackId: track.id,
          },
          { ...track, capacity: Math.min(track.capacity, TRACK_MAX_LIGHT_HORSES) },
          occupied,
        );
      } catch (error) {
        if (expectedConstraint(error)) continue;
        throw error;
      }
      chosen.push(scheduledDate);
      occupied.push({
        id: `demo-slot-${chosen.length}`,
        horseId,
        trackId: track.id,
        trackSurface: 'TURF',
        scheduledDate,
        workoutType: 'TROT',
        intensity: 'LIGHT',
        status: 'COMPLETED',
        trainingPlan: { trainerUserId },
      });
      break;
    }
    if (chosen.length === 4) return chosen.sort((a, b) => +a - +b);
  }
  return [];
}

async function selectResources(tx: Prisma.TransactionClient, id: string, now: Date) {
  await lockWorkoutSchedule(tx);
  // Same care-assignment lock as existing services, returning an integer for Prisma's driver.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(74203211)`;
  const [stalls, vet, trainers, tracks, occupied] = await Promise.all([
    tx.stall.findMany({
      where: {
        AND: [availableAdmissionStalls, { zoneId: { not: null }, zoneRef: { isActive: true } }],
      },
      orderBy: { code: 'asc' },
      take: 100,
    }),
    tx.user.findFirst({
      where: { role: 'VETERINARIAN', status: 'ACTIVE' },
      select: { id: true, fullName: true },
      orderBy: { createdAt: 'asc' },
    }),
    tx.user.findMany({
      where: { role: 'HEAD_TRAINER', status: 'ACTIVE' },
      select: { id: true, fullName: true },
      orderBy: { createdAt: 'asc' },
    }),
    tx.trainingTrack.findMany({
      where: { isActive: true, surface: 'TURF', capacity: { gt: 0 } },
      orderBy: { code: 'asc' },
    }),
    tx.workoutSession.findMany({
      where: {
        status: { in: ['SCHEDULED', 'COMPLETED'] },
        scheduledDate: { gte: new Date(+now - 22 * DAY), lt: now },
      },
      select: {
        id: true,
        horseId: true,
        trackId: true,
        trackSurface: true,
        scheduledDate: true,
        workoutType: true,
        intensity: true,
        status: true,
        trainingPlan: { select: { trainerUserId: true } },
        horse: { select: { name: true } },
      },
    }),
  ]);
  if (!stalls.length) throw unavailable('Chưa có ô chuồng trống thuộc khu đang hoạt động.');
  if (!vet) throw unavailable('Chưa có Bác sĩ thú y đang hoạt động để gắn lịch sử mẫu.');
  if (!trainers.length) throw unavailable('Chưa có HLV đang hoạt động để gắn lịch sử mẫu.');
  if (!tracks.length)
    throw unavailable('Chưa có sân tập cỏ đang hoạt động và còn sức chứa hợp lệ.');
  const reasons = new Set<string>();
  for (const stall of stalls) {
    if (!stall.zoneId) continue;
    const duty = await onDutyGrooms(tx, stall.zoneId, now);
    for (const roster of duty) {
      if (roster.dutyTypes && !roster.dutyTypes.includes('HORSE_CARE')) continue;
      try {
        const groom = await assertPrimaryGroom(tx, stall.zoneId, roster.groomUserId);
        await assertReceivingGroom(tx, stall.zoneId, groom.id, id, now);
        for (const trainer of trainers) {
          const plans = await tx.trainingPlan.findMany({
            where: {
              trainerUserId: trainer.id,
              status: { in: LIVE_TRAINER_PLAN_STATUSES },
              horse: { deletedAt: null },
            },
            select: { horseId: true },
          });
          if (new Set(plans.map((plan) => plan.horseId)).size >= MAX_HORSES_PER_TRAINER) {
            reasons.add(`HLV đã đủ định mức ${MAX_HORSES_PER_TRAINER} ngựa.`);
            continue;
          }
          try {
            await assertTrainerZone(tx, id, stall.zoneId, [trainer.id]);
          } catch (error) {
            if (expectedConstraint(error)) {
              reasons.add(error.message);
              continue;
            }
            throw error;
          }
          for (const track of tracks) {
            const dates = selectWorkoutDates(now, id, trainer.id, track, occupied);
            if (dates.length !== 4) {
              reasons.add(
                'Chưa tìm được bốn buổi lịch sử đủ khoảng nghỉ và không trùng HLV/sân tập.',
              );
              continue;
            }
            const pastPlans = await tx.trainingPlan.findMany({
              where: {
                trainerUserId: trainer.id,
                status: { not: 'CANCELLED' },
                startDate: { lte: dates[3] },
                endDate: { gte: dates[0] },
                horse: { deletedAt: null },
              },
              select: { horseId: true },
            });
            if (new Set(pastPlans.map((plan) => plan.horseId)).size >= MAX_HORSES_PER_TRAINER) {
              reasons.add('Lịch sử giáo án của HLV đã đủ định mức trong khoảng ngày cần dựng mẫu.');
              continue;
            }
            return { stall, groom, trainer, vet, track, dates };
          }
        }
      } catch (error) {
        if (expectedConstraint(error)) {
          reasons.add(error.message);
          continue;
        }
        throw error;
      }
    }
    if (!duty.length) reasons.add('Chưa có Groom đang trực chăm sóc tại khu chuồng trống.');
  }
  throw unavailable(
    `Chưa có bộ chuồng/Groom/HLV hợp lệ. ${[...reasons].slice(0, 3).join(' ')}`,
    [...reasons].slice(0, 3),
  );
}

export async function createRaceReady(
  tx: Prisma.TransactionClient,
  args: DemoArgs,
  id: string,
  actor: CurrentUserPayload,
  now: Date,
) {
  const resources = await selectResources(tx, id, now);
  const { stall, groom, trainer, vet, track, dates } = resources;
  await lockAdmissionStall(tx, stall.id);
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${vet.id}, ${trainer.id}, ${groom.id}) ORDER BY "id" FOR SHARE`;
  const staff = await tx.user.findMany({
    where: { id: { in: [vet.id, trainer.id, groom.id] } },
    select: { id: true, role: true, status: true },
  });
  for (const [userId, role] of [
    [vet.id, 'VETERINARIAN'],
    [trainer.id, 'HEAD_TRAINER'],
    [groom.id, 'GROOM'],
  ]) {
    if (!staff.some((user) => user.id === userId && user.role === role && user.status === 'ACTIVE'))
      throw unavailable('Nhân sự đã thay đổi trạng thái. Vui lòng tải lại và thử lại cùng mã.');
  }
  const horse = await createDemoHorse(tx, args, id, now);
  const pending = await createDemoAdmission(tx, args, horse, actor, now);
  const admittedAt = new Date(+now - 180 * DAY);
  const injuryAt = new Date(+now - 130 * DAY);
  const recoveredAt = new Date(+now - 25 * DAY);
  const admission = await tx.horseAdmissionRecord.update({
    where: { id: pending.id },
    data: {
      status: 'APPROVED',
      managerUserId: actor.userId,
      approvedByUserId: actor.userId,
      admittedAt,
      appointmentDate: new Date(+admittedAt - DAY),
      appointmentEndDate: new Date(+admittedAt - DAY + 45 * 60_000),
      appointmentNotes: '[DEMO] Lịch hẹn và quyết định trong quá khứ là dữ liệu mẫu.',
      scannedMicrochip: horse.microchip,
      microchipVerified: true,
      legalVerified: true,
      legalDocumentsNote: '[DEMO] Kết quả xác minh giả định; không kèm giấy tờ pháp lý thật.',
      veterinarianUserId: vet.id,
      isHealthEligible: true,
      healthFinalizedAt: admittedAt,
      healthCheckNotes: '[DEMO] Kết quả khám tiếp nhận giả định đã chốt.',
      healthReviews: {
        create: {
          veterinarianUserId: vet.id,
          veterinarianName: `${vet.fullName} (DEMO)`,
          isHealthEligible: true,
          notes: '[DEMO] Snapshot tiếp nhận lịch sử, được tạo bởi Quản lý trong bộ mẫu.',
        },
      },
      history: {
        create: [
          {
            fromStatus: 'PENDING_VERIFICATION',
            toStatus: 'APPOINTED',
            actorUserId: actor.userId,
            actorName: actor.fullName,
            note: '[DEMO] Dựng lịch hẹn giả định trong quá khứ.',
            createdAt: new Date(+now + 1),
          },
          {
            fromStatus: 'APPOINTED',
            toStatus: 'INSPECTION_IN_PROGRESS',
            actorUserId: actor.userId,
            actorName: actor.fullName,
            note: '[DEMO] Dựng kết quả thẩm định giả định.',
            createdAt: new Date(+now + 2),
          },
          {
            fromStatus: 'INSPECTION_IN_PROGRESS',
            toStatus: 'APPROVED',
            actorUserId: actor.userId,
            actorName: actor.fullName,
            note: '[DEMO] Tiếp nhận giả định; việc chiếm chuồng hiện tại bắt đầu hôm nay.',
            createdAt: new Date(+now + 3),
          },
        ],
      },
    },
    include: { healthReviews: true, history: true },
  });
  const medical = await tx.medicalRecord.create({
    data: {
      horseId: horse.id,
      veterinarianUserId: vet.id,
      status: 'CLOSED',
      examinationDate: injuryAt,
      examinationType: 'FOLLOW_UP',
      severity: 'SEVERE',
      examinationReason: '[DEMO] Bệnh án gãy chân đã hồi phục.',
      symptoms: '[DEMO] Tiền sử đau chân trước trái; đã hết triệu chứng khi đóng bệnh án.',
      clinicalDiagnosis: '[DEMO] Gãy xương chân trước trái; kết luận cuối đã hồi phục.',
      treatmentProtocol:
        '[DEMO] Lịch sử cố định chân, theo dõi và phục hồi; không có chỉ định thuốc thật.',
      conclusion: '[DEMO] Đã hồi phục, kết thúc điều trị trước các buổi tập mẫu.',
      treatmentResult: 'RECOVERED',
      closedAt: recoveredAt,
      prescriptions: '[]',
      prescriptionDetails: '[]',
      requiresFollowUp: false,
    },
  });
  const injury = await tx.injuryLog.create({
    data: {
      horseId: horse.id,
      medicalRecordId: medical.id,
      coordinateX: 0.3,
      coordinateY: 0.75,
      viewSide: 'LEFT',
      layer: 'SKELETON',
      anatomicalZone: 'Chân trước trái',
      bodySide: 'LEFT',
      injuryType: 'FRACTURE',
      severity: 'MILD',
      stage: 'HEALED',
      status: 'RESOLVED',
      discoveryDate: injuryAt,
      description: '[DEMO] Tổn thương lịch sử đã hồi phục hoàn toàn.',
      recoveryHistory: [
        {
          id: randomUUID(),
          stage: 'ACUTE',
          evaluationDate: injuryAt.toISOString(),
          severity: 'SEVERE',
          notes: '[DEMO] Chấn thương giả định.',
          updatedByUserId: actor.userId,
          updatedByName: `${actor.fullName} (DEMO)`,
          createdAt: now.toISOString(),
        },
        {
          id: randomUUID(),
          stage: 'RECOVERING',
          evaluationDate: new Date(+now - 50 * DAY).toISOString(),
          severity: 'MODERATE',
          notes: '[DEMO] Đang hồi phục trong lịch sử mẫu.',
          updatedByUserId: actor.userId,
          updatedByName: `${actor.fullName} (DEMO)`,
          createdAt: now.toISOString(),
        },
        {
          id: randomUUID(),
          stage: 'HEALED',
          evaluationDate: recoveredAt.toISOString(),
          severity: 'MILD',
          notes: '[DEMO] Hoàn tất hồi phục trước khi tập.',
          updatedByUserId: actor.userId,
          updatedByName: `${actor.fullName} (DEMO)`,
          createdAt: now.toISOString(),
        },
      ],
    },
  });
  const medicalLock = await tx.medicalLock.create({
    data: {
      horseId: horse.id,
      medicalRecordId: medical.id,
      source: 'VET',
      veterinarianUserId: vet.id,
      issuedByUserId: vet.id,
      lockedAt: injuryAt,
      expectedRestDays: 105,
      recheckDate: recoveredAt,
      appliedMedicalStatus: 'INJURED',
      lockReason: '[DEMO] Khóa y tế lịch sử trong giai đoạn phục hồi gãy chân.',
      unlockConditions: '[DEMO] Hoàn tất phục hồi.',
      isLocked: false,
      unlockedAt: recoveredAt,
      unlockVetUserId: vet.id,
      unlockReason: '[DEMO] Lịch sử mở khóa sau hồi phục.',
    },
  });
  await tx.stall.update({ where: { id: stall.id }, data: { status: 'OCCUPIED' } });
  const allocation = await tx.stallAllocation.create({
    data: {
      stallId: stall.id,
      horseId: horse.id,
      assignedGroomUserId: groom.id,
      startDate: now,
      isActive: true,
    },
  });
  const startDate = startOfClubDay(dates[0]);
  const endDate = startOfClubDay(dates[3]);
  const phase = {
    id: randomUUID(),
    name: 'DEMO Củng cố sau hồi phục',
    type: 'RECOVERY',
    startDate: clubDate(startDate),
    endDate: clubDate(endDate),
    goal: '[DEMO] Lịch sử bốn buổi tập hoàn thành.',
    sessionsPerWeek: 4,
    maxWeeklyDistance: 6000,
    surface: 'TURF',
    targetSpeedKmh: 15,
  };
  const validated = validatePhases([phase], clubDate(startDate), clubDate(endDate));
  if ('code' in validated) throw unavailable(validated.message);
  let planCode: string | undefined;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const counter = await tx.counter.upsert({
      where: { name: 'training_plan' },
      create: { name: 'training_plan', value: 1 },
      update: { value: { increment: 1 } },
    });
    const candidate = `GA-${String(counter.value).padStart(6, '0')}`;
    if (!(await tx.trainingPlan.findUnique({ where: { planCode: candidate } }))) {
      planCode = candidate;
      break;
    }
  }
  if (!planCode) throw unavailable('Chưa sinh được mã giáo án mẫu duy nhất.');
  const plan = await tx.trainingPlan.create({
    data: {
      horseId: horse.id,
      trainerUserId: trainer.id,
      planCode,
      phaseName: phase.name,
      objective: '[DEMO] Lịch sử đủ điều kiện đăng ký thi đấu.',
      notes:
        '[DEMO] Dữ liệu quá khứ được tạo bằng Toolkit; không thay đổi quy tắc tạo giáo án thông thường.',
      phases: JSON.parse(JSON.stringify(validated.phases)),
      targetSpeed: 15,
      targetDistance: 1000,
      trackSurface: 'TURF',
      startDate,
      endDate,
      status: 'COMPLETED',
      completionSummary: '[DEMO] Hoàn tất bốn buổi tập sau hồi phục; chưa đăng ký thi đấu.',
    },
  });
  const workouts: { id: string }[] = [];
  for (const scheduledDate of dates) {
    workouts.push(
      await tx.workoutSession.create({
        data: {
          horseId: horse.id,
          trainingPlanId: plan.id,
          phaseId: phase.id,
          trackId: track.id,
          assignedStaffUserId: trainer.id,
          jockeyName: trainer.fullName,
          scheduledDate,
          workoutType: 'TROT',
          intensity: 'LIGHT',
          trackSurface: 'TURF',
          distanceMeters: 1000,
          repetitions: 1,
          targetSpeedKmh: 15,
          targetDurationSeconds: 240,
          actualTimeSeconds: 240,
          actualDistanceMeters: 1000,
          actualSurface: 'TURF',
          trackCondition: 'GOOD',
          completionLevel: 'FULL',
          averageSpeedKmh: 15,
          topSpeedKmh: 18,
          heartRatePeak: 160,
          heartRateRecovery: 70,
          recoveryTimeMinutes: 15,
          performanceScore: 82,
          staminaScore: 85,
          injuryRiskLevel: 'LOW',
          status: 'COMPLETED',
          resultRecordedAt: new Date(+scheduledDate + workoutDurationMinutes('TROT') * 60_000),
          resultRecordedById: trainer.id,
          trainerNotes:
            '[DEMO] Lịch sử tập mẫu, HLV phụ trách trực tiếp dẫn buổi tập theo luật hiện tại.',
          resultNotes: '[DEMO] Kết quả giả định sau khi đã hồi phục hoàn toàn.',
        },
      }),
    );
  }
  await tx.horse.update({
    where: { id: horse.id },
    data: { status: 'ACTIVE', isMedicalLocked: false, isDebtImpounded: false },
  });
  const raceDate = new Date(`${clubDate(new Date(+now + 7 * DAY))}T09:00:00+07:00`);
  const tournament = await tx.tournament.create({
    data: {
      name: `DEMO Cúp trở lại ${args.horseName}`,
      raceDate,
      location: 'Trường đua CLB - dữ liệu DEMO',
      distanceMeters: 1000,
      trackType: 'TURF',
      entryFee: 200000,
      prizePool: 5000000,
      maxFieldSize: 12,
      minAgeYears: 2,
      minWeightKg: 450,
      maxWeightKg: 550,
      registrationDeadline: new Date(`${clubDate(new Date(+now + 4 * DAY))}T17:00:00+07:00`),
      status: 'OPEN_REGISTRATION',
    },
  });
  const readback = await tx.horse.findUnique({
    where: { id: horse.id },
    include: {
      medicalLocks: { where: { unlockedAt: null } },
      workoutSessions: {
        where: { status: 'COMPLETED', scheduledDate: { gte: new Date(+now - 30 * DAY), lt: now } },
      },
      tournamentRegistrations: true,
      financialInvoices: true,
    },
  });
  if (
    !readback ||
    readback.status !== 'ACTIVE' ||
    readback.isMedicalLocked ||
    readback.isDebtImpounded ||
    readback.medicalLocks.length ||
    readback.workoutSessions.length !== 4 ||
    readback.tournamentRegistrations.length ||
    readback.financialInvoices.length
  )
    throw unavailable('Bộ mẫu chưa đạt kiểm tra sau tạo. Toàn bộ lượt tạo sẽ được hoàn tác.');
  return {
    horseId: horse.id,
    records: [
      { entity: 'Horse', ids: [horse.id] },
      { entity: 'HorseAdmissionRecord', ids: [admission.id] },
      { entity: 'AdmissionHistoryLog', ids: admission.history.map((log) => log.id) },
      { entity: 'AdmissionHealthReview', ids: admission.healthReviews.map((review) => review.id) },
      { entity: 'MedicalRecord', ids: [medical.id] },
      { entity: 'InjuryLog', ids: [injury.id] },
      { entity: 'MedicalLock', ids: [medicalLock.id] },
      { entity: 'StallAllocation', ids: [allocation.id] },
      { entity: 'TrainingPlan', ids: [plan.id] },
      { entity: 'WorkoutSession', ids: workouts.map((workout) => workout.id) },
      { entity: 'Tournament', ids: [tournament.id] },
    ],
    links: [
      { label: 'Xem ngựa vừa tạo', path: `/horses/${horse.id}` },
      { label: 'Xem danh sách giải mở đăng ký', path: '/races' },
    ],
    warnings: [
      `[DEMO] Đã dùng ô ${stall.code}, Groom ${groom.fullName}; HLV ${trainer.fullName} và sân ${track.code} cho lịch sử tập mẫu.`,
      '[DEMO] Lịch sử y tế/tập luyện là giả định. Chiếm chuồng bắt đầu từ hôm nay; không gán lịch sử cư trú vào ô đang có ngựa khác.',
      `Giải mẫu: ${tournament.name}. Chưa có đăng ký thi đấu, kết quả hoặc hóa đơn.`,
    ],
  };
}
