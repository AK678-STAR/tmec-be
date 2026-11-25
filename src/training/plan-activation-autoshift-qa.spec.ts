import { HttpStatus } from '@nestjs/common';
import { HorseStatus, PlanStatus, Role, TrackSurface, UserStatus, WorkoutStatus } from '@prisma/client';
import { TrainingPlansService } from './training-plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CounterService } from '../audit/counter.service';
import { TrainingCommonService } from './training-common.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('TrainingPlansService - Auto-Shift on Activation QA', () => {
  let service: TrainingPlansService;
  let mockPrisma: any;
  let mockAudit: any;

  const mockTrainer: CurrentUserPayload = {
    userId: 'trainer-1',
    fullName: 'HLV Tuấn',
    email: 'tuan@tmec.vn',
    role: Role.HEAD_TRAINER as any,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = {
      $transaction: jest.fn((work: (tx: any) => any) => work(mockPrisma)),
      $queryRaw: jest.fn().mockResolvedValue([]),
      trainingPlan: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        count: jest.fn(),
      },
      horse: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      workoutSession: {
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn().mockResolvedValue(2),
      },
      medicalRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'trainer-1', status: UserStatus.ACTIVE }),
      },
    };

    mockAudit = { record: jest.fn() };

    service = new TrainingPlansService(
      mockPrisma as unknown as PrismaService,
      mockAudit as unknown as AuditService,
      { next: jest.fn() } as unknown as CounterService,
      { notifyUsers: jest.fn(), notifyHorse: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationsService,
      {} as unknown as TrainingCommonService,
    );
  });

  it('QA-SHIFT-01: Tịnh tiến đồng bộ ngày giáo án, từng giai đoạn và từng buổi tập khi kích hoạt với ngày bắt đầu thực tế', async () => {
    const origPlanStart = new Date('2026-12-01T00:00:00.000Z');
    const origPlanEnd = new Date('2026-12-31T00:00:00.000Z');
    const targetStart = new Date('2026-12-06T00:00:00.000Z'); // Dời lên 5 ngày (+5 days = +432,000,000 ms)

    const phases = [
      {
        id: 'p-1',
        name: 'Giai đoạn 1',
        startDate: '2026-12-01T00:00:00.000Z',
        endDate: '2026-12-15T00:00:00.000Z',
      },
      {
        id: 'p-2',
        name: 'Giai đoạn 2',
        startDate: '2026-12-16T00:00:00.000Z',
        endDate: '2026-12-31T00:00:00.000Z',
      },
    ];

    const draftPlan = {
      id: 'plan-1',
      horseId: 'horse-1',
      trainerUserId: 'trainer-1',
      status: PlanStatus.DRAFT,
      startDate: origPlanStart,
      endDate: origPlanEnd,
      phases,
      phaseName: 'Giáo án thể lực mùa đông',
    };

    const horse = {
      id: 'horse-1',
      name: 'Bạch Long',
      status: HorseStatus.RESTING,
      isMedicalLocked: false,
      isDebtImpounded: false,
      deletedAt: null,
    };

    const sessions = [
      { id: 's-1', scheduledDate: new Date('2026-12-02T08:00:00.000Z') },
      { id: 's-2', scheduledDate: new Date('2026-12-20T08:00:00.000Z') },
    ];

    mockPrisma.trainingPlan.findUnique.mockResolvedValue(draftPlan);
    mockPrisma.horse.findUnique.mockResolvedValue(horse);
    mockPrisma.workoutSession.findMany.mockResolvedValue(sessions);
    mockPrisma.trainingPlan.update.mockImplementation((args: any) => ({
      ...draftPlan,
      ...args.data,
      horse,
    }));

    const result = await service.changePlanStatus(
      'plan-1',
      {
        status: PlanStatus.ACTIVE,
        effectiveStartDate: '2026-12-06T00:00:00.000Z',
      },
      mockTrainer,
    );

    // 1. Kiểm tra cập nhật Plan với ngày mới
    const shiftMs = 5 * 24 * 60 * 60 * 1000;
    expect(mockPrisma.trainingPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'plan-1' },
        data: expect.objectContaining({
          startDate: targetStart,
          endDate: new Date(origPlanEnd.getTime() + shiftMs),
        }),
      }),
    );

    // 2. Kiểm tra các phases được tịnh tiến
    const updateCall = mockPrisma.trainingPlan.update.mock.calls[0][0];
    const shiftedPhases = updateCall.data.phases;
    expect(shiftedPhases[0].startDate).toBe('2026-12-06T00:00:00.000Z');
    expect(shiftedPhases[0].endDate).toBe('2026-12-20T00:00:00.000Z');
    expect(shiftedPhases[1].startDate).toBe('2026-12-21T00:00:00.000Z');
    expect(shiftedPhases[1].endDate).toBe('2027-01-05T00:00:00.000Z');

    // 3. Kiểm tra từng buổi tập được tịnh tiến đúng +5 ngày
    expect(mockPrisma.workoutSession.update).toHaveBeenCalledWith({
      where: { id: 's-1' },
      data: { scheduledDate: new Date('2026-12-07T08:00:00.000Z') },
    });
    expect(mockPrisma.workoutSession.update).toHaveBeenCalledWith({
      where: { id: 's-2' },
      data: { scheduledDate: new Date('2026-12-25T08:00:00.000Z') },
    });

    // 4. Ngựa RESTING được chuyển thành IN_TRAINING
    expect(mockPrisma.horse.update).toHaveBeenCalledWith({
      where: { id: 'horse-1' },
      data: { status: HorseStatus.IN_TRAINING },
    });
  });
});
