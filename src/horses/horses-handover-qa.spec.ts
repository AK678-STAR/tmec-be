import { HttpException, HttpStatus } from '@nestjs/common';
import { HandoverStatus, HorseStatus, Role, TrainerAssignmentStatus, UserStatus } from '@prisma/client';
import { HandoverAction } from './dto/handover.dto';
import { HorsesService } from './horses.service';
import { AuditService } from '../audit/audit.service';
import { CounterService } from '../audit/counter.service';
import { HorseCatalogsService } from '../horse-catalogs/horse-catalogs.service';
import { BusinessMailService } from '../business-mail/business-mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('HorsesService - Handover & Progressive SLA QA', () => {
  let service: HorsesService;
  let mockPrisma: any;
  let mockMail: any;
  let mockAudit: any;

  const mockManager = {
    userId: 'mgr-1',
    fullName: 'Manager',
    email: 'mgr@tmec.vn',
    role: Role.CLUB_MANAGER,
  };

  const mockTrainer = {
    userId: 'trainer-1',
    fullName: 'HLV Tuấn',
    email: 'tuan@tmec.vn',
    role: Role.HEAD_TRAINER,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = {
      $transaction: jest.fn((work: (tx: any) => any) => work(mockPrisma)),
      $queryRaw: jest.fn().mockResolvedValue([]),
      horse: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      stallAllocation: {
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      horseHandoverRequest: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    mockMail = { emit: jest.fn() };
    mockAudit = { record: jest.fn() };

    service = new HorsesService(
      mockPrisma as unknown as PrismaService,
      mockAudit as unknown as AuditService,
      { next: jest.fn() } as unknown as CounterService,
      {} as unknown as HorseCatalogsService,
      { notifyUsers: jest.fn() } as unknown as NotificationsService,
      mockMail as unknown as BusinessMailService,
    );
  });

  describe('Assign Trainer QA Scenarios', () => {
    it('QA-HO-01: Chặn phân công khi chiến mã chưa được bố trí ô chuồng', async () => {
      mockPrisma.horse.findUnique.mockResolvedValue({
        id: 'h-1',
        name: 'Bạch Long',
        deletedAt: null,
        stallAllocations: [],
      });

      await expect(
        service.assignTrainer('h-1', { trainerUserId: 'trainer-1' }, mockManager as any),
      ).rejects.toThrow('chưa được xếp ô chuồng');
    });

    it('QA-HO-02: Chặn phân công khi HLV khác Barn với ô chuồng của ngựa (BARN_MISMATCH)', async () => {
      mockPrisma.horse.findUnique.mockResolvedValue({
        id: 'h-1',
        name: 'Bạch Long',
        deletedAt: null,
        stallAllocations: [
          {
            id: 'alloc-1',
            stall: { id: 's-1', zoneId: 'zone-barn-a', zoneRef: { name: 'Khu chuồng A' } },
          },
        ],
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'trainer-1',
        fullName: 'HLV Nam',
        role: Role.HEAD_TRAINER,
        status: UserStatus.ACTIVE,
        assignedBarnId: 'zone-barn-b', // Khác Barn A!
        assignedBarn: { name: 'Khu chuồng B' },
      });

      await expect(
        service.assignTrainer('h-1', { trainerUserId: 'trainer-1' }, mockManager as any),
      ).rejects.toThrow('trong cùng Khu chuồng');
    });

    it('QA-HO-03: Chặn phân công khi HLV đã chạm trần 8 chiến mã (TRAINER_CAPACITY_EXCEEDED)', async () => {
      mockPrisma.horse.findUnique.mockResolvedValue({
        id: 'h-1',
        name: 'Bạch Long',
        deletedAt: null,
        stallAllocations: [
          {
            id: 'alloc-1',
            stall: { id: 's-1', zoneId: 'zone-barn-a', zoneRef: { name: 'Khu chuồng A' } },
          },
        ],
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'trainer-1',
        fullName: 'HLV Tuấn',
        role: Role.HEAD_TRAINER,
        status: UserStatus.ACTIVE,
        assignedBarnId: 'zone-barn-a', // Cùng Barn A
      });
      mockPrisma.horse.count.mockResolvedValue(8); // Đã chạm trần 8 con

      await expect(
        service.assignTrainer('h-1', { trainerUserId: 'trainer-1' }, mockManager as any),
      ).rejects.toThrow('đã đạt định mức tối đa 8 chiến mã');
    });

    it('QA-HO-04: Thành công tạo yêu cầu bàn giao với SLA 48h và gửi mail', async () => {
      mockPrisma.horse.findUnique.mockResolvedValue({
        id: 'h-1',
        name: 'Bạch Long',
        horseCode: 'BL-01',
        deletedAt: null,
        stallAllocations: [
          {
            id: 'alloc-1',
            stall: { id: 's-1', zoneId: 'zone-barn-a', zoneRef: { name: 'Khu chuồng A' } },
          },
        ],
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'trainer-1',
        fullName: 'HLV Tuấn',
        role: Role.HEAD_TRAINER,
        status: UserStatus.ACTIVE,
        assignedBarnId: 'zone-barn-a',
      });
      mockPrisma.horse.count.mockResolvedValue(3); // 3/8 con
      mockPrisma.horseHandoverRequest.create.mockImplementation((args: any) => ({
        id: 'req-1',
        ...args.data,
      }));

      const res = await service.assignTrainer(
        'h-1',
        { trainerUserId: 'trainer-1', notes: 'Giao ngựa mới nhập' },
        mockManager as any,
      );

      expect(res.handoverId).toBe('req-1');
      expect(res.token).toBeDefined();
      expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now() + 47 * 3600 * 1000);
      expect(mockPrisma.horse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            trainerAssignmentStatus: TrainerAssignmentStatus.PENDING_ACCEPTANCE,
          }),
        }),
      );
      expect(mockMail.emit).toHaveBeenCalled();
    });
  });

  describe('Respond Handover & Progressive SLA QA Scenarios', () => {
    it('QA-HO-05: Thất bại khi token bàn giao đã quá hạn 48 giờ', async () => {
      const expiredDate = new Date(Date.now() - 3600 * 1000); // Đã hết hạn 1 tiếng trước
      mockPrisma.horseHandoverRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: HandoverStatus.PENDING,
        expiresAt: expiredDate,
      });

      await expect(
        service.respondHandover({ token: 'expired-token', action: HandoverAction.ACCEPT }),
      ).rejects.toThrow('Yêu cầu phân công đã hết hạn phản hồi (48 giờ).');
    });

    it('QA-HO-06: Tiếp nhận con đầu tiên (N=1) -> SLA lập giáo án đúng 3 ngày', async () => {
      const validUntil = new Date(Date.now() + 24 * 3600 * 1000);
      mockPrisma.horseHandoverRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        horseId: 'h-1',
        toTrainerId: 'trainer-1',
        fromManagerId: 'mgr-1',
        status: HandoverStatus.PENDING,
        expiresAt: validUntil,
        horse: { id: 'h-1', name: 'Bạch Long', horseCode: 'BL-01' },
        toTrainer: { fullName: 'HLV Tuấn', email: 'tuan@tmec.vn' },
        fromManager: { fullName: 'Manager', email: 'mgr@tmec.vn' },
      });

      // Hiện chưa có con nào chờ lập giáo án (waitingCount = 0)
      mockPrisma.horse.count.mockResolvedValue(0);

      const res = await service.respondHandover({ token: 'valid-token', action: HandoverAction.ACCEPT });

      expect(res.success).toBe(true);
      expect(res.action).toBe(HandoverAction.ACCEPT);
      // Hạn deadline = 3 ngày (+/- 1 phút)
      const expectedDeadlineMs = Date.now() + 3 * 24 * 60 * 60 * 1000;
      expect(Math.abs(res.planDeadlineAt!.getTime() - expectedDeadlineMs)).toBeLessThan(60000);

      expect(mockPrisma.horse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            trainerAssignmentStatus: TrainerAssignmentStatus.ASSIGNED,
          }),
        }),
      );
    });

    it('QA-HO-07: Tiếp nhận con thứ 2 (N=2) -> SLA lũy tiến đúng 5 ngày (3 + 1*2)', async () => {
      const validUntil = new Date(Date.now() + 24 * 3600 * 1000);
      mockPrisma.horseHandoverRequest.findUnique.mockResolvedValue({
        id: 'req-2',
        horseId: 'h-2',
        toTrainerId: 'trainer-1',
        fromManagerId: 'mgr-1',
        status: HandoverStatus.PENDING,
        expiresAt: validUntil,
        horse: { id: 'h-2', name: 'Xích Thố', horseCode: 'XT-02' },
        toTrainer: { fullName: 'HLV Tuấn', email: 'tuan@tmec.vn' },
        fromManager: { fullName: 'Manager', email: 'mgr@tmec.vn' },
      });

      // Đã có 1 con chờ lập giáo án (waitingCount = 1) -> 3 + 1*2 = 5 ngày
      mockPrisma.horse.count.mockResolvedValue(1);

      const res = await service.respondHandover({ token: 'valid-token-2', action: HandoverAction.ACCEPT });

      expect(res.success).toBe(true);
      const expectedDeadlineMs = Date.now() + 5 * 24 * 60 * 60 * 1000;
      expect(Math.abs(res.planDeadlineAt!.getTime() - expectedDeadlineMs)).toBeLessThan(60000);
    });

    it('QA-HO-08: Tiếp nhận con thứ 3 (N=3) -> SLA lũy tiến đúng 7 ngày (3 + 2*2)', async () => {
      const validUntil = new Date(Date.now() + 24 * 3600 * 1000);
      mockPrisma.horseHandoverRequest.findUnique.mockResolvedValue({
        id: 'req-3',
        horseId: 'h-3',
        toTrainerId: 'trainer-1',
        fromManagerId: 'mgr-1',
        status: HandoverStatus.PENDING,
        expiresAt: validUntil,
        horse: { id: 'h-3', name: 'Ô Truy', horseCode: 'OT-03' },
        toTrainer: { fullName: 'HLV Tuấn', email: 'tuan@tmec.vn' },
        fromManager: { fullName: 'Manager', email: 'mgr@tmec.vn' },
      });

      // Đã có 2 con chờ lập giáo án (waitingCount = 2) -> 3 + 2*2 = 7 ngày
      mockPrisma.horse.count.mockResolvedValue(2);

      const res = await service.respondHandover({ token: 'valid-token-3', action: HandoverAction.ACCEPT });

      expect(res.success).toBe(true);
      const expectedDeadlineMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
      expect(Math.abs(res.planDeadlineAt!.getTime() - expectedDeadlineMs)).toBeLessThan(60000);
    });

    it('QA-HO-09: HLV từ chối tiếp nhận -> Cập nhật DECLINED, lưu lý do và thông báo Quản lý', async () => {
      const validUntil = new Date(Date.now() + 24 * 3600 * 1000);
      mockPrisma.horseHandoverRequest.findUnique.mockResolvedValue({
        id: 'req-4',
        horseId: 'h-4',
        toTrainerId: 'trainer-1',
        fromManagerId: 'mgr-1',
        status: HandoverStatus.PENDING,
        expiresAt: validUntil,
        horse: { id: 'h-4', name: 'Phi Yến', horseCode: 'PY-04' },
        toTrainer: { fullName: 'HLV Tuấn', email: 'tuan@tmec.vn' },
        fromManager: { fullName: 'Manager', email: 'mgr@tmec.vn' },
      });

      const res = await service.respondHandover({
        token: 'valid-token-4',
        action: HandoverAction.REJECT,
        declineReason: 'HLV đang bận đợt tập huấn thi đấu quốc gia',
      });

      expect(res.success).toBe(true);
      expect(res.action).toBe(HandoverAction.REJECT);
      expect(mockPrisma.horse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            trainerAssignmentStatus: TrainerAssignmentStatus.DECLINED,
            trainerDeclineReason: 'HLV đang bận đợt tập huấn thi đấu quốc gia',
          }),
        }),
      );
      expect(mockMail.emit).toHaveBeenCalled();
    });
  });
});
