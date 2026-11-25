import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, UserStatus } from '@prisma/client';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { OtpService } from '../auth/otp.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('AccountsService - Barn Staffing & Reassignment QA', () => {
  const manager = { id: 'mgr-1', fullName: 'Manager', email: 'mgr@tmec.vn', role: Role.CLUB_MANAGER };
  const actor = { id: 'mgr-1', name: 'Manager' };

  let mockPrisma: any;
  let service: AccountsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = {
      $queryRaw: jest.fn(),
      $transaction: jest.fn((work: (tx: any) => any) => work(mockPrisma)),
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      stallZone: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      horse: {
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      trainingPlan: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn(),
      },
      otpCode: { deleteMany: jest.fn() },
      resetToken: { deleteMany: jest.fn() },
      loginAttempt: { deleteMany: jest.fn() },
    };

    const mockMail = { send: jest.fn() };
    const mockAudit = { record: jest.fn() };
    const mockAuth = { revokeAllTokens: jest.fn() };
    const mockOtp = { issue: jest.fn().mockResolvedValue({ id: 'otp-1' }), assertCooldown: jest.fn() };
    const mockNotifications = { notifyUsers: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn() } as unknown as ConfigService;

    service = new AccountsService(
      mockPrisma as unknown as PrismaService,
      mockMail as unknown as MailService,
      mockAudit as unknown as AuditService,
      mockAuth as unknown as AuthService,
      mockOtp as unknown as OtpService,
      config,
      mockNotifications as unknown as NotificationsService,
    );
  });

  describe('Invite Trainer Barn Constraints', () => {
    it('QA-BARN-01: Thất bại khi tạo HLV mà không chọn Barn', async () => {
      await expect(
        service.invite(actor, {
          fullName: 'Nguyễn Văn Huấn',
          email: 'huan@gmail.com',
          role: Role.HEAD_TRAINER,
        } as any),
      ).rejects.toThrow('Vui lòng chọn Khu chuồng phụ trách cho Huấn luyện viên trưởng.');
    });

    it('QA-BARN-02: Thất bại khi tạo HLV vào Barn đã đủ 2/2 HLV', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.stallZone.findUnique.mockResolvedValue({ id: 'zone-a', name: 'Khu chuồng A' });
      mockPrisma.user.count.mockResolvedValue(2); // Đã đủ 2 HLV

      await expect(
        service.invite(actor, {
          fullName: 'Nguyễn Văn Huấn',
          email: 'huan@gmail.com',
          role: Role.HEAD_TRAINER,
          assignedBarnId: 'zone-a',
        } as any),
      ).rejects.toThrow('Khu chuồng này đã đủ tối đa 2 Huấn luyện viên phụ trách.');
    });

    it('QA-BARN-03: Thành công tạo HLV khi Barn mới có 1/2 HLV', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.stallZone.findUnique.mockResolvedValue({ id: 'zone-a', name: 'Khu chuồng A' });
      mockPrisma.user.count.mockResolvedValue(1); // 1 HLV
      mockPrisma.user.create.mockResolvedValue({
        id: 'trainer-2',
        fullName: 'Nguyễn Văn Huấn',
        email: 'huan@gmail.com',
        role: Role.HEAD_TRAINER,
        assignedBarnId: 'zone-a',
        status: UserStatus.INVITED,
      });

      const result = await service.invite(actor, {
        fullName: 'Nguyễn Văn Huấn',
        email: 'huan@gmail.com',
        role: Role.HEAD_TRAINER,
        assignedBarnId: 'zone-a',
      } as any);

      expect(result.id).toBe('trainer-2');
      expect(result.assignedBarnId).toBe('zone-a');
    });
  });

  describe('Reassign Trainer Barn Constraints', () => {
    const currentTrainer = {
      id: 'trainer-1',
      fullName: 'HLV Tuấn',
      email: 'tuan@tmec.vn',
      role: Role.HEAD_TRAINER,
      assignedBarnId: 'zone-a',
      status: UserStatus.ACTIVE,
    };

    it('QA-BARN-04: Thất bại khi chuyển HLV sang Barn đã đủ 2/2 HLV', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(currentTrainer);
      mockPrisma.stallZone.findUnique.mockResolvedValue({ id: 'zone-b', name: 'Khu chuồng B' });
      mockPrisma.user.count.mockResolvedValue(2); // Barn B đã đủ 2 HLV

      await expect(
        service.assignTrainerBarn(actor, 'trainer-1', {
          targetBarnId: 'zone-b',
        }),
      ).rejects.toThrow('Khu chuồng Khu chuồng B đã đủ tối đa 2 Huấn luyện viên phụ trách.');
    });

    it('QA-BARN-05: Thất bại khi HLV đang có ngựa mà không chỉ định HLV nhận bàn giao cùng Barn', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(currentTrainer);
      mockPrisma.stallZone.findUnique.mockResolvedValue({ id: 'zone-b', name: 'Khu chuồng B' });
      mockPrisma.user.count.mockResolvedValue(1); // Barn B mới có 1 HLV
      mockPrisma.trainingPlan.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]); // Đang có 3 ngựa

      await expect(
        service.assignTrainerBarn(actor, 'trainer-1', {
          targetBarnId: 'zone-b',
        }),
      ).rejects.toThrow('Vui lòng chọn Huấn luyện viên đồng nghiệp trong cùng khu chuồng để bàn giao');
    });

    it('QA-BARN-06: Thất bại khi HLV nhận bàn giao bị quá tải trần 8 con', async () => {
      const colleagueTrainer = {
        id: 'trainer-colleague',
        fullName: 'HLV Quân',
        role: Role.HEAD_TRAINER,
        assignedBarnId: 'zone-a',
        status: UserStatus.ACTIVE,
      };

      mockPrisma.user.findUnique
        .mockResolvedValueOnce(currentTrainer)
        .mockResolvedValueOnce(colleagueTrainer);
      mockPrisma.stallZone.findUnique.mockResolvedValue({ id: 'zone-b', name: 'Khu chuồng B' });
      mockPrisma.user.count.mockResolvedValue(1); // Barn B mới có 1 HLV
      mockPrisma.trainingPlan.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]); // HLV Tuấn có 3 ngựa
      mockPrisma.trainingPlan.count.mockResolvedValue(6); // Đồng nghiệp đã có 6 con -> 6 + 3 = 9 > 8!

      await expect(
        service.assignTrainerBarn(actor, 'trainer-1', {
          targetBarnId: 'zone-b',
          handoverTrainerId: 'trainer-colleague',
        }),
      ).rejects.toThrow('không đủ sức chứa tiếp nhận');
    });

    it('QA-BARN-07: Thành công điều chuyển Barn và bàn giao toàn bộ chiến mã trong transaction', async () => {
      const colleagueTrainer = {
        id: 'trainer-colleague',
        fullName: 'HLV Quân',
        role: Role.HEAD_TRAINER,
        assignedBarnId: 'zone-a',
        status: UserStatus.ACTIVE,
      };

      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'trainer-1') return Promise.resolve(currentTrainer);
        if (where.id === 'trainer-colleague') return Promise.resolve(colleagueTrainer);
        return Promise.resolve(null);
      });
      mockPrisma.stallZone.findUnique.mockResolvedValue({ id: 'zone-b', name: 'Khu chuồng B' });
      mockPrisma.user.count.mockResolvedValue(1); // Barn B mới có 1 HLV
      mockPrisma.trainingPlan.findMany.mockResolvedValue([
        { id: 'p1', horseId: 'h1' },
        { id: 'p2', horseId: 'h2' },
      ]); // HLV Tuấn có 2 ngựa
      mockPrisma.trainingPlan.count.mockResolvedValue(3); // Đồng nghiệp có 3 con -> 3 + 2 = 5 <= 8 (Hợp lệ)
      mockPrisma.user.update.mockResolvedValue({
        ...currentTrainer,
        assignedBarnId: 'zone-b',
      });

      const res = await service.assignTrainerBarn(actor, 'trainer-1', {
        targetBarnId: 'zone-b',
        handoverTrainerId: 'trainer-colleague',
      });

      expect(res.trainer.id).toBe('trainer-1');
      expect(mockPrisma.horse.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['h1', 'h2'] } },
        data: expect.objectContaining({
          assignedTrainerId: 'trainer-colleague',
          trainerAssignmentStatus: 'ASSIGNED',
        }),
      });
      expect(mockPrisma.trainingPlan.updateMany).toHaveBeenCalled();
    });
  });
});
